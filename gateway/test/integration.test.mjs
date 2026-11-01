// SPDX-License-Identifier: AGPL-3.0-only
/**
 * End-to-end: an in-process node-opcua SERVER stands in for the PLC, the
 * gateway connects to it as a client, and a `ws` client speaks WebSocket
 * Realtime v2 exactly like src/interfaces/signal-transport-core.ts does.
 * InfluxDB is an HTTP mock that records writes and answers Flux with CSV.
 *
 * This proves the protocol and safety behavior against a real OPC UA stack.
 * It is NOT a real-PLC acceptance (IO-4).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { OPCUAServer } from 'node-opcua-server';
import { Variant, DataType, StatusCodes } from 'node-opcua-client';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';
import WebSocket from 'ws';
import { validateConfig, resolveSecrets } from '../src/config.mjs';
import { createGateway } from '../src/gateway.mjs';

const dir = mkdtempSync(join(tmpdir(), 'xyv-gateway-'));
const plc = { start: false, speed: 0, recipe: 3, running: false };
let opcServer;
let opcPort;
let influx;
const influxWrites = [];
let influxQueries = [];
let gateway;
let gatewayPort;
const KEY = 'test-key-123';

async function freePort() {
  return new Promise((resolve) => {
    const s = createNetServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startPlc(port) {
  const server = new OPCUAServer({
    port,
    resourcePath: '/UA/TestPLC',
    buildInfo: { productName: 'TestPLC', buildNumber: '1', buildDate: new Date() },
    serverCertificateManager: new OPCUACertificateManager({ rootFolder: join(dir, 'server-pki'), automaticallyAcceptUnknownCertificate: true }),
    userCertificateManager: new OPCUACertificateManager({ rootFolder: join(dir, 'server-user-pki'), automaticallyAcceptUnknownCertificate: true }),
  });
  await server.initialize();
  const space = server.engine.addressSpace;
  const ns = space.getOwnNamespace();
  const line = ns.addObject({ organizedBy: space.rootFolder.objects, browseName: 'Line' });
  const variable = (id, dataType, key) => ns.addVariable({
    componentOf: line, nodeId: `s=${id}`, browseName: id, dataType, minimumSamplingInterval: 10,
    value: {
      get: () => new Variant({ dataType: DataType[dataType], value: plc[key] }),
      set: (v) => { plc[key] = v.value; return StatusCodes.Good; },
    },
  });
  variable('Conveyor.Start', 'Boolean', 'start');
  variable('Drive.Speed', 'Double', 'speed');
  variable('Recipe', 'Int16', 'recipe');
  variable('Conveyor.Running', 'Boolean', 'running');
  await server.start();
  return server;
}

function until(check, timeoutMs = 20_000, label = 'condition') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try { value = check(); } catch { value = undefined; }
      if (value) return resolve(value);
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 50);
    };
    tick();
  });
}

/** A Realtime v2 client that records every message it receives. */
function connectClient(query = `?apikey=${KEY}`) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/ws${query}`);
    const client = { ws, messages: [], values: {} };
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      client.messages.push(msg);
      if (msg.type === 'snapshot' || msg.type === 'data') Object.assign(client.values, msg.signals);
      if (msg.type === 'import_answer') ws.send(JSON.stringify({ type: 'subscribe', version: 2, subscribe: Object.keys(msg.signals) }));
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'init', version: 2, name: 'WebViewer' }));
      ws.send(JSON.stringify({ type: 'import_request', version: 2 }));
      resolve(client);
    });
    ws.on('unexpected-response', (_req, res) => reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode })));
    ws.on('error', reject);
  });
}

async function writeAndWait(client, signals) {
  const count = client.messages.filter((m) => m.type === 'write_result').length;
  client.ws.send(JSON.stringify({ type: 'data', version: 2, signals }));
  await until(() => client.messages.filter((m) => m.type === 'write_result').length > count, 10_000, 'write_result');
  return client.messages.filter((m) => m.type === 'write_result').at(-1).results;
}

async function getJson(path, headers = { 'X-API-Key': KEY }) {
  const response = await fetch(`http://127.0.0.1:${gatewayPort}${path}`, { headers });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  opcPort = await freePort();
  opcServer = await startPlc(opcPort);
  influx = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/health') { res.writeHead(200); res.end('{"status":"pass"}'); return; }
      if (req.headers.authorization !== 'Token influx-token') { res.writeHead(401); res.end(); return; }
      if (req.url.startsWith('/api/v2/write')) { influxWrites.push(...body.split('\n')); res.writeHead(204); res.end(); return; }
      if (req.url.startsWith('/api/v2/query')) {
        influxQueries.push(body);
        res.writeHead(200, { 'Content-Type': 'text/csv' });
        res.end(',result,table,_time,_value,name\n,_result,0,2026-11-01T00:00:00Z,12.5,Speed\n,_result,0,2026-11-01T00:00:01Z,13,Speed\n');
        return;
      }
      res.writeHead(404); res.end();
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => influx.once('listening', r));
  const config = validateConfig({
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: 0 },
    apiKeyEnv: 'GW_TEST_KEY',
    audit: { path: join(dir, 'audit', 'writes.jsonl') },
    source: { kind: 'opcua', endpointUrl: `opc.tcp://127.0.0.1:${opcPort}/UA/TestPLC`, publishingIntervalMs: 50, samplingIntervalMs: 20, writeTimeoutMs: 3000, pkiDir: join(dir, 'client-pki') },
    signals: [
      { name: 'Start', nodeId: 'ns=1;s=Conveyor.Start', type: 'PLCInputBool', writable: true },
      { name: 'Speed', nodeId: 'ns=1;s=Drive.Speed', type: 'PLCOutputFloat' },
      { name: 'Recipe', nodeId: 'ns=1;s=Recipe', type: 'PLCInputInt', writable: true, min: 0, max: 20, dataType: 'Int16' },
      { name: 'Running', nodeId: 'ns=1;s=Conveyor.Running', type: 'PLCOutputBool' },
      { name: 'Ghost', nodeId: 'ns=1;s=Does.Not.Exist', type: 'PLCOutputInt' },
    ],
    history: { enabled: true, url: `http://127.0.0.1:${influx.address().port}`, org: 'xyvirtual', bucket: 'signals', tokenEnv: 'GW_TEST_INFLUX', flushIntervalMs: 100 },
  });
  gateway = createGateway(config, resolveSecrets(config, { GW_TEST_KEY: KEY, GW_TEST_INFLUX: 'influx-token' }));
  gatewayPort = (await gateway.start()).port;
  await until(() => gateway.source.state === 'connected', 30_000, 'OPC UA connection');
});

after(async () => {
  await gateway?.stop();
  await opcServer?.shutdown(0);
  influx?.close();
  rmSync(dir, { recursive: true, force: true });
});

test('health is public and reports the connected source and the refused NodeId', async () => {
  const { status, body } = await getJson('/health', {});
  assert.equal(status, 200);
  assert.equal(body.product, 'xyvirtual-gateway');
  assert.equal(body.source.state, 'connected');
  assert.ok(body.source.badSignals.Ghost, 'unknown NodeId is reported, not silently dropped');
  assert.equal(JSON.stringify(body).includes(KEY), false);
  assert.equal(JSON.stringify(body).includes('influx-token'), false);
});

test('the WebSocket refuses a missing or wrong API key', async () => {
  await assert.rejects(connectClient(''), (e) => e.statusCode === 401);
  await assert.rejects(connectClient('?apikey=wrong'), (e) => e.statusCode === 401);
});

test('v2 handshake: import_answer with PLC types, then a snapshot of live values', async () => {
  plc.speed = 42.5;
  const client = await connectClient();
  const answer = await until(() => client.messages.find((m) => m.type === 'import_answer'), 5000, 'import_answer');
  assert.deepEqual(answer.signalTypes, { Start: 'PLCInputBool', Speed: 'PLCOutputFloat', Recipe: 'PLCInputInt', Running: 'PLCOutputBool', Ghost: 'PLCOutputInt' });
  await until(() => client.messages.find((m) => m.type === 'snapshot'), 5000, 'snapshot');
  await until(() => client.values.Speed === 42.5, 5000, 'Speed from PLC');
  assert.equal(client.values.Recipe, 3);
  client.ws.close();
});

test('PLC-side changes stream to subscribers as data deltas', async () => {
  const client = await connectClient();
  await until(() => client.messages.find((m) => m.type === 'snapshot'), 5000, 'snapshot');
  plc.running = true;
  plc.speed = 99;
  await until(() => client.values.Running === true && client.values.Speed === 99, 5000, 'delta');
  assert.ok(client.messages.some((m) => m.type === 'data' && 'Speed' in m.signals));
  client.ws.close();
});

test('a writable PLCInput reaches the PLC and is audited as written', async () => {
  const client = await connectClient();
  await until(() => client.messages.find((m) => m.type === 'snapshot'), 5000, 'snapshot');
  const results = await writeAndWait(client, { Start: true, Recipe: 7 });
  assert.deepEqual(results.Start, { outcome: 'written', status: 'Good' });
  assert.deepEqual(results.Recipe, { outcome: 'written', status: 'Good' });
  assert.equal(plc.start, true);
  assert.equal(plc.recipe, 7);
  await gateway.audit.flush();
  const lines = readFileSync(join(dir, 'audit', 'writes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const start = lines.find((l) => l.signal === 'Start' && l.outcome === 'written');
  assert.ok(start && start.value === true && start.client.includes('WebViewer'));
  client.ws.close();
});

test('policy rejections never touch the PLC and are audited', async () => {
  const client = await connectClient();
  await until(() => client.messages.find((m) => m.type === 'snapshot'), 5000, 'snapshot');
  const before = { ...plc };
  const results = await writeAndWait(client, { Speed: 5, Recipe: 99, Start: 'yes', Unknown: 1 });
  assert.equal(results.Speed.reason, 'not-writable-direction');
  assert.equal(results.Recipe.reason, 'out-of-range');
  assert.equal(results.Start.reason, 'invalid-type');
  assert.equal(results.Unknown.reason, 'unknown-signal');
  assert.deepEqual(plc, before);
  await gateway.audit.flush();
  const rejected = readFileSync(join(dir, 'audit', 'writes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.outcome === 'rejected');
  assert.ok(['Speed', 'Recipe', 'Start', 'Unknown'].every((name) => rejected.some((l) => l.signal === name)));
  client.ws.close();
});

test('history: value changes are written to InfluxDB and queries return series', async () => {
  plc.speed = 123.25;
  await until(() => influxWrites.some((l) => /^signal,name=Speed value=123\.25 \d+$/.test(l)), 10_000, 'influx write');
  const status = await getJson('/history/status');
  assert.equal(status.body.enabled, true);
  assert.equal(status.body.connected, true);
  const signals = await getJson('/history/signals');
  assert.ok(signals.body.some((s) => s.name === 'Speed' && s.active === true));
  const unauthorized = await getJson('/history/status', {});
  assert.equal(unauthorized.status, 401);
  const q = await getJson('/history/query?from=2026-11-01T00:00:00Z&to=2026-11-01T01:00:00Z&signal=Speed');
  assert.equal(q.status, 200);
  assert.deepEqual(q.body, [{ signal: 'Speed', ts: [Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-01T00:00:01Z')], values: [12.5, 13] }]);
  assert.ok(influxQueries.at(-1).includes('r.name == "Speed"'));
  const bad = await getJson('/history/query?from=2026-11-01T00:00:00Z&to=2026-11-01T01:00:00Z&signal=Nope');
  assert.equal(bad.status, 404);
});

test('losing the PLC marks the source down; writes become outcome-unknown; it reconnects', async () => {
  const client = await connectClient();
  await until(() => client.messages.find((m) => m.type === 'snapshot'), 5000, 'snapshot');
  await opcServer.shutdown(0);
  await until(() => gateway.source.state !== 'connected', 30_000, 'disconnect detected');
  const results = await writeAndWait(client, { Start: false });
  assert.equal(results.Start.outcome, 'unknown', 'a write while disconnected is unknown, never retried');
  opcServer = await startPlc(opcPort);
  await until(() => gateway.source.state === 'connected', 60_000, 'reconnect');
  plc.speed = 7.75;
  await until(() => client.values.Speed === 7.75, 30_000, 'values flow after reconnect');
  client.ws.close();
});

test('behind the Appliance entry: identity comes only from proxy headers and viewer cannot write (ADR-0024)', async () => {
  const config = validateConfig({
    schemaVersion: 1,
    listen: { host: '127.0.0.1', port: 0 },
    trustProxyIdentity: true,
    audit: { path: join(dir, 'audit', 'identity.jsonl') },
    source: { kind: 'opcua', endpointUrl: `opc.tcp://127.0.0.1:${opcPort}/UA/TestPLC`, publishingIntervalMs: 50, samplingIntervalMs: 20, pkiDir: join(dir, 'client-pki-2') },
    signals: [{ name: 'Start', nodeId: 'ns=1;s=Conveyor.Start', type: 'PLCInputBool', writable: true }],
  });
  const second = createGateway(config, resolveSecrets(config, {}));
  const port = (await second.start()).port;
  try {
    await until(() => second.source.state === 'connected', 30_000, 'second gateway connection');
    const open = (headers) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
      const client = { ws, messages: [] };
      ws.on('message', (data) => client.messages.push(JSON.parse(data.toString())));
      ws.on('open', () => resolve(client));
      ws.on('unexpected-response', (_req, res) => reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode })));
      ws.on('error', reject);
    });
    await assert.rejects(open({}), (e) => e.statusCode === 401, 'no identity, no connection');
    await assert.rejects(open({ 'x-rv-user': 'mallory', 'x-rv-role': 'superuser' }), (e) => e.statusCode === 401, 'unknown role');
    const write = async (client, signals) => {
      client.ws.send(JSON.stringify({ type: 'data', version: 2, signals }));
      await until(() => client.messages.some((m) => m.type === 'write_result'), 10_000, 'write_result');
      return client.messages.find((m) => m.type === 'write_result').results;
    };
    plc.start = false;
    const viewer = await open({ 'x-rv-user': 'vera', 'x-rv-role': 'viewer' });
    assert.equal((await write(viewer, { Start: true })).Start.reason, 'forbidden-role');
    assert.equal(plc.start, false);
    viewer.ws.close();
    const operator = await open({ 'x-rv-user': 'otto', 'x-rv-role': 'operator' });
    assert.equal((await write(operator, { Start: true })).Start.outcome, 'written');
    assert.equal(plc.start, true);
    operator.ws.close();
    const history = await fetch(`http://127.0.0.1:${port}/history/status`);
    assert.equal(history.status, 401, 'history also requires an identity');
    await second.audit.flush();
    const lines = readFileSync(join(dir, 'audit', 'identity.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.user === 'vera' && l.role === 'viewer' && l.outcome === 'rejected' && l.reason === 'forbidden-role'));
    assert.ok(lines.some((l) => l.user === 'otto' && l.role === 'operator' && l.outcome === 'written'));
  } finally {
    await second.stop();
  }
});
