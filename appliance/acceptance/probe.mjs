#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Field acceptance probe for an installed XYvirtual Offline Appliance.
 *
 * Runs from an operator workstation (or the host) against the real HTTPS entry
 * and records machine-checkable evidence for the automated part of
 * `docs/FIELD_ACCEPTANCE.zh-CN.md`. It is deliberately NON-DESTRUCTIVE:
 *
 *   - it never writes a PLC signal, jogs a drive or sends any write-class
 *     multiuser message — those are manual, site-authorized steps;
 *   - it signs in with the accounts you give it (one session each, then logs
 *     out) and only READS what those sessions may read;
 *   - the evidence file contains no password, cookie, CSRF token or session id.
 *
 *   node acceptance/probe.mjs --url https://hmi.example.local --ca root.crt \
 *        [--accounts accounts.json] [--multiuser] [--out evidence.json]
 *
 * `accounts.json` (keep it outside the bundle, delete it after the run):
 *   { "viewer": { "username": "...", "password": "..." }, "operator": {...}, "engineer": {...}, "admin": {...} }
 * Any subset works; missing roles are reported as skipped, not passed.
 *
 * Exit code: 0 every executed check passed, 1 a check failed, 2 the probe
 * itself could not run (bad arguments, unreachable host, untrusted TLS).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { connect as tlsConnect } from 'node:tls';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROBE_VERSION = 1;
export const HMI_ROLES = Object.freeze(['viewer', 'operator', 'engineer', 'admin']);
const TIMEOUT_MS = 15_000;

/** One HTTP(S) request; resolves status, headers and a small body. Never follows redirects. */
export function makeRequester({ ca, allowHttpLoopback = false } = {}) {
  return (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const target = new URL(url);
    const http = target.protocol === 'http:';
    if (http && !(allowHttpLoopback && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))) {
      reject(new Error('plain HTTP is only allowed against loopback in tests'));
      return;
    }
    const send = http ? httpRequest : httpsRequest;
    const req = send(target, { method, headers, ...(http ? {} : { ca, rejectUnauthorized: true }), timeout: TIMEOUT_MS }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => { size += chunk.length; if (size <= 256 * 1024) chunks.push(chunk); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${TIMEOUT_MS} ms`)));
    req.on('error', reject);
    if (body !== undefined) req.end(body); else req.end();
  });
}

/** Certificate facts of the HTTPS entry, verified against the given CA. */
export function inspectTls(url, ca) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const socket = tlsConnect({ host: target.hostname, port: Number(target.port || 443), servername: target.hostname, ca, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate(false);
      resolve({
        subject: cert.subject?.CN ?? null,
        issuer: cert.issuer?.CN ?? null,
        validFrom: cert.valid_from ?? null,
        validTo: cert.valid_to ?? null,
        sha256: cert.fingerprint256 ?? null,
        subjectAltName: cert.subjectaltname ?? null,
        protocol: socket.getProtocol(),
      });
      socket.end();
    });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('TLS timeout')));
    socket.on('error', reject);
  });
}

const sessionCookie = (headers) => {
  const raw = [headers['set-cookie'] ?? []].flat().find((value) => value.startsWith('__Host-rv-access='));
  const value = raw?.split(';')[0];
  return value && value !== '__Host-rv-access=' ? value : null;
};
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

/**
 * Run every automated check. `request` and `openSocket` are injectable so the
 * logic is testable without an Appliance.
 *
 * @param {{ url: string, accounts?: Record<string, { username: string, password: string }>, multiuser?: boolean,
 *   request: ReturnType<typeof makeRequester>, openSocket?: (url: string, headers: Record<string, string>) => any,
 *   tls?: object | null }} options
 */
export async function runChecks({ url, accounts = {}, multiuser = false, request, openSocket, tls = null }) {
  const base = new URL(url);
  const origin = base.origin;
  const checks = [];
  const add = (id, title, ok, detail = '') => checks.push({ id, title, result: ok === null ? 'skipped' : ok ? 'passed' : 'failed', detail });
  const get = (path, headers = {}) => request(new URL(path, origin).href, { headers });

  // ── Entry, health and protection of every surface ─────────────────────
  const live = await get('/health/live');
  add('A1', 'GET /health/live answers 200', live.status === 200, `status ${live.status}`);
  const ready = await get('/health/ready');
  add('A2', 'GET /health/ready answers 200 (all required services up)', ready.status === 200, `status ${ready.status}${ready.status !== 200 ? ` ${ready.body.slice(0, 300)}` : ''}`);
  const anonymous = await get('/', { accept: 'text/html' });
  add('A3', 'An unauthenticated HMI navigation is sent to /login/', anonymous.status === 302 && String(anonymous.headers.location ?? '').startsWith('/login/'), `status ${anonymous.status} → ${anonymous.headers.location ?? '-'}`);
  const anonymousGateway = await get('/gateway/health', { accept: 'application/json' });
  add('A4', 'The gateway refuses a request without an HMI session', anonymousGateway.status === 401, `status ${anonymousGateway.status}`);
  for (const [id, path] of [['A5', '/diagnostics/'], ['A6', '/git/'], ['A7', '/appliance/']]) {
    const res = await get(path);
    add(id, `${path} requires the operator credential`, res.status === 401, `status ${res.status}`);
  }
  const login = await get('/login/', { accept: 'text/html' });
  const hsts = String(login.headers['strict-transport-security'] ?? '');
  add('A8', 'HSTS, nosniff and frame-ancestors are sent', /max-age=\d+/.test(hsts) && login.headers['x-content-type-options'] === 'nosniff' && /frame-ancestors/.test(String(login.headers['content-security-policy'] ?? '')),
    `hsts="${hsts}" nosniff=${login.headers['x-content-type-options'] ?? '-'}`);

  // ── Accounts and roles (ADR-0024) ─────────────────────────────────────
  let gatewayHealth = null;
  const sessions = {};
  for (const role of HMI_ROLES) {
    const account = accounts[role];
    if (!account) { add(`R-${role}`, `Sign in as ${role}`, null, 'no account provided'); continue; }
    const res = await request(new URL('/api/access/v1/login', origin).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ username: account.username, password: account.password }),
    });
    const cookie = sessionCookie(res.headers);
    if (res.status !== 200 || !cookie) { add(`R-${role}`, `Sign in as ${role}`, false, `status ${res.status}`); continue; }
    const csrf = json(res.body)?.csrf;
    const session = json((await get('/api/access/v1/session', { cookie })).body);
    add(`R-${role}`, `Sign in as ${role}; the session reports that role`, session?.role === role, `session role ${session?.role ?? '-'}`);
    const page = await get('/', { cookie, accept: 'text/html' });
    add(`R-${role}-web`, `${role} reaches the HMI`, page.status === 200, `status ${page.status}`);
    const health = await get('/gateway/health', { cookie, accept: 'application/json' });
    add(`R-${role}-gateway`, `${role} reaches the gateway`, health.status === 200, `status ${health.status}`);
    if (health.status === 200) gatewayHealth ??= json(health.body);
    const users = await get('/api/access/v1/users', { cookie });
    const adminOnly = role === 'admin' ? users.status === 200 : users.status === 403;
    add(`R-${role}-users`, role === 'admin' ? 'admin may list accounts' : `${role} may not list accounts`, adminOnly, `status ${users.status}`);
    sessions[role] = { cookie, csrf };
  }

  // ── Gateway facts (recorded, judged by the runbook) ───────────────────
  if (gatewayHealth) {
    add('G1', 'Gateway reports its product and source', gatewayHealth.product === 'xyvirtual-gateway', `readOnly=${gatewayHealth.readOnly} signals=${gatewayHealth.signals} source=${JSON.stringify(gatewayHealth.source)} history=${JSON.stringify(gatewayHealth.history)}`);
  } else add('G1', 'Gateway reports its product and source', null, 'no session reached the gateway');

  // ── Multiuser guard (ADR-0028), join-only ─────────────────────────────
  if (!multiuser) add('M0', 'Multiuser guard', null, 'not requested (--multiuser)');
  else if (!gatewayHealth?.multiuser?.enabled) add('M0', 'Multiuser guard is enabled in the gateway', false, `health.multiuser=${JSON.stringify(gatewayHealth?.multiuser ?? null)}`);
  else {
    add('M0', 'Multiuser guard is enabled in the gateway', true);
    const wsUrl = new URL('/gateway/multiuser', origin);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    for (const [role, expected] of [['viewer', 'observer'], ['operator', 'operator']]) {
      if (!sessions[role]) { add(`M-${role}`, `${role} joins as ${expected}`, null, 'no account provided'); continue; }
      const observed = await joinRole(openSocket, wsUrl.href, sessions[role].cookie, origin);
      add(`M-${role}`, `${role} claiming operator joins the room as ${expected}`, observed === expected, `room role ${observed ?? '-'}`);
    }
  }

  for (const session of Object.values(sessions)) {
    await request(new URL('/api/access/v1/logout', origin).href, {
      method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: session.cookie, 'x-csrf-token': session.csrf ?? '' }, body: '{}',
    }).catch(() => undefined);
  }

  const summary = { passed: 0, failed: 0, skipped: 0 };
  for (const check of checks) summary[check.result]++;
  return { probeVersion: PROBE_VERSION, startedAt: new Date().toISOString(), target: origin, tls, checks, summary };
}

/**
 * Join the room once, claiming `operator`, and read back the role the room
 * assigned to us. Sends nothing but room_join and room_leave.
 */
function joinRole(openSocket, url, cookie, origin) {
  return new Promise((resolve) => {
    const name = `acceptance-probe-${randomBytes(4).toString('hex')}`;
    let settled = false;
    const socket = openSocket(url, { cookie, origin });
    const finish = (role) => {
      if (settled) return;
      settled = true;
      try { socket.send(JSON.stringify({ type: 'room_leave' })); } catch { /* closing */ }
      try { socket.close(); } catch { /* closing */ }
      resolve(role);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'room_join', name, color: '#808080', role: 'operator', xrMode: 'none' })));
    socket.on('message', (data) => {
      const message = json(String(data));
      const me = message?.type === 'room_state' ? message.players?.find((player) => player?.name === name) : null;
      if (me) { clearTimeout(timer); finish(me.role ?? null); }
    });
    socket.on('error', () => { clearTimeout(timer); finish(null); });
    socket.on('close', () => { clearTimeout(timer); finish(null); });
  });
}

/** `ws` ships with the gateway, in the bundle at runtime/gateway and in the repository at gateway/. */
async function loadWs() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of ['../runtime/gateway/node_modules/ws/wrapper.mjs', '../../gateway/node_modules/ws/wrapper.mjs']) {
    try { return (await import(pathToFileURL(join(here, candidate)).href)).default; } catch { /* next */ }
  }
  throw new Error('the ws module was not found next to the gateway');
}

function parseArgs(argv) {
  const args = { multiuser: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--multiuser') args.multiuser = true;
    else if (['--url', '--ca', '--accounts', '--out'].includes(flag)) args[flag.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.url || !/^https:\/\//.test(args.url)) throw new Error('--url https://<appliance host> is required');
  if (!args.ca) throw new Error('--ca <root certificate PEM> is required (customer CA or the internal CA root)');
  return args;
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (error) { console.error(`probe: ${error.message}`); process.exit(2); }
  const ca = readFileSync(args.ca);
  let tls;
  try { tls = await inspectTls(args.url, ca); } catch (error) { console.error(`probe: TLS to ${args.url} failed against ${args.ca}: ${error.message}`); process.exit(2); }
  const accounts = args.accounts ? JSON.parse(readFileSync(args.accounts, 'utf8')) : {};
  const WebSocket = args.multiuser ? await loadWs() : null;
  const evidence = await runChecks({
    url: args.url, accounts, multiuser: args.multiuser, tls,
    request: makeRequester({ ca }),
    openSocket: (url, headers) => new WebSocket(url, { headers, ca }),
  }).catch((error) => { console.error(`probe: ${error.message}`); process.exit(2); });
  const out = args.out ?? `appliance-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  for (const check of evidence.checks) console.log(`${check.result.padEnd(7)} ${check.id.padEnd(16)} ${check.title}${check.detail ? ` — ${check.detail}` : ''}`);
  console.log(`\n${evidence.summary.passed} passed, ${evidence.summary.failed} failed, ${evidence.summary.skipped} skipped → ${out}`);
  console.log(`TLS ${tls.subject} issued by ${tls.issuer}, SHA-256 ${tls.sha256}`);
  process.exit(evidence.summary.failed > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

export const __testing = { sessionCookie, parseArgs };
