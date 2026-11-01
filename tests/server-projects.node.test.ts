// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0024: the Appliance project API proxies Forgejo with a service token; the
 * session decides who may read and who may save, and every save is one commit
 * authored by the signed-in user. Forgejo is an in-memory mock of the
 * repository-contents API (a real Forgejo is validated on the Appliance).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { AccessStore } from '../appliance/runtime/access/store.mjs';
import { createProjectsHandler } from '../appliance/runtime/access/projects.mjs';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const origin = 'https://hmi.example.test';
const TOKEN = 'service-token-abc';

interface MockFile { content: Buffer; sha: string }
function mockForgejo() {
  const repos = new Map<string, { description: string; files: Map<string, MockFile>; updated: string }>();
  const commits: Array<{ repo: string; path: string; author: string; message: string; action: string }> = [];
  const read = (req: IncomingMessage) => new Promise<string>((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });
  const sha = (b: Buffer) => createHash('sha1').update(b).digest('hex');
  const server: Server = createServer(async (req, res) => {
    const send = (status: number, value?: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
    if (req.headers.authorization !== `token ${TOKEN}`) return send(401, { message: 'token required' });
    const url = new URL(req.url!, 'http://forgejo.invalid');
    if (url.pathname === '/api/v1/user/repos' && req.method === 'GET') {
      return send(200, [...repos].map(([name, r]) => ({ name, description: r.description, updated_at: r.updated, private: true })));
    }
    if (url.pathname === '/api/v1/user/repos' && req.method === 'POST') {
      const input = JSON.parse(await read(req));
      if (repos.has(input.name)) return send(409, { message: 'repository already exists' });
      repos.set(input.name, { description: input.description, files: new Map(), updated: new Date().toISOString() });
      return send(201, { name: input.name });
    }
    const tree = /^\/api\/v1\/repos\/appliance\/([^/]+)\/git\/trees\/main$/.exec(url.pathname);
    if (tree) {
      const repo = repos.get(tree[1]);
      if (!repo) return send(404, { message: 'not found' });
      return send(200, { tree: [...repo.files].map(([path, f]) => ({ path, type: 'blob', size: f.content.length, sha: f.sha })), truncated: false });
    }
    const contents = /^\/api\/v1\/repos\/appliance\/([^/]+)\/contents\/(.+)$/.exec(url.pathname);
    if (contents) {
      const repo = repos.get(contents[1]);
      const path = decodeURIComponent(contents[2]);
      if (!repo) return send(404, { message: 'not found' });
      const current = repo.files.get(path);
      if (req.method === 'GET') {
        if (!current) return send(404, { message: 'not found' });
        return send(200, { type: 'file', sha: current.sha, size: current.content.length, encoding: 'base64', content: current.content.toString('base64') });
      }
      const input = JSON.parse(await read(req));
      if (req.method === 'POST' && current) return send(422, { message: 'file already exists' });
      if ((req.method === 'PUT' || req.method === 'DELETE') && (!current || current.sha !== input.sha)) return send(409, { message: 'sha does not match' });
      commits.push({ repo: contents[1], path, author: input.author?.name, message: input.message, action: req.method ?? '' });
      if (req.method === 'DELETE') { repo.files.delete(path); return send(200, { commit: { sha: `c${commits.length}` } }); }
      const content = Buffer.from(input.content, 'base64');
      const next = { content, sha: sha(content) };
      repo.files.set(path, next);
      return send(req.method === 'POST' ? 201 : 200, { content: { sha: next.sha, path }, commit: { sha: `c${commits.length}` } });
    }
    return send(404, { message: 'no route' });
  });
  return { server, repos, commits };
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rv-projects-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const forgejo = mockForgejo();
  await new Promise<void>((resolve) => forgejo.server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve) => forgejo.server.close(() => resolve())));
  const tokenFile = join(root, 'forgejo-token');
  writeFileSync(tokenFile, TOKEN, { mode: 0o600 });
  const store = new AccessStore(join(root, 'access'));
  cleanups.push(() => store.close());
  const sessions: Record<string, { token: string; csrf: string }> = {};
  for (const role of ['viewer', 'engineer'] as const) {
    const user = await store.createUser(role, 'a-long-test-password', role);
    sessions[role] = store.mintSession(user.id);
  }
  const projects = createProjectsHandler({ forgejoUrl: `http://127.0.0.1:${(forgejo.server.address() as { port: number }).port}`, owner: 'appliance', tokenFile }, { store, origin });
  const app: Server = createServer(async (req, res) => { if (!await projects.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve) => app.close(() => resolve())));
  const base = `http://127.0.0.1:${(app.address() as { port: number }).port}/api/projects/v1`;
  const call = (path: string, init: { method?: string; as?: 'viewer' | 'engineer'; json?: unknown; bytes?: Buffer; headers?: Record<string, string>; csrf?: string } = {}) => {
    const headers: Record<string, string> = { origin, ...init.headers };
    if (init.as) { headers.cookie = `__Host-rv-access=${sessions[init.as].token}`; headers['x-csrf-token'] = init.csrf ?? sessions[init.as].csrf; }
    let body: BodyInit | undefined;
    if (init.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.json); }
    if (init.bytes) { headers['content-type'] = 'application/octet-stream'; body = new Uint8Array(init.bytes); }
    return fetch(base + path, { method: init.method ?? 'GET', headers, body });
  };
  return { call, forgejo, store };
}

describe('server-side projects in Forgejo (ADR-0024)', () => {
  it('lets an engineer create a project and save files as commits authored by them', async () => {
    const f = await fixture();
    expect((await f.call('/projects', { method: 'POST', as: 'engineer', json: { id: 'line-1', name: 'Line 1' } })).status).toBe(201);
    const first = await f.call('/projects/line-1/files/scenes/main.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('{"v":1}') });
    expect(first.status).toBe(201);
    const { revision } = await first.json();
    const second = await f.call('/projects/line-1/files/scenes/main.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('{"v":2}'), headers: { 'x-rv-base-revision': revision } });
    expect(second.status).toBe(200);
    expect(f.forgejo.commits.map((c) => [c.author, c.action])).toEqual([['engineer', 'POST'], ['engineer', 'PUT']]);
    expect(f.forgejo.commits[1].message).toContain('scenes/main.json');
    const read = await f.call('/projects/line-1/files/scenes/main.json', { as: 'viewer' });
    expect(read.status).toBe(200);
    expect(await read.text()).toBe('{"v":2}');
    expect(read.headers.get('x-rv-revision')).toBe((await second.json()).revision);
    const list = await (await f.call('/projects', { as: 'viewer' })).json();
    expect(list).toEqual([expect.objectContaining({ id: 'line-1', name: 'Line 1' })]);
    const tree = await (await f.call('/projects/line-1/tree', { as: 'viewer' })).json();
    expect(tree).toEqual([expect.objectContaining({ path: 'scenes/main.json', size: 7 })]);
    const saved = f.store.all("SELECT * FROM audit WHERE action='project.save'");
    expect(saved).toHaveLength(2);
    expect(JSON.parse(saved[1].detail)).toMatchObject({ commit: 'c2' });
  });

  it('reports a stale base revision as a conflict instead of overwriting', async () => {
    const f = await fixture();
    await f.call('/projects', { method: 'POST', as: 'engineer', json: { id: 'cell', name: 'Cell' } });
    const created = await (await f.call('/projects/cell/files/a.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('1') })).json();
    await f.call('/projects/cell/files/a.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('2'), headers: { 'x-rv-base-revision': created.revision } });
    const stale = await f.call('/projects/cell/files/a.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('3'), headers: { 'x-rv-base-revision': created.revision } });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('REVISION_CONFLICT');
    const again = await f.call('/projects/cell/files/a.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('3') });
    expect(again.status).toBe(409);
  });

  it('enforces roles, sessions, CSRF, origin and safe paths', async () => {
    const f = await fixture();
    await f.call('/projects', { method: 'POST', as: 'engineer', json: { id: 'p', name: 'P' } });
    expect((await f.call('/projects')).status).toBe(401);
    expect((await f.call('/projects', { method: 'POST', as: 'viewer', json: { id: 'q', name: 'Q' } })).status).toBe(403);
    expect((await f.call('/projects/p/files/x.json', { method: 'PUT', as: 'viewer', bytes: Buffer.from('x') })).status).toBe(403);
    expect((await f.call('/projects/p/files/x.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('x'), csrf: 'wrong' })).status).toBe(403);
    expect((await f.call('/projects/p/files/x.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('x'), headers: { origin: 'https://evil.example' } })).status).toBe(403);
    for (const bad of ['/projects/p/files/../secrets', '/projects/p/files/%2e%2e/x', '/projects/P_Bad/tree', '/projects/p/files/.git/config']) {
      expect([400, 404]).toContain((await f.call(bad, { as: 'engineer' })).status);
    }
    expect(f.forgejo.commits).toHaveLength(0);
  });

  it('deletes only with the current revision and reports a missing token as unavailable', async () => {
    const f = await fixture();
    await f.call('/projects', { method: 'POST', as: 'engineer', json: { id: 'd', name: 'D' } });
    const { revision } = await (await f.call('/projects/d/files/x.json', { method: 'PUT', as: 'engineer', bytes: Buffer.from('x') })).json();
    expect((await f.call('/projects/d/files/x.json', { method: 'DELETE', as: 'engineer' })).status).toBe(428);
    expect((await f.call('/projects/d/files/x.json', { method: 'DELETE', as: 'engineer', headers: { 'x-rv-base-revision': revision } })).status).toBe(200);
    expect((await f.call('/projects/d/files/x.json', { as: 'viewer' })).status).toBe(404);
    const broken = createProjectsHandler({ forgejoUrl: 'http://127.0.0.1:1', owner: 'appliance', tokenFile: '/nonexistent/token' }, { store: f.store, origin });
    const res = { status: 0, writeHead(s: number) { this.status = s; return this; }, end() {}, setHeader() {} } as any;
    await broken.handle({ url: '/api/projects/v1/projects', method: 'GET', headers: {} } as any, res);
    expect(res.status).toBe(503);
  });
});
