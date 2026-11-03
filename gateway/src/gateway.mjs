// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Composition of the gateway: signal registry, source, audit log, history,
 * WebSocket Realtime v2 and the small HTTP surface.
 *
 *   GET  /health                 always reachable (no key), never secrets
 *   GET  /history/status         \
 *   GET  /history/signals         } X-API-Key when an API key is configured
 *   GET  /history/query           /
 *   WS   <websocketPath>          ?apikey= when an API key is configured
 *   WS   <multiuser.path>         optional multiuser guard (ADR-0028), proxied identity only
 */
import { createServer } from 'node:http';
import { SignalRegistry } from './signals.mjs';
import { AuditLog } from './audit-log.mjs';
import { InfluxHistory, HistoryError } from './history.mjs';
import { RealtimeServer, keyMatches } from './realtime-server.mjs';
import { OpcUaSource } from './sources/opcua-source.mjs';
import { IdleSource } from './sources/idle-source.mjs';
import { MultiuserGuard } from './multiuser-guard.mjs';

export const GATEWAY_PRODUCT = 'xyvirtual-gateway';

/** HMI roles (ADR-0024) and which of them may write PLC signals. */
const HMI_ROLES = ['viewer', 'operator', 'engineer', 'admin'];
const WRITE_ROLES = new Set(['operator', 'engineer', 'admin']);

/** Identity from the entry proxy's headers, or null when absent or malformed. */
export function proxyIdentity(req) {
  const user = req.headers['x-rv-user'];
  const role = req.headers['x-rv-role'];
  if (typeof user !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(user) || !HMI_ROLES.includes(role)) return null;
  return { user, role, canWrite: WRITE_ROLES.has(role) };
}
export const GATEWAY_VERSION = '0.1.0';

function json(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

/**
 * @param {ReturnType<import('./config.mjs').validateConfig>} config
 * @param {ReturnType<import('./config.mjs').resolveSecrets>} secrets
 * @param {{ source?: any, fetchImpl?: typeof fetch, identify?: any, identifyMultiuser?: any, connectUpstream?: any }} [overrides]
 */
export function createGateway(config, secrets, overrides = {}) {
  const registry = new SignalRegistry(config.signals);
  const audit = new AuditLog(config.audit.path);
  const source = overrides.source ?? (config.source ? new OpcUaSource(config.source, registry, secrets) : new IdleSource());
  const history = new InfluxHistory(config.history, registry, secrets, overrides.fetchImpl ?? fetch);
  const realtime = new RealtimeServer({
    registry, source, audit, apiKey: secrets.apiKey, readOnly: config.readOnly,
    maxClients: config.maxClients, allowedOrigins: config.allowedOrigins, path: config.websocketPath,
    identify: overrides.identify ?? (config.trustProxyIdentity ? async (req) => proxyIdentity(req) : undefined),
  });

  const multiuser = config.multiuser ? new MultiuserGuard({
    ...config.multiuser,
    allowedOrigins: config.allowedOrigins,
    audit,
    identify: overrides.identifyMultiuser ?? proxyIdentity,
    ...(overrides.connectUpstream ? { connectUpstream: overrides.connectUpstream } : {}),
  }) : null;

  const cors = (req) => {
    const origin = req.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin)) return {};
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, X-API-Key', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://gateway.invalid');
    const headers = cors(req);
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' }, headers);
    if (url.pathname === '/health') {
      return json(res, 200, {
        status: 'ok', product: GATEWAY_PRODUCT, version: GATEWAY_VERSION,
        readOnly: config.readOnly, signals: registry.names().length, clients: realtime.clients.size,
        source: source.health(), history: { enabled: config.history.enabled, connected: history.connected },
        auditFailures: audit.failures,
        multiuser: multiuser ? { enabled: true, clients: multiuser.clients.size } : { enabled: false },
      }, headers);
    }
    if (!url.pathname.startsWith('/history/')) return json(res, 404, { error: 'not found' }, headers);
    if (secrets.apiKey && !keyMatches(req.headers['x-api-key'], secrets.apiKey)) return json(res, 401, { error: 'unauthorized' }, headers);
    if (config.trustProxyIdentity && !proxyIdentity(req)) return json(res, 401, { error: 'unauthorized' }, headers);
    try {
      if (url.pathname === '/history/status') return json(res, 200, history.status(), headers);
      if (url.pathname === '/history/signals') return json(res, 200, history.signals(), headers);
      if (url.pathname === '/history/query') return json(res, 200, await history.query(url.searchParams), headers);
      return json(res, 404, { error: 'not found' }, headers);
    } catch (error) {
      const status = error instanceof HistoryError ? error.status : 500;
      return json(res, status, { error: error instanceof Error ? error.message : String(error) }, headers);
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if (realtime.handleUpgrade(req, socket, head)) return;
    if (multiuser?.handleUpgrade(req, socket, head)) return;
    socket.destroy();
  });

  return {
    registry, audit, source, history, realtime, multiuser, server,
    async start() {
      source.start();
      history.start();
      void history.probe();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.listen.port, config.listen.host, () => { server.off('error', reject); resolve(); });
      });
      return server.address();
    },
    async stop() {
      realtime.close();
      multiuser?.close();
      await new Promise((resolve) => server.close(() => resolve()));
      await history.stop();
      await source.stop();
      await audit.flush();
    },
  };
}
