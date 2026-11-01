// SPDX-License-Identifier: AGPL-3.0-only

/**
 * server-backend — a project stored on the Appliance, one Forgejo repository per
 * project, every save one commit authored by the signed-in user (ADR-0024).
 *
 * Layout mirrors the folder backend: `project.json` (manifest), scenes at
 * `scenes/<id>.scene.glb`, blobs at their project-relative path.
 *
 * ## Two revisions, one contract
 *
 * The backend contract's revision is the SHA-256 of the bytes (rv-scene-record).
 * The server's optimistic-concurrency token is the Git blob SHA. Both are kept per
 * path: the content digest answers `expectedRevision`, the server token is sent
 * as the base of the next write, and a server 409 — someone else committed in
 * between — surfaces as the same `SceneRevisionConflictError` every backend uses.
 */

import {
  assertRevisionPrecondition,
  glbSceneRecord,
  revisionOfBytes,
  SceneRevisionConflictError,
  type SceneRecord,
  type SceneRevision,
  type SceneWrite,
} from '../rv-scene-record';
import { assertReadableScenePath } from '../rv-legacy-format';
import { assetDocumentsOf, readDocuments, type DocumentStat } from '../rv-project-documents';
import type { RvDocumentEntry, RvProject, RvProjectAssetEntry } from '../rv-project-types';
import { assertWritable, BackendNotWritableError, WriteQueue, type ProjectBackend, type ResolvedBackendBlob, type WriteBlobOptions } from './project-backend';

const MANIFEST = 'project.json';

export interface ServerBackendOptions {
  /** Same-origin project API base, e.g. `/api/projects/v1`. */
  baseUrl: string;
  /** Whether the signed-in role may save (engineer+). The server decides regardless. */
  writable: boolean;
  /** CSRF token of the current session. */
  csrf: () => string | null;
  fetchImpl?: typeof fetch;
}

/** A save the server refused for a reason other than a revision conflict. */
export class ServerProjectError extends Error {
  constructor(readonly status: number, readonly code: string, readonly relPath: string) {
    super(`Server project request for "${relPath}" failed: ${code} (HTTP ${status}).`);
    this.name = 'ServerProjectError';
  }
}

interface Known { serverRevision: string; digest: SceneRevision }

function sceneIdOfPath(relPath: string): string {
  const last = (relPath ?? '').trim().split('/').pop() ?? '';
  return last.replace(/\.scene\.glb$/i, '');
}

function normalise(relPath: string): string {
  return (relPath ?? '').trim().replace(/^\/+/, '');
}

export class ServerBackend implements ProjectBackend {
  readonly kind = 'server' as const;
  readonly id: string;
  readonly writable: boolean;
  private readonly _projectId: string;
  private readonly _base: string;
  private readonly _csrf: () => string | null;
  private readonly _fetch: typeof fetch;
  private readonly _writes = new WriteQueue();
  private readonly _known = new Map<string, Known>();
  private _active = false;

  constructor(projectId: string, opts: ServerBackendOptions) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectId)) throw new Error(`Invalid server project id "${projectId}".`);
    if (!opts.baseUrl.startsWith('/') || opts.baseUrl.startsWith('//')) throw new Error('Server project API must be same-origin.');
    this._projectId = projectId;
    this._base = opts.baseUrl.replace(/\/$/, '');
    this.writable = opts.writable;
    this._csrf = opts.csrf;
    this._fetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.id = `server:${projectId}`;
  }

  get isActive(): boolean { return this._active; }
  get projectId(): string { return this._projectId; }

  private _url(relPath: string): string {
    return `${this._base}/projects/${this._projectId}/files/${normalise(relPath).split('/').map(encodeURIComponent).join('/')}`;
  }

  private async _get(relPath: string): Promise<{ bytes: Uint8Array; known: Known } | null> {
    const response = await this._fetch(this._url(relPath), { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
    if (response.status === 404) { this._known.delete(normalise(relPath)); return null; }
    if (!response.ok) throw new ServerProjectError(response.status, await errorCode(response), relPath);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const known = { serverRevision: response.headers.get('x-rv-revision') ?? '', digest: await revisionOfBytes(bytes) };
    this._known.set(normalise(relPath), known);
    return { bytes, known };
  }

  /** The current state of `relPath` for a precondition check (null = does not exist). */
  private async _current(relPath: string): Promise<Known | null> {
    return this._known.get(normalise(relPath)) ?? (await this._get(relPath))?.known ?? null;
  }

  private async _put(relPath: string, bytes: Uint8Array, expected: SceneRevision | null | undefined, requireActive = true): Promise<SceneRevision> {
    if (requireActive) assertWritable(this);
    else if (!this.writable) throw new BackendNotWritableError(this.id, 'read-only');
    const current = await this._current(relPath);
    assertRevisionPrecondition(relPath, expected, current?.digest ?? null);
    const headers: Record<string, string> = { 'content-type': 'application/octet-stream', 'x-csrf-token': this._csrf() ?? '' };
    if (current) headers['x-rv-base-revision'] = current.serverRevision;
    const response = await this._fetch(this._url(relPath), { method: 'PUT', credentials: 'same-origin', redirect: 'error', headers, body: new Blob([new Uint8Array(bytes)]) });
    if (response.status === 409) {
      this._known.delete(normalise(relPath));
      throw new SceneRevisionConflictError(relPath, current?.digest ?? null, null);
    }
    if (!response.ok) throw new ServerProjectError(response.status, await errorCode(response), relPath);
    const body = await response.json() as { revision?: string };
    const digest = await revisionOfBytes(bytes);
    this._known.set(normalise(relPath), { serverRevision: body.revision ?? '', digest });
    return digest;
  }

  private async _delete(relPath: string): Promise<void> {
    assertWritable(this);
    const current = await this._current(relPath);
    if (!current) return;
    const response = await this._fetch(this._url(relPath), {
      method: 'DELETE', credentials: 'same-origin', redirect: 'error',
      headers: { 'x-csrf-token': this._csrf() ?? '', 'x-rv-base-revision': current.serverRevision },
    });
    this._known.delete(normalise(relPath));
    if (response.status === 409) throw new SceneRevisionConflictError(relPath, current.digest, null);
    if (!response.ok && response.status !== 404) throw new ServerProjectError(response.status, await errorCode(response), relPath);
  }

  // ── Manifest ──

  async readManifest(): Promise<RvProject | null> {
    const file = await this._get(MANIFEST);
    if (!file) return null;
    const project = JSON.parse(new TextDecoder().decode(file.bytes)) as RvProject;
    return { ...project, id: this._projectId, documents: readDocuments(project) ?? [] } as RvProject;
  }

  async writeManifest(project: RvProject): Promise<void> {
    await this._writes.run(async () => {
      const body = { ...project, id: this._projectId, documents: readDocuments(project) ?? [] };
      // A new project's manifest is written before activation, like the folder backend's.
      await this._put(MANIFEST, new TextEncoder().encode(`${JSON.stringify(body, null, 2)}\n`), undefined, false);
    });
  }

  private async _manifest(): Promise<RvProject | null> {
    return this.readManifest().catch(() => null);
  }

  // ── Read surface ──

  async readScene(relPath: string): Promise<SceneRecord | null> {
    assertReadableScenePath(relPath);
    const id = sceneIdOfPath(relPath);
    if (!id) return null;
    const file = await this._get(`scenes/${id}.scene.glb`);
    if (!file) return null;
    const meta = (readDocuments(await this._manifest()) ?? []).find((d) => d.id === id);
    return glbSceneRecord(file.bytes, { id, name: meta?.name ?? '', ...meta, path: id }, file.known.digest);
  }

  async readSettings(relPath?: string): Promise<unknown | null> {
    const manifest = await this._manifest();
    const path = relPath ?? manifest?.settingsRef?.ref;
    if (path) {
      const bytes = await this.readBlobBytes(path);
      if (bytes) return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    }
    return (manifest?.settings as unknown) ?? null;
  }

  async listModels(): Promise<RvProjectAssetEntry[]> { return assetDocumentsOf(await this._manifest(), 'models'); }
  async listLibrary(): Promise<RvProjectAssetEntry[]> { return assetDocumentsOf(await this._manifest(), 'library'); }
  async listDocuments(): Promise<RvDocumentEntry[]> { return readDocuments(await this._manifest()) ?? []; }

  async statDocuments(): Promise<DocumentStat[]> {
    const response = await this._fetch(`${this._base}/projects/${this._projectId}/tree`, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) throw new ServerProjectError(response.status, await errorCode(response), '(tree)');
    const tree = await response.json() as Array<{ path: string; size: number }>;
    // The server's token is a Git blob SHA, not a content SHA-256, so no digest is claimed.
    return tree.map((entry) => ({ path: entry.path, size: entry.size }));
  }

  // ── Lifecycle ──

  async activate(): Promise<void> { this._active = true; }
  async deactivate(): Promise<void> { this._active = false; }

  // ── Write surface ──

  async writeScene(relPath: string, write: SceneWrite): Promise<SceneRevision> {
    assertWritable(this);
    return this._writes.run(async () => {
      const id = sceneIdOfPath(relPath) || write.meta?.id;
      if (!id) throw new Error('writeScene needs a scene id.');
      if (write.meta?.id && id !== write.meta.id) throw new Error(`"${relPath}" does not address scene ${write.meta.id}.`);
      return this._put(`scenes/${id}.scene.glb`, write.glb, write.expectedRevision);
    });
  }

  async deleteScene(relPath: string): Promise<void> {
    assertWritable(this);
    const id = sceneIdOfPath(relPath);
    if (!id) throw new Error('deleteScene needs a scene id.');
    return this._writes.run(() => this._delete(`scenes/${id}.scene.glb`));
  }

  async writeBlob(relPath: string, blob: Blob, opts?: WriteBlobOptions): Promise<void> {
    assertWritable(this);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await this._writes.run(() => this._put(relPath, bytes, opts?.expectedRevision));
  }

  async deleteBlob(relPath: string): Promise<void> {
    assertWritable(this);
    return this._writes.run(() => this._delete(relPath));
  }

  async readBlobUrl(relPath: string): Promise<ResolvedBackendBlob | null> {
    const file = await this._get(relPath);
    if (!file) return null;
    const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)]));
    return { url, release: () => URL.revokeObjectURL(url) };
  }

  async readBlobBytes(relPath: string): Promise<ArrayBuffer | null> {
    const file = await this._get(relPath);
    if (!file) return null;
    return file.bytes.slice().buffer;
  }

  async flush(): Promise<void> { await this._writes.drain(); }
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { code?: string } };
    return body.error?.code ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}
