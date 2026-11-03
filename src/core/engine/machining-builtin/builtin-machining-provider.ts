// SPDX-License-Identifier: AGPL-3.0-only

/**
 * BuiltinMachiningProvider — main-thread side of the community CSG kernel
 * (ADR-0026). Implements the machining contract against the worker in
 * `csg-worker.ts`; the worker is created lazily by `init()`, i.e. only when a
 * model actually contains a MachiningVolume.
 *
 * Kept free of the kernel itself: this file only speaks the message protocol,
 * so the kernel ships once (in the worker bundle).
 */

import {
  MACHINING_MAX_PENDING_JOBS,
  type MachiningChunkMeshBatch, type MachiningGridDesc, type MachiningGridHandle, type MachiningProvider,
  type MachiningSubmitResult, type MachiningSubtractAck, type MachiningSubtractJob, type MachiningUnsubscribe,
} from '../rv-machining-registry';
import type { CsgRequest, CsgResponse } from './csg-worker-core';

/** The slice of `Worker` the provider uses (tests inject an in-process port). */
export interface CsgWorkerPort {
  postMessage(message: CsgRequest): void;
  terminate(): void;
  onmessage: ((event: { data: CsgResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

function defaultWorker(): CsgWorkerPort {
  return new Worker(new URL('./csg-worker.ts', import.meta.url), { type: 'module', name: 'rv-csg' }) as unknown as CsgWorkerPort;
}

interface GridEntry {
  handle: MachiningGridHandle;
  pending: number;
  seq: number;
  destroyed: boolean;
  acks: Set<(ack: MachiningSubtractAck) => void>;
  chunks: Set<(batch: MachiningChunkMeshBatch) => void>;
  resets: Map<number, () => void>;
}

export class BuiltinMachiningProvider implements MachiningProvider {
  private _ready = false;
  private _failed = false;
  private _worker: CsgWorkerPort | null = null;
  private _init: Promise<void> | null = null;
  private _nextId = 1;
  private _nextToken = 1;
  private readonly _grids = new Map<number, GridEntry>();
  private readonly _creates = new Map<number, { resolve: (h: MachiningGridHandle) => void; reject: (e: Error) => void }>();
  private readonly _counts = new Map<number, (n: number) => void>();

  constructor(private readonly createWorker: () => CsgWorkerPort = defaultWorker) {}

  get ready(): boolean { return this._ready; }
  get failed(): boolean { return this._failed; }

  init(): Promise<void> {
    if (this._init) return this._init;
    this._init = new Promise<void>((resolve, reject) => {
      if (this._failed) { reject(new Error('machining worker failed')); return; }
      let worker: CsgWorkerPort;
      try {
        worker = this.createWorker();
      } catch (error) {
        this._fail();
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this._worker = worker;
      worker.onerror = () => {
        const wasReady = this._ready;
        this._fail();
        if (!wasReady) reject(new Error('machining worker failed to start'));
      };
      worker.onmessage = (event) => {
        if (event.data.type === 'ready') { this._ready = true; resolve(); return; }
        this._receive(event.data);
      };
    });
    return this._init;
  }

  dispose(): void {
    this._worker?.terminate();
    this._worker = null;
    this._ready = false;
    this._init = null;
    for (const c of this._creates.values()) c.reject(new Error('machining provider disposed'));
    this._creates.clear();
    for (const entry of this._grids.values()) this._dropGrid(entry);
    this._grids.clear();
  }

  createGrid(desc: MachiningGridDesc): Promise<MachiningGridHandle> {
    if (this._failed || !this._worker) return Promise.reject(new Error('machining worker is not running'));
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._creates.set(id, { resolve, reject });
      this._send({ type: 'create', id, desc });
    });
  }

  destroyGrid(handle: MachiningGridHandle): Promise<void> {
    const entry = this._grids.get(handle.id);
    if (entry && !entry.destroyed) {
      this._dropGrid(entry);
      this._grids.delete(handle.id);
      this._send({ type: 'destroy', id: handle.id });
    }
    return Promise.resolve();
  }

  resetGrid(handle: MachiningGridHandle): Promise<void> {
    const entry = this._grids.get(handle.id);
    if (!entry || entry.destroyed || this._failed) return Promise.reject(new Error('machining grid is not available'));
    entry.pending = 0;
    const token = this._nextToken++;
    return new Promise((resolve) => {
      entry.resets.set(token, resolve);
      this._send({ type: 'reset', id: handle.id, token });
    });
  }

  submitSubtract(handle: MachiningGridHandle, job: MachiningSubtractJob): MachiningSubmitResult {
    const entry = this._grids.get(handle.id);
    if (!entry || entry.destroyed || this._failed || !this._worker) return { accepted: false, reason: 'closed' };
    if (entry.pending >= MACHINING_MAX_PENDING_JOBS) return { accepted: false, reason: 'backlog' };
    const seq = entry.seq++;
    entry.pending++;
    this._send({ type: 'subtract', id: handle.id, seq, segments: job.segments });
    return { accepted: true, seq };
  }

  onAck(handle: MachiningGridHandle, cb: (ack: MachiningSubtractAck) => void): MachiningUnsubscribe {
    const entry = this._grids.get(handle.id);
    entry?.acks.add(cb);
    return () => { entry?.acks.delete(cb); };
  }

  onChunkMeshes(handle: MachiningGridHandle, cb: (batch: MachiningChunkMeshBatch) => void): MachiningUnsubscribe {
    const entry = this._grids.get(handle.id);
    entry?.chunks.add(cb);
    return () => { entry?.chunks.delete(cb); };
  }

  countSolid(handle: MachiningGridHandle): Promise<number> {
    if (!this._grids.has(handle.id) || this._failed) return Promise.resolve(0);
    const token = this._nextToken++;
    return new Promise((resolve) => {
      this._counts.set(token, resolve);
      this._send({ type: 'count', id: handle.id, token });
    });
  }

  private _send(message: CsgRequest): void {
    try {
      this._worker?.postMessage(message);
    } catch {
      this._fail();
    }
  }

  private _receive(msg: CsgResponse): void {
    switch (msg.type) {
      case 'created': {
        const pending = this._creates.get(msg.id);
        this._creates.delete(msg.id);
        const handle: MachiningGridHandle = { id: msg.id, ...msg.info };
        if (!pending) { this._send({ type: 'destroy', id: msg.id }); return; }
        this._grids.set(msg.id, { handle, pending: 0, seq: 0, destroyed: false, acks: new Set(), chunks: new Set(), resets: new Map() });
        pending.resolve(handle);
        return;
      }
      case 'create-failed': {
        const pending = this._creates.get(msg.id);
        this._creates.delete(msg.id);
        pending?.reject(new Error(msg.message));
        return;
      }
      case 'ack': {
        const entry = this._grids.get(msg.id);
        if (!entry) return;
        if (msg.ack.seq >= 0) entry.pending = Math.max(0, entry.pending - 1);
        for (const cb of [...entry.acks]) cb(msg.ack);
        return;
      }
      case 'chunks': {
        const entry = this._grids.get(msg.id);
        if (!entry) return;
        for (const cb of [...entry.chunks]) cb(msg.batch);
        return;
      }
      case 'reset-done': {
        const entry = this._grids.get(msg.id);
        const done = entry?.resets.get(msg.token);
        entry?.resets.delete(msg.token);
        done?.();
        return;
      }
      case 'count-result': {
        const done = this._counts.get(msg.token);
        this._counts.delete(msg.token);
        done?.(msg.count);
        return;
      }
      case 'fatal':
        this._fail();
        return;
      case 'ready':
        return;
    }
  }

  /** A reset barrier of a destroyed grid resolves (its volume is going away anyway). */
  private _dropGrid(entry: GridEntry): void {
    entry.destroyed = true;
    entry.acks.clear();
    entry.chunks.clear();
    for (const done of entry.resets.values()) done();
    entry.resets.clear();
  }

  /** Permanent fail-off: every call is a no-op afterwards. */
  private _fail(): void {
    this._failed = true;
    this._ready = false;
    for (const c of this._creates.values()) c.reject(new Error('machining worker failed'));
    this._creates.clear();
    for (const done of this._counts.values()) done(0);
    this._counts.clear();
    for (const entry of this._grids.values()) this._dropGrid(entry);
    this._grids.clear();
    try { this._worker?.terminate(); } catch { /* already gone */ }
    this._worker = null;
  }
}
