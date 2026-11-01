// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0024: the browser `server` project backend against an in-memory model of
 * /api/projects/v1 (the real API is covered by tests/server-projects.node.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { ServerBackend } from '../src/core/project/backends/server-backend';
import { SceneRevisionConflictError, revisionOfBytes } from '../src/core/project/rv-scene-record';
import { BackendNotWritableError } from '../src/core/project/backends/project-backend';
import { newProject } from '../src/core/project/rv-project-types';

function fakeApi() {
  const files = new Map<string, { bytes: Uint8Array; rev: string }>();
  let counter = 0;
  const csrfSeen: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (method !== 'GET') csrfSeen.push(headers['x-csrf-token']);
    if (url.endsWith('/tree')) {
      return new Response(JSON.stringify([...files].map(([path, f]) => ({ path, size: f.bytes.length, revision: f.rev }))), { status: 200 });
    }
    const path = decodeURIComponent(url.split('/files/')[1] ?? '');
    const current = files.get(path);
    if (method === 'GET') {
      if (!current) return new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 });
      return new Response(current.bytes.slice(), { status: 200, headers: { 'x-rv-revision': current.rev } });
    }
    const base = headers['x-rv-base-revision'];
    if ((current && base !== current.rev) || (!current && base)) return new Response('{"error":{"code":"REVISION_CONFLICT"}}', { status: 409 });
    if (method === 'DELETE') { files.delete(path); return new Response('{"commit":"c"}', { status: 200 }); }
    const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
    const rev = (++counter).toString(16).padStart(40, '0');
    files.set(path, { bytes, rev });
    return new Response(JSON.stringify({ revision: rev, commit: `c${counter}` }), { status: current ? 200 : 201 });
  }) as typeof fetch;
  /** Another user's commit, outside this backend. */
  const externalEdit = (path: string, text: string) => {
    files.set(path, { bytes: new TextEncoder().encode(text), rev: (++counter).toString(16).padStart(40, '0') });
  };
  return { files, fetchImpl, csrfSeen, externalEdit };
}

const backend = (api: ReturnType<typeof fakeApi>, writable = true) => {
  const b = new ServerBackend('line-1', { baseUrl: '/api/projects/v1', writable, csrf: () => 'csrf-1', fetchImpl: api.fetchImpl });
  void b.activate();
  return b;
};

describe('server project backend (ADR-0024)', () => {
  it('round-trips the manifest under the server project id', async () => {
    const api = fakeApi();
    const b = backend(api);
    expect(await b.readManifest()).toBeNull();
    await b.writeManifest({ ...newProject('Line 1'), id: 'something-else' });
    const read = await b.readManifest();
    expect(read).toMatchObject({ id: 'line-1', name: 'Line 1' });
    expect(api.files.has('project.json')).toBe(true);
    expect(api.csrfSeen).toEqual(['csrf-1']);
  });

  it('writes and reads scenes with the content SHA-256 as revision', async () => {
    const api = fakeApi();
    const b = backend(api);
    const glb = new Uint8Array([1, 2, 3, 4]);
    const revision = await b.writeScene('scenes/s1.scene.glb', { glb, meta: { id: 's1', name: 'S1', path: 's1' } });
    expect(revision).toBe(await revisionOfBytes(glb));
    const record = await b.readScene('scenes/s1.scene.glb');
    expect(Array.from(record!.glb)).toEqual([1, 2, 3, 4]);
    expect(record!.revision).toBe(revision);
    // An exact expected revision passes; a stale one is a local conflict.
    await b.writeScene('scenes/s1.scene.glb', { glb: new Uint8Array([5]), meta: { id: 's1', name: 'S1', path: 's1' }, expectedRevision: revision });
    await expect(b.writeScene('scenes/s1.scene.glb', { glb: new Uint8Array([6]), meta: { id: 's1', name: 'S1', path: 's1' }, expectedRevision: revision }))
      .rejects.toBeInstanceOf(SceneRevisionConflictError);
    await expect(b.writeScene('scenes/s2.scene.glb', { glb, meta: { id: 's2', name: 'S2', path: 's2' }, expectedRevision: null })).resolves.toBe(revision);
  });

  it("turns another user's commit in between into a conflict instead of overwriting it", async () => {
    const api = fakeApi();
    const b = backend(api);
    await b.writeBlob('documents/notes.json', new Blob(['mine-1']));
    api.externalEdit('documents/notes.json', 'theirs');
    await expect(b.writeBlob('documents/notes.json', new Blob(['mine-2']))).rejects.toBeInstanceOf(SceneRevisionConflictError);
    expect(new TextDecoder().decode(api.files.get('documents/notes.json')!.bytes)).toBe('theirs');
    // After a fresh read the next write is based on the current server state.
    expect(new TextDecoder().decode(await b.readBlobBytes('documents/notes.json') ?? new ArrayBuffer(0))).toBe('theirs');
    await b.writeBlob('documents/notes.json', new Blob(['mine-3']));
    expect(new TextDecoder().decode(api.files.get('documents/notes.json')!.bytes)).toBe('mine-3');
  });

  it('deletes, lists the tree and refuses writes for a read-only role', async () => {
    const api = fakeApi();
    const b = backend(api);
    await b.writeBlob('models/a.glb', new Blob([new Uint8Array([9])]));
    expect(await b.statDocuments()).toEqual([{ path: 'models/a.glb', size: 1 }]);
    await b.deleteBlob('models/a.glb');
    expect(await b.readBlobBytes('models/a.glb')).toBeNull();
    const viewer = backend(api, false);
    await expect(viewer.writeBlob('models/b.glb', new Blob(['x']))).rejects.toBeInstanceOf(BackendNotWritableError);
    await expect(viewer.writeManifest(newProject('X'))).rejects.toBeInstanceOf(BackendNotWritableError);
    expect(() => new ServerBackend('Bad_Id', { baseUrl: '/api/projects/v1', writable: true, csrf: () => null })).toThrow();
    expect(() => new ServerBackend('ok', { baseUrl: 'https://evil.example/api', writable: true, csrf: () => null })).toThrow();
  });
});
