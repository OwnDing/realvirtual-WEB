// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0028 multiuser guard, end to end over real sockets: a `ws` server stands
 * in for Unity's MultiplayerWEB service, the gateway runs with
 * `trustProxyIdentity`, and browsers connect with the identity headers the
 * Appliance entry (Caddy forward_auth) would inject.
 *
 * This proves the proxy's policy. It is NOT an acceptance against a real Unity
 * multiuser server.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { validateConfig, resolveSecrets, ConfigError } from '../src/config.mjs';
import { createGateway } from '../src/gateway.mjs';
import { decideClientMessage, multiuserRoleFor, CLIENT_MESSAGE_TYPES } from '../src/multiuser-guard.mjs';

const dir = mkdtempSync(join(tmpdir(), 'xyv-gateway-mu-'));
let unity;
let unityPort;
/** Every message the fake Unity received, as parsed JSON. */
const received = [];
let gateway;
let gatewayPort;

before(async () => {
  unity = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => unity.once('listening', resolve));
  unityPort = unity.address().port;
  unity.on('connection', (socket) => {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      received.push(message);
      if (message.type === 'room_join') socket.send(JSON.stringify({ type: 'room_state', echoRole: message.role }));
    });
  });
  const config = validateConfig({
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: 0 },
    trustProxyIdentity: true,
    audit: { path: join(dir, 'audit', 'writes.jsonl') },
    signals: [],
    multiuser: { upstream: `ws://127.0.0.1:${unityPort}`, path: '/multiuser' },
  });
  gateway = createGateway(config, resolveSecrets(config, {}));
  gatewayPort = (await gateway.start()).port;
});

after(async () => {
  await gateway?.stop();
  await new Promise((resolve) => unity.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

/** Open a browser-side connection as `user` / `role` (or with no identity headers). */
function connect(identity) {
  const headers = identity ? { 'X-Rv-User': identity.user, 'X-Rv-Role': identity.role } : {};
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/multiuser`, { headers });
  const inbox = [];
  ws.on('message', (data) => inbox.push(JSON.parse(data.toString())));
  return { ws, inbox, opened: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`))); ws.once('error', reject); }) };
}

async function until(predicate, label, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${label}`);
}

function auditLines() {
  const path = join(dir, 'audit', 'writes.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
}

test('a connection without the proxied identity is refused', async () => {
  const { opened } = connect(null);
  await assert.rejects(opened, /HTTP 401/);
});

test('room_join carries the session role, never the one the browser claims', async () => {
  const viewer = connect({ user: 'vera', role: 'viewer' });
  await viewer.opened;
  viewer.ws.send(JSON.stringify({ type: 'room_join', name: 'Vera', role: 'operator' }));
  await until(() => viewer.inbox.some((m) => m.type === 'room_state'), 'viewer room_state');
  assert.equal(viewer.inbox.find((m) => m.type === 'room_state').echoRole, 'observer');

  const operator = connect({ user: 'otto', role: 'operator' });
  await operator.opened;
  operator.ws.send(JSON.stringify({ type: 'room_join', name: 'Otto', role: 'observer' }));
  await until(() => operator.inbox.some((m) => m.type === 'room_state'), 'operator room_state');
  assert.equal(operator.inbox.find((m) => m.type === 'room_state').echoRole, 'operator');

  viewer.ws.close();
  operator.ws.close();
});

test('a viewer session cannot write: the message is dropped, answered and audited', async () => {
  const viewer = connect({ user: 'vera', role: 'viewer' });
  await viewer.opened;
  const before = received.length;
  viewer.ws.send(JSON.stringify({ type: 'signal_write', signalPath: 'Cell/Signals/Start', value: true }));
  viewer.ws.send(JSON.stringify({ type: 'drive_jog', drivePath: 'Cell/Conveyor', forward: true }));
  viewer.ws.send(JSON.stringify({ type: 'shared_view_on' }));
  viewer.ws.send(JSON.stringify({ type: 'cursor_ray', origin: [0, 0, 0], direction: [0, 0, 1] }));
  await until(() => viewer.inbox.filter((m) => m.type === 'error').length === 3, 'three permission errors');
  await until(() => received.length > before, 'cursor_ray forwarded');
  assert.deepEqual(received.slice(before).map((m) => m.type), ['cursor_ray']);
  assert.ok(viewer.inbox.every((m) => m.type !== 'error' || m.code === 'permission_denied'));

  await gateway.audit.flush();
  const rejected = auditLines().filter((line) => line.user === 'vera' && line.outcome === 'rejected');
  assert.deepEqual(rejected.map((line) => line.signal).sort(), [
    'multiuser:drive_jog:Cell/Conveyor',
    'multiuser:signal_write:Cell/Signals/Start',
  ]);
  assert.ok(rejected.every((line) => line.role === 'viewer' && line.reason === 'role'));
  viewer.ws.close();
});

test('an operator write is forwarded and audited as unknown (Unity confirms nothing)', async () => {
  const engineer = connect({ user: 'erin', role: 'engineer' });
  await engineer.opened;
  const before = received.length;
  engineer.ws.send(JSON.stringify({ type: 'signal_write', signalPath: 'Cell/Signals/Start', value: true }));
  await until(() => received.length > before, 'signal_write forwarded');
  assert.deepEqual(received.at(-1), { type: 'signal_write', signalPath: 'Cell/Signals/Start', value: true });
  await gateway.audit.flush();
  const line = auditLines().find((entry) => entry.user === 'erin');
  assert.equal(line.outcome, 'unknown');
  assert.equal(line.reason, 'forwarded-to-multiuser');
  assert.equal(line.requested, true);
  engineer.ws.close();
});

test('unknown types, non-JSON and arrays never reach the upstream', async () => {
  const operator = connect({ user: 'otto', role: 'operator' });
  await operator.opened;
  const before = received.length;
  operator.ws.send('not json');
  operator.ws.send(JSON.stringify([{ type: 'signal_write' }]));
  operator.ws.send(JSON.stringify({ type: 'role_change', role: 'operator' }));
  operator.ws.send(JSON.stringify({ type: 'look_at', target: [1, 2, 3] }));
  await until(() => received.length > before, 'look_at forwarded');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(received.slice(before).map((m) => m.type), ['look_at']);
  operator.ws.close();
});

test('health reports the guard', async () => {
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
  const body = await response.json();
  assert.equal(body.multiuser.enabled, true);
});

test('policy units: role mapping and message decisions', () => {
  assert.equal(multiuserRoleFor({ canWrite: true }), 'operator');
  assert.equal(multiuserRoleFor({ canWrite: false }), 'observer');
  assert.equal(multiuserRoleFor(null), 'observer');
  assert.equal(decideClientMessage('x'.repeat(256 * 1024 + 1), { canWrite: true }).action, 'drop');
  assert.equal(decideClientMessage(JSON.stringify({ type: 'annotation_add', id: 'a' }), { canWrite: false }).action, 'forward');
  assert.ok(CLIENT_MESSAGE_TYPES.includes('annotation_sync'));
});

test('configuration fails closed', () => {
  const base = { schemaVersion: 1, audit: { path: join(dir, 'a.jsonl') }, signals: [] };
  assert.throws(() => validateConfig({ ...base, multiuser: { upstream: 'ws://unity.invalid:7000' } }), (error) => error instanceof ConfigError && /trustProxyIdentity/.test(error.message));
  assert.throws(() => validateConfig({ ...base, trustProxyIdentity: true, multiuser: { upstream: 'http://unity.invalid:7000' } }), ConfigError);
  assert.throws(() => validateConfig({ ...base, trustProxyIdentity: true, multiuser: { upstream: 'ws://unity.invalid:7000', path: '/ws' } }), /websocketPath/);
  assert.throws(() => validateConfig({ ...base, trustProxyIdentity: true, multiuser: { upstream: 'ws://unity.invalid:7000', extra: 1 } }), /unknown key/);
  assert.equal(validateConfig(base).multiuser, null);
  assert.deepEqual(validateConfig({ ...base, trustProxyIdentity: true, multiuser: { upstream: 'wss://unity.invalid:7000' } }).multiuser, { upstream: 'wss://unity.invalid:7000', path: '/multiuser', maxClients: 50 });
});
