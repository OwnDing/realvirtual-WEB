// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createAccessHandler } from '../appliance/runtime/access/http.mjs';
import { AccessStore } from '../appliance/runtime/access/store.mjs';
import { validatePresentationGlb } from '../appliance/runtime/access/glb.mjs';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const origin = 'https://present.example.test';
function glb(extra = {}) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0, ...extra }));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, padded]);
}
async function fixture(limits: { maxBytes?: number; quotaBytes?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rv-access-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  let now = Date.now();
  const store = new AccessStore(root, { now: () => now });
  const admin = await store.createUser('admin', 'a-long-test-password', 'admin');
  const app = createAccessHandler({ root, origin, ...limits }, { store });
  const server: Server = createServer(async (req, res) => { if (!await app.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/access/v1`;
  const request = async (path: string, method = 'GET', value?: unknown, session?: { token: string; csrf: string }, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { origin, ...extra };
    if (session) { headers.cookie = `__Host-rv-access=${session.token}`; headers['x-csrf-token'] = session.csrf; }
    let body: string | Buffer | undefined;
    if (Buffer.isBuffer(value)) { body = value; headers['content-type'] = 'model/gltf-binary'; }
    else if (value !== undefined) { body = JSON.stringify(value); headers['content-type'] = 'application/json'; }
    return fetch(base + path, { method, body: Buffer.isBuffer(body) ? new Uint8Array(body).buffer : body, headers });
  };
  const login = async (username = 'admin', password = 'a-long-test-password') => {
    const response = await request('/login', 'POST', { username, password });
    expect(response.status).toBe(200);
    const token = /__Host-rv-access=([^;]+)/.exec(response.headers.get('set-cookie')!)![1];
    expect(response.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
    return { token, csrf: (await response.json()).csrf };
  };
  const publish = async (session: { token: string; csrf: string }, bytes = glb(), operation = randomUUID()) => {
    const response = await request('/presentations?name=Private%20demo', 'POST', bytes, session, { 'idempotency-key': operation });
    expect([200, 201]).toContain(response.status); return response.json();
  };
  const share = async (session: { token: string; csrf: string }, presentationId: string, extra = {}) => {
    const response = await request('/shares', 'POST', { presentationId, ...extra }, session);
    expect(response.status).toBe(201); const result = await response.json();
    return { ...result, token: new URLSearchParams(new URL(result.url).hash.slice(1)).get('token') };
  };
  const redeem = async (link: { id: string; token: string }, session?: { token: string; csrf: string }) => {
    const response = await request('/redeem', 'POST', link, session);
    expect(response.status).toBe(200);
    return { token: /__Host-rv-access=([^;]+)/.exec(response.headers.get('set-cookie')!)![1], csrf: (await response.json()).csrf };
  };
  return { root, store, admin, server, base, request, login, publish, share, redeem, advance: (ms: number) => { now += ms; } };
}

describe('protected presentations: server authority', () => {
  it('rejects browser auth flags, forged identity headers, absent credentials and CSRF', async () => {
    const f = await fixture();
    expect((await f.request('/presentations', 'GET', undefined, undefined, { cookie: 'rv-login-auth=1', 'Remote-User': 'admin' })).status).toBe(401);
    expect((await f.request('/login', 'POST', { username: 'admin', password: 'wrong' })).status).toBe(401);
    expect((await f.request('/login', 'POST', { username: 'admin', password: 'a-long-test-password' }, undefined, { origin: 'https://evil.test' })).status).toBe(403);
    const admin = await f.login();
    expect((await f.request('/shares', 'POST', {}, { ...admin, csrf: 'forged' })).status).toBe(403);
    expect((await f.request('/users', 'GET', undefined, admin)).status).toBe(200);
    expect(readFileSync(join(f.root, 'access.sqlite')).includes(Buffer.from(admin.token))).toBe(false);
    expect(readFileSync(join(f.root, 'access.sqlite')).includes(Buffer.from('a-long-test-password'))).toBe(false);
  });

  it('publishes immutable bytes idempotently and limits a redeemed link to its own resource', async () => {
    const f = await fixture(), admin = await f.login();
    const operation = randomUUID(), bytes = glb();
    const model = await f.publish(admin, bytes, operation);
    expect((await f.publish(admin, bytes, operation)).id).toBe(model.id);
    expect((await f.request('/presentations?name=Private%20demo', 'POST', glb({ extras: { changed: true } }), admin, { 'idempotency-key': operation })).status).toBe(409);
    const a = await f.share(admin, model.id), b = await f.share(admin, model.id), visitor = await f.redeem(a);
    const response = await f.request(`/shares/${a.id}/model`, 'GET', undefined, visitor);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect((await f.request(`/shares/${b.id}/model`, 'GET', undefined, visitor)).status).toBe(404);
    expect((await f.request('/users', 'GET', undefined, visitor)).status).toBe(403);
    expect((await f.request(`/shares/${a.id}/model`, 'HEAD', undefined, visitor)).headers.get('content-length')).toBe(String(bytes.length));
    const range = await f.request(`/shares/${a.id}/model`, 'GET', undefined, visitor, { range: 'bytes=0-3' });
    expect(range.status).toBe(206); expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 4));
    expect((await f.request(`/shares/${a.id}/model`, 'GET', undefined, visitor, { range: 'bytes=0-3,4-5' })).status).toBe(416);
    expect((await f.request(`/shares/${a.id}/model%2f..%2f..`, 'GET', undefined, visitor)).status).toBe(404);
    const audit = await (await f.request('/audit', 'GET', undefined, admin)).text();
    expect(audit).toContain('resource.read'); expect(audit).not.toContain(a.token); expect(audit).not.toContain(visitor.token);
  });

  it('revokes existing sessions, supports idempotent revoke and persists revocation on reopen', async () => {
    const f = await fixture(), admin = await f.login(), model = await f.publish(admin);
    const link = await f.share(admin, model.id), visitor = await f.redeem(link);
    for (let i = 0; i < 2; i++) expect((await f.request(`/shares/${link.id}/revoke`, 'POST', {}, admin)).status).toBe(200);
    for (const method of ['GET', 'HEAD']) expect((await f.request(`/shares/${link.id}/model`, method, undefined, visitor)).status).toBe(410);
    expect((await f.request('/redeem', 'POST', link)).status).toBe(410);
    const reopened = new AccessStore(f.root); expect(reopened.get('SELECT revoked FROM shares WHERE id=?', link.id).revoked).toBe(1); reopened.close();
  });

  it('requires the designated account, expires on server time and disables existing account sessions', async () => {
    const f = await fixture(), admin = await f.login(), model = await f.publish(admin);
    const user = await (await f.request('/users', 'POST', { username: 'visitor', password: 'visitor-test-password' }, admin)).json();
    const link = await f.share(admin, model.id, { userId: user.id });
    expect((await f.request('/redeem', 'POST', link)).status).toBe(401);
    expect((await f.request('/redeem', 'POST', link, admin)).status).toBe(403);
    const visitor = await f.redeem(link, await f.login('visitor', 'visitor-test-password'));
    expect((await (await f.request(`/shares/${link.id}`, 'GET', undefined, visitor)).json()).identity).toBe('account');
    expect((await f.request(`/users/${user.id}`, 'PATCH', { disabled: true }, admin)).status).toBe(200);
    expect((await f.request(`/shares/${link.id}/model`, 'GET', undefined, visitor)).status).toBe(401);
    expect((await f.request('/shares', 'POST', { presentationId: model.id, expiresAt: f.store.now() }, admin)).status).toBe(422);
    expect((await f.request('/shares', 'POST', { presentationId: model.id, expiresAt: f.store.now() + 91 * 86400000 }, admin)).status).toBe(422);
    const short = await f.share(admin, model.id, { expiresAt: f.store.now() + 10000 });
    const session = await f.redeem(short); f.advance(11000);
    expect((await f.request(`/shares/${short.id}/model`, 'GET', undefined, session)).status).toBe(401);
  });

  it('rejects external dependencies and scripts instead of publishing partially protected snapshots', async () => {
    const f = await fixture(), admin = await f.login();
    for (const extra of [{ images: [{ uri: 'https://example.test/private.png' }] }, { extras: { scripts: ['run()'] } }, { extras: { component: 'WebComponent' } }]) {
      const response = await f.request('/presentations?name=bad', 'POST', glb(extra), admin, { 'idempotency-key': randomUUID() });
      expect(response.status).toBe(422);
    }
    expect(f.store.all('SELECT * FROM presentations')).toEqual([]);
    expect(() => validatePresentationGlb(Buffer.from('not glb'))).toThrow('INVALID_GLB');
    expect(() => validatePresentationGlb(glb({ buffers: [null] }))).toThrow('INVALID_GLB');
  });

  it('fails closed after restore and when the backing database is unavailable', async () => {
    const f = await fixture(), admin = await f.login(), model = await f.publish(admin);
    const link = await f.share(admin, model.id), visitor = await f.redeem(link);
    f.store.invalidateRestoredShares();
    expect((await f.request(`/shares/${link.id}/model`, 'GET', undefined, visitor)).status).toBe(401);
    expect((await f.request('/redeem', 'POST', link)).status).toBe(410);
    f.store.db.exec('DROP TABLE sessions');
    expect((await f.request('/session', 'GET', undefined, admin)).status).toBe(503);
  });

  it('invalidates logout/reset sessions and prevents disabling the last administrator', async () => {
    const f = await fixture(), admin = await f.login();
    expect((await f.request(`/users/${f.admin.id}`, 'PATCH', { disabled: true }, admin)).status).toBe(409);
    const user = await (await f.request('/users', 'POST', { username: 'visitor', password: 'visitor-test-password' }, admin)).json();
    const previous = await f.login('visitor', 'visitor-test-password');
    expect((await f.request(`/users/${user.id}`, 'PATCH', { password: 'new-visitor-password' }, admin)).status).toBe(200);
    expect((await f.request('/session', 'GET', undefined, previous)).status).toBe(401);
    expect((await f.request('/login', 'POST', { username: 'visitor', password: 'visitor-test-password' })).status).toBe(401);
    const current = await f.login('visitor', 'new-visitor-password');
    const logout = await f.request('/logout', 'POST', {}, current);
    expect(logout.status).toBe(200); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await f.request('/session', 'GET', undefined, current)).status).toBe(401);
  });

  it('does not authorize a slow write with a session logged out while its body was arriving', async () => {
    const f = await fixture(), admin = await f.login(), model = await f.publish(admin);
    const received = new Promise<void>(resolve => f.server.once('request', () => resolve()));
    let send!: () => void;
    const response = new Promise<number>(resolve => {
      const req = httpRequest(f.base + '/shares', { method: 'POST', headers: { origin, cookie: `__Host-rv-access=${admin.token}`, 'x-csrf-token': admin.csrf, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
      req.flushHeaders(); send = () => req.end(JSON.stringify({ presentationId: model.id }));
    });
    await received;
    expect((await f.request('/logout', 'POST', {}, admin)).status).toBe(200);
    send(); expect(await response).toBe(401);
    expect(f.store.all('SELECT * FROM shares')).toEqual([]);
  });

  it('enforces upload limits and quota without publishing invalid or truncated data', async () => {
    const bytes = glb(), f = await fixture({ maxBytes: bytes.length, quotaBytes: bytes.length }), admin = await f.login();
    await f.publish(admin, bytes);
    const upload = (data: Buffer) => f.request('/presentations?name=second', 'POST', data, admin, { 'idempotency-key': randomUUID() });
    expect((await upload(bytes)).status).toBe(413);
    expect((await upload(Buffer.concat([bytes, Buffer.alloc(4)]))).status).toBe(413);
    expect((await f.request('/shares', 'POST', { padding: 'x'.repeat(17000) }, admin)).status).toBe(413);
    expect(f.store.all('SELECT * FROM presentations')).toHaveLength(1);
  });

  it('rate limits password guesses and allows retries after the server window', async () => {
    const f = await fixture();
    for (let i = 0; i < 10; i++) expect((await f.request('/login', 'POST', { username: 'admin', password: 'wrong' })).status).toBe(401);
    expect((await f.request('/login', 'POST', { username: 'admin', password: 'a-long-test-password' })).status).toBe(429);
    f.advance(300001); await f.login();
  });

  it('refuses corrupted private bytes and retains only the configured audit period', async () => {
    const f = await fixture(), admin = await f.login(), model = await f.publish(admin);
    const link = await f.share(admin, model.id), visitor = await f.redeem(link);
    writeFileSync(join(f.root, 'blobs', `${model.id}.glb`), glb({ extras: { changed: true } }));
    expect((await f.request(`/shares/${link.id}/model`, 'GET', undefined, visitor)).status).toBe(503);
    f.advance(91 * 86400000); f.store.prune();
    expect(f.store.all('SELECT * FROM audit')).toEqual([]);
    expect(f.store.all('SELECT * FROM sessions')).toEqual([]);
  });
});
