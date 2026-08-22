// SPDX-License-Identifier: AGPL-3.0-only

import { gzipString, gunzipToString } from '../../core/persistence/rv-gzip-utils';
import type { DESSnapshot } from './rv-des-snapshot';
import {
  createExperimentMeta,
  type ExperimentMeta,
  type ParamOverride,
  type RunResult,
  type SnapshotMeta,
} from './rv-des-experiment-model';

const DB_NAME = 'rv-des-experiments';
const DB_VERSION = 1;
const MANIFESTS = 'manifests';
const SNAPSHOTS = 'snapshots';
const manifestKey = (model: string, exp: string): string => JSON.stringify([model, exp]);
const snapshotKey = (model: string, exp: string, repl: number, time: number): string => JSON.stringify([model, exp, repl, time]);

interface SnapshotRow { key: string; model: string; exp: string; repl: number; time: number; snapshot: DESSnapshot }

export interface SnapshotStore {
  recordRun(model: string, exp: string, seed: number, run: RunResult, opts?: { maxRuns?: number }): Promise<number>;
  writeSnapshot(
    model: string, exp: string, repl: number, time: number, snapshot: DESSnapshot,
    opts?: { replicationSeed?: number; label?: string },
  ): Promise<void>;
  listSnapshots(model: string, exp: string, repl: number): Promise<SnapshotMeta[]>;
  deleteSnapshot(model: string, exp: string, repl: number, time: number): Promise<void>;
}

export type ManifestMetaPatch = Partial<{
  projectId: string;
  glbHash: string;
  baseSeed: number;
  endTime: number;
  statResetTime: number;
  replicationCount: number;
  paramOverrides: ParamOverride[];
  paramScript: string;
  enabled: boolean;
}>;

export class ManifestVersionConflictError extends Error {
  constructor() { super('experiment manifest version conflict'); this.name = 'ManifestVersionConflictError'; }
}

export class IndexedDBSnapshotStore implements SnapshotStore {
  private dbPromise: Promise<IDBDatabase>;
  private writes: Promise<unknown> = Promise.resolve();

  constructor() { this.dbPromise = openDb(); }

  async close(): Promise<void> { (await this.dbPromise).close(); }

  async listIndex(): Promise<Array<{ model: string; experiment: string }>> {
    const rows = await this.getAll<ExperimentMeta>(MANIFESTS);
    return rows.map((meta) => ({ model: meta.model, experiment: meta.experiment }));
  }

  async readManifest(model: string, exp: string): Promise<ExperimentMeta | null> {
    return clone(await this.get<ExperimentMeta>(MANIFESTS, manifestKey(model, exp)) ?? null);
  }

  writeManifest(meta: ExperimentMeta): Promise<void> {
    return this.enqueue(async () => {
      const existing = await this.get<ExperimentMeta>(MANIFESTS, manifestKey(meta.model, meta.experiment));
      if (existing && existing.version !== meta.version) throw new ManifestVersionConflictError();
      await this.put(MANIFESTS, { ...clone(meta), version: (existing?.version ?? meta.version) + 1 }, manifestKey(meta.model, meta.experiment));
    });
  }

  writeSnapshot(
    model: string, exp: string, repl: number, time: number, snapshot: DESSnapshot,
    opts: { replicationSeed?: number; label?: string } = {},
  ): Promise<void> {
    return this.enqueue(async () => {
      const key = snapshotKey(model, exp, repl, time);
      await this.put(SNAPSHOTS, { key, model, exp, repl, time, snapshot: clone(snapshot) } satisfies SnapshotRow, key);
      const meta = await this.readOrCreate(model, exp, opts.replicationSeed ?? snapshot.masterSeed ?? 42);
      let replication = meta.replications.find((candidate) => candidate.index === repl);
      if (!replication) {
        replication = { index: repl, masterSeed: opts.replicationSeed ?? snapshot.masterSeed ?? meta.baseSeed, snapshots: [] };
        meta.replications.push(replication);
      } else if (opts.replicationSeed !== undefined) replication.masterSeed = opts.replicationSeed;
      const saved: SnapshotMeta = { simTime: time, savedAt: Date.now(), ...(opts.label ? { label: opts.label } : {}) };
      replication.snapshots = [...replication.snapshots.filter((candidate) => candidate.simTime !== time), saved]
        .sort((a, b) => a.simTime - b.simTime);
      await this.save(meta);
    });
  }

  async readSnapshot(model: string, exp: string, repl: number, time: number): Promise<DESSnapshot | null> {
    const row = await this.get<SnapshotRow>(SNAPSHOTS, snapshotKey(model, exp, repl, time));
    return clone(row?.snapshot ?? null);
  }
  async listSnapshots(model: string, exp: string, repl: number): Promise<SnapshotMeta[]> {
    return clone((await this.readManifest(model, exp))?.replications.find((candidate) => candidate.index === repl)?.snapshots ?? []);
  }

  deleteSnapshot(model: string, exp: string, repl: number, time: number): Promise<void> {
    return this.enqueue(async () => {
      await this.delete(SNAPSHOTS, snapshotKey(model, exp, repl, time));
      const meta = await this.readManifest(model, exp); if (!meta) return;
      const replication = meta.replications.find((candidate) => candidate.index === repl);
      if (replication) replication.snapshots = replication.snapshots.filter((candidate) => candidate.simTime !== time);
      await this.save(meta);
    });
  }
  deleteReplication(model: string, exp: string, repl: number): Promise<void> {
    return this.enqueue(async () => {
      await this.deleteRows((row) => row.model === model && row.exp === exp && row.repl === repl);
      const meta = await this.readManifest(model, exp); if (!meta) return;
      meta.replications = meta.replications.filter((candidate) => candidate.index !== repl);
      await this.save(meta);
    });
  }
  deleteExperiment(model: string, exp: string): Promise<void> {
    return this.enqueue(async () => {
      await this.deleteRows((row) => row.model === model && row.exp === exp);
      await this.delete(MANIFESTS, manifestKey(model, exp));
    });
  }
  renameExperiment(model: string, exp: string, newName: string): Promise<void> {
    return this.enqueue(async () => {
      const meta = await this.readManifest(model, exp); if (!meta) return;
      if (await this.readManifest(model, newName)) throw new Error('experiment already exists');
      const rows = (await this.getAll<SnapshotRow>(SNAPSHOTS)).filter((row) => row.model === model && row.exp === exp);
      for (const row of rows) {
        await this.delete(SNAPSHOTS, row.key);
        row.exp = newName; row.key = snapshotKey(model, newName, row.repl, row.time);
        await this.put(SNAPSHOTS, row, row.key);
      }
      await this.delete(MANIFESTS, manifestKey(model, exp));
      meta.experiment = newName; meta.version = 0;
      await this.save(meta);
    });
  }

  patchManifestMeta(model: string, exp: string, patch: ManifestMetaPatch): Promise<void> {
    return this.enqueue(async () => {
      const meta = await this.readOrCreate(model, exp, patch.baseSeed ?? 42);
      if (patch.projectId !== undefined) meta.projectId = patch.projectId;
      if (patch.glbHash !== undefined) meta.glbHash = patch.glbHash;
      if (patch.baseSeed !== undefined) meta.baseSeed = patch.baseSeed >>> 0;
      if (patch.endTime !== undefined) meta.endTime = patch.endTime;
      if (patch.statResetTime !== undefined) meta.statResetTime = patch.statResetTime;
      if (patch.replicationCount !== undefined) meta.replicationCount = Math.max(1, Math.floor(patch.replicationCount));
      if (patch.paramOverrides !== undefined) meta.paramOverrides = clone(patch.paramOverrides);
      if (patch.paramScript !== undefined) meta.paramScript = patch.paramScript;
      if (patch.enabled !== undefined) meta.enabled = patch.enabled;
      await this.save(meta);
    });
  }

  recordRun(model: string, exp: string, seed: number, run: RunResult, opts: { maxRuns?: number } = {}): Promise<number> {
    return this.enqueue(async () => {
      const meta = await this.readOrCreate(model, exp, seed);
      let replication = meta.replications.find((candidate) => candidate.masterSeed === seed);
      if (!replication) {
        const index = Math.max(-1, ...meta.replications.map((candidate) => candidate.index)) + 1;
        replication = { index, masterSeed: seed, snapshots: [] };
        meta.replications.push(replication);
      }
      Object.assign(replication, clone(run));
      const maxRuns = Math.max(1, opts.maxRuns ?? 100);
      const archived = meta.replications.filter((candidate) => candidate.status !== undefined)
        .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
      const removed = archived.slice(0, Math.max(0, archived.length - maxRuns));
      for (const old of removed) {
        await this.deleteRows((row) => row.model === model && row.exp === exp && row.repl === old.index);
        meta.replications = meta.replications.filter((candidate) => candidate !== old);
      }
      await this.save(meta);
      return replication.index;
    });
  }

  async exportExperiment(model: string, exp: string): Promise<Blob> {
    const manifest = await this.readManifest(model, exp);
    if (!manifest) throw new Error('experiment not found');
    const rows = (await this.getAll<SnapshotRow>(SNAPSHOTS)).filter((row) => row.model === model && row.exp === exp);
    const lines = [JSON.stringify({ type: 'rv-des-experiment', manifest }), ...rows.map((row) => JSON.stringify({ type: 'snapshot', row }))];
    return new Blob([await gzipString(lines.join('\n'))], { type: 'application/gzip' });
  }
  async importExperiment(file: Blob): Promise<{ model: string; exp: string }> {
    try {
      const lines = (await gunzipToString(await file.arrayBuffer())).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
      const header = lines[0];
      if (header?.type !== 'rv-des-experiment' || !header.manifest) throw new Error('not a rv-des-experiment file');
      const original = clone(header.manifest as ExperimentMeta);
      let exp = original.experiment;
      for (let copy = 2; await this.readManifest(original.model, exp); copy++) exp = `${original.experiment} (${copy})`;
      original.experiment = exp; original.version = 0;
      await this.writeManifest(original);
      for (const line of lines.slice(1)) {
        if (line.type !== 'snapshot') continue;
        const row = line.row as unknown as SnapshotRow;
        await this.writeSnapshot(original.model, exp, row.repl, row.time, row.snapshot, {
          replicationSeed: original.replications.find((candidate) => candidate.index === row.repl)?.masterSeed,
          label: original.replications.find((candidate) => candidate.index === row.repl)?.snapshots.find((candidate) => candidate.simTime === row.time)?.label,
        });
      }
      return { model: original.model, exp };
    } catch (error) {
      if (error instanceof Error && /not a rv-des-experiment/.test(error.message)) throw error;
      throw new Error('not a rv-des-experiment file');
    }
  }

  async estimateStorage(): Promise<{ usedBytes: number; quotaBytes: number }> {
    const estimate = await navigator.storage?.estimate?.();
    return { usedBytes: estimate?.usage ?? 0, quotaBytes: estimate?.quota ?? 0 };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writes.then(operation, operation);
    this.writes = run.then(() => undefined, () => undefined);
    return run;
  }
  private async readOrCreate(model: string, exp: string, seed: number): Promise<ExperimentMeta> {
    return await this.readManifest(model, exp) ?? createExperimentMeta({ model, experiment: exp, baseSeed: seed });
  }
  private async save(meta: ExperimentMeta): Promise<void> {
    meta.version++;
    await this.put(MANIFESTS, clone(meta), manifestKey(meta.model, meta.experiment));
  }
  private async deleteRows(predicate: (row: SnapshotRow) => boolean): Promise<void> {
    for (const row of await this.getAll<SnapshotRow>(SNAPSHOTS)) if (predicate(row)) await this.delete(SNAPSHOTS, row.key);
  }
  private async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.dbPromise;
    return request<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
  }
  private async getAll<T>(store: string): Promise<T[]> {
    const db = await this.dbPromise;
    return request<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
  }
  private async put(store: string, value: unknown, key: IDBValidKey): Promise<void> {
    const db = await this.dbPromise;
    await transactionDone(db.transaction(store, 'readwrite'), (tx) => { tx.objectStore(store).put(value, key); });
  }
  private async delete(store: string, key: IDBValidKey): Promise<void> {
    const db = await this.dbPromise;
    await transactionDone(db.transaction(store, 'readwrite'), (tx) => { tx.objectStore(store).delete(key); });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS);
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS);
    };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function transactionDone(tx: IDBTransaction, operation: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    operation(tx); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function clone<T>(value: T): T { return value === null || value === undefined ? value : structuredClone(value); }
