// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0024: HMI roles, the forward_auth decision endpoint and audited force events. */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createAccessHandler } from '../appliance/runtime/access/http.mjs';
import { AccessStore, roleAtLeast } from '../appliance/runtime/access/store.mjs';
import { safeNext } from '../appliance/runtime/static/login/next.mjs';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const origin = 'https://hmi.example.test';
const PASSWORD = 'a-long-test-password';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rv-hmi-access-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const store = new AccessStore(root);
  for (const role of ['viewer', 'operator', 'engineer', 'admin'] as const) await store.createUser(role, PASSWORD, role);
  const app = createAccessHandler({ root, origin }, { store });
  const server: Server = createServer(async (req, res) => { if (!await app.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); store.close(); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/access/v1`;
  const call = (path: string, init: { method?: string; body?: unknown; session?: { token: string; csrf: string }; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { origin, ...init.headers };
    if (init.session) { headers.cookie = `__Host-rv-access=${init.session.token}`; headers['x-csrf-token'] = init.session.csrf; }
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(base + path, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: 'manual' });
  };
  const login = async (username: string) => {
    const response = await call('/login', { method: 'POST', body: { username, password: PASSWORD } });
    expect(response.status).toBe(200);
    const token = /__Host-rv-access=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')![1];
    return { token, csrf: (await response.json()).csrf as string };
  };
  return { store, call, login };
}

describe('HMI roles (ADR-0024)', () => {
  it('the login page only returns to same-origin paths', () => {
    expect(safeNext('/index.html?model=a')).toBe('/index.html?model=a');
    for (const bad of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '/login/?next=/', null, '']) expect(safeNext(bad)).toBe('/');
  });

  it('orders the four roles and keeps visitor outside the HMI', () => {
    expect(roleAtLeast('engineer', 'operator')).toBe(true);
    expect(roleAtLeast('operator', 'engineer')).toBe(false);
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('visitor', 'viewer')).toBe(false);
    expect(roleAtLeast(undefined, 'viewer')).toBe(false);
  });

  it('migrates a v1 database without losing accounts, shares or sessions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-access-v1-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const v1 = new AccessStore(root);
    v1.close();
    // Rebuild the exact v1 schema the previous release created.
    const db = new DatabaseSync(join(root, 'access.sqlite'));
    db.exec(`PRAGMA foreign_keys=OFF; DROP TABLE audit; DROP TABLE sessions; DROP TABLE shares; DROP TABLE presentations; DROP TABLE users;
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','visitor')), disabled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE presentations (id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, operation TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE shares (id TEXT PRIMARY KEY, presentation TEXT NOT NULL REFERENCES presentations(id), token TEXT NOT NULL, user TEXT REFERENCES users(id), expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user TEXT REFERENCES users(id), share TEXT REFERENCES shares(id), csrf TEXT NOT NULL, visitor TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE audit (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, outcome TEXT NOT NULL);
      INSERT INTO users VALUES ('u1','boss','x','admin',0), ('u2','guest','x','visitor',0);
      INSERT INTO presentations VALUES ('p1','Demo',1,'h','op',0);
      INSERT INTO shares VALUES ('s1','p1','t','u2',${Date.now() + 60000},0,0);
      INSERT INTO sessions VALUES ('k1','u2','s1','c','v',${Date.now() + 60000});
      INSERT INTO audit(time,actor,action,target,outcome) VALUES (${Date.now()},'local-cli','user.create','u1','ok');
      PRAGMA user_version=1;`);
    db.close();
    const store = new AccessStore(root);
    cleanups.push(() => store.close());
    expect(store.get('PRAGMA user_version').user_version).toBe(2);
    expect(store.all('SELECT username, role FROM users ORDER BY username')).toEqual([{ username: 'boss', role: 'admin' }, { username: 'guest', role: 'visitor' }]);
    expect(store.get('SELECT user FROM shares WHERE id=?', 's1').user).toBe('u2');
    expect(store.get('SELECT user FROM sessions WHERE token=?', 'k1').user).toBe('u2');
    expect(store.get('SELECT detail FROM audit WHERE action=?', 'user.create').detail).toBe('');
    expect(store.all('PRAGMA foreign_key_check')).toEqual([]);
    await expect(store.createUser('line1', PASSWORD, 'operator')).resolves.toMatchObject({ role: 'operator' });
    await expect(store.createUser('root2', PASSWORD, 'superuser')).rejects.toThrow('INVALID_USER');
  });

  it('authz grants by role, redirects a navigation to login and never trusts client identity headers', async () => {
    const f = await fixture();
    const viewer = await f.login('viewer');
    const auditBefore = f.store.get('SELECT count(*) AS n FROM audit').n;
    const anonymous = await f.call('/authz?need=viewer', { headers: { 'x-rv-user': 'admin', 'x-rv-role': 'admin' } });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('x-rv-user')).toBeNull();
    const navigation = await f.call('/authz?need=viewer', { headers: { accept: 'text/html,application/xhtml+xml', 'x-forwarded-uri': '/index.html?model=a' } });
    expect(navigation.status).toBe(302);
    expect(navigation.headers.get('location')).toBe('/login/?next=%2Findex.html%3Fmodel%3Da');
    const hostile = await f.call('/authz?need=viewer', { headers: { accept: 'text/html', 'x-forwarded-uri': '//evil.example/x' } });
    expect(hostile.headers.get('location')).toBe('/login/?next=%2F');
    // Unauthenticated asset requests are the common case: they must not flood the audit table.
    expect(f.store.get('SELECT count(*) AS n FROM audit').n).toBe(auditBefore);
    const ok = await f.call('/authz?need=viewer', { session: viewer });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('x-rv-user')).toBe('viewer');
    expect(ok.headers.get('x-rv-role')).toBe('viewer');
    expect((await f.call('/authz?need=operator', { session: viewer })).status).toBe(403);
    expect((await f.call('/authz?need=root', { session: viewer })).status).toBe(400);
    const engineer = await f.login('engineer');
    expect((await f.call('/authz?need=operator', { session: engineer })).headers.get('x-rv-role')).toBe('engineer');
  });

  it('a disabled account loses HMI access at once', async () => {
    const f = await fixture();
    const operator = await f.login('operator');
    const admin = await f.login('admin');
    const id = f.store.get('SELECT id FROM users WHERE username=?', 'operator').id;
    expect((await f.call(`/users/${id}`, { method: 'PATCH', body: { disabled: true }, session: admin })).status).toBe(200);
    expect((await f.call('/authz?need=viewer', { session: operator })).status).toBe(401);
  });

  it('reports the HMI role in the session and lets only admin create HMI accounts', async () => {
    const f = await fixture();
    const engineer = await f.login('engineer');
    expect(await (await f.call('/session', { session: engineer })).json()).toMatchObject({ username: 'engineer', role: 'engineer' });
    expect((await f.call('/users', { method: 'POST', body: { username: 'line2', password: PASSWORD, role: 'operator' }, session: engineer })).status).toBe(403);
    const admin = await f.login('admin');
    const created = await f.call('/users', { method: 'POST', body: { username: 'line2', password: PASSWORD, role: 'operator' }, session: admin });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ role: 'operator' });
  });

  it('records force events only for engineer and above, with CSRF and an action allowlist', async () => {
    const f = await fixture();
    const operator = await f.login('operator');
    const engineer = await f.login('engineer');
    const event = { action: 'signal.force', target: 'ConveyorStart', detail: { value: true } };
    expect((await f.call('/audit-events', { method: 'POST', body: event, session: operator })).status).toBe(403);
    expect((await f.call('/audit-events', { method: 'POST', body: event, session: { ...engineer, csrf: 'wrong' } })).status).toBe(403);
    expect((await f.call('/audit-events', { method: 'POST', body: { ...event, action: 'user.delete' }, session: engineer })).status).toBe(422);
    const ok = await f.call('/audit-events', { method: 'POST', body: event, session: engineer });
    expect(ok.status).toBe(201);
    const row = f.store.get("SELECT * FROM audit WHERE action='signal.force'");
    expect(row).toMatchObject({ target: 'ConveyorStart', outcome: 'reported' });
    expect(JSON.parse(row.detail)).toEqual({ value: true, role: 'engineer', username: 'engineer' });
    expect((await f.call('/audit-events', { method: 'POST', body: { action: 'signal.unforce', target: 'ConveyorStart' }, session: engineer })).status).toBe(201);
  });
});
