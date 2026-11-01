// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WebSocket Realtime v2 server — the wire protocol the browser already speaks
 * (src/interfaces/signal-transport-core.ts, doc-webviewer-interface.md):
 *
 *   client → init { version: 2, name }            (also its heartbeat)
 *   client → import_request                        ← import_answer { signals, signalTypes }
 *   client → subscribe { subscribe: [names] }      ← snapshot { signals }
 *                                                  ← data { signals }   (changes only)
 *   client → data { signals }                      (WEB → PLC writes)
 *
 * Every inbound write is decided by the write policy, executed by the source
 * and audited. The result is reported back as `write_result`, which current
 * browsers ignore and diagnostics/tests read. Outbound changes are coalesced
 * per event-loop turn so a burst of OPC UA notifications costs one frame.
 */
import { WebSocketServer } from 'ws';
import { timingSafeEqual } from 'node:crypto';
import { evaluateWrite } from './write-policy.mjs';

const MAX_PAYLOAD = 1024 * 1024;
const MAX_WRITES_PER_MESSAGE = 1000;
const PING_INTERVAL_MS = 30_000;

/** Constant-time comparison of a presented key with the configured one. */
export function keyMatches(presented, expected) {
  if (typeof presented !== 'string' || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RealtimeServer {
  /**
   * @param {{ registry: import('./signals.mjs').SignalRegistry, source: { write(signal: any, value: any): Promise<{ outcome: string, status: string }> }, audit: import('./audit-log.mjs').AuditLog, apiKey: string|null, readOnly: boolean, maxClients: number, allowedOrigins: string[], path: string, identify?: (req: import('node:http').IncomingMessage) => Promise<{ user: string|null, role: string|null, canWrite: boolean } | null> }} options
   */
  constructor(options) {
    this.options = options;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
    this.clients = new Set();
    this._pending = new Map();
    this._flushScheduled = false;
    this._seq = 0;
    this._unsubscribe = options.registry.onChange((name, entry) => this._queue(name, entry.value));
    this._ping = setInterval(() => this._heartbeat(), PING_INTERVAL_MS);
    this._ping.unref?.();
  }

  /** Handle an HTTP upgrade for `path`; returns false when the request is not ours. */
  handleUpgrade(req, socket, head) {
    const url = new URL(req.url ?? '/', 'http://gateway.invalid');
    if (url.pathname !== this.options.path) return false;
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    const origin = req.headers.origin;
    if (origin && this.options.allowedOrigins.length > 0 && !this.options.allowedOrigins.includes(origin)) return reject(403, 'Forbidden'), true;
    if (this.options.apiKey && !keyMatches(url.searchParams.get('apikey') ?? req.headers['x-api-key'], this.options.apiKey)) return reject(401, 'Unauthorized'), true;
    if (this.clients.size >= this.options.maxClients) return reject(503, 'Service Unavailable'), true;
    const identify = this.options.identify ? this.options.identify(req) : Promise.resolve(null);
    identify.then((identity) => {
      if (this.options.identify && !identity) return reject(401, 'Unauthorized');
      this.wss.handleUpgrade(req, socket, head, (ws) => this._attach(ws, req, identity));
    }, () => reject(401, 'Unauthorized'));
    return true;
  }

  _attach(ws, req, identity) {
    const client = {
      ws,
      id: `ws-${++this._seq}`,
      remote: req.socket.remoteAddress ?? 'unknown',
      name: null,
      identity,
      subscribed: new Set(),
      alive: true,
    };
    this.clients.add(client);
    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      void this._handle(client, msg);
    });
    ws.on('close', () => this.clients.delete(client));
    ws.on('error', () => this.clients.delete(client));
  }

  async _handle(client, msg) {
    const { registry } = this.options;
    switch (msg.type) {
      case 'init':
        if (typeof msg.name === 'string') client.name = msg.name.slice(0, 64);
        return;
      case 'import_request':
        this._send(client, { type: 'import_answer', version: 2, signals: registry.values(), signalTypes: registry.types() });
        return;
      case 'subscribe': {
        const names = Array.isArray(msg.subscribe) ? msg.subscribe.filter((n) => typeof n === 'string' && registry.has(n)) : [];
        client.subscribed = new Set(names);
        this._send(client, { type: 'snapshot', version: 2, signals: registry.values(names) });
        return;
      }
      case 'data':
        await this._writes(client, msg.signals);
        return;
      default:
        return;
    }
  }

  async _writes(client, signals) {
    if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return;
    const entries = Object.entries(signals).slice(0, MAX_WRITES_PER_MESSAGE);
    const { registry, source, audit } = this.options;
    const who = {
      client: `${client.id}@${client.remote}${client.name ? `/${client.name}` : ''}`,
      user: client.identity?.user ?? null,
      role: client.identity?.role ?? null,
    };
    const results = {};
    for (const [name, requested] of entries) {
      const denied = client.identity && !client.identity.canWrite;
      const decision = denied
        ? { ok: false, reason: 'forbidden-role' }
        : evaluateWrite(registry, name, requested, { readOnly: this.options.readOnly });
      if (!decision.ok) {
        void audit.record({ ...who, signal: name, requested, outcome: 'rejected', reason: decision.reason });
        results[name] = { outcome: 'rejected', reason: decision.reason };
        continue;
      }
      const result = await source.write(decision.signal, decision.value);
      void audit.record({ ...who, signal: name, requested, value: decision.value, outcome: result.outcome, status: result.status });
      results[name] = result;
    }
    if (entries.length) this._send(client, { type: 'write_result', version: 2, results });
  }

  _queue(name, value) {
    this._pending.set(name, value);
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    setImmediate(() => this._flush());
  }

  _flush() {
    this._flushScheduled = false;
    if (this._pending.size === 0) return;
    const changes = this._pending;
    this._pending = new Map();
    for (const client of this.clients) {
      const signals = {};
      let any = false;
      for (const [name, value] of changes) {
        if (!client.subscribed.has(name)) continue;
        signals[name] = value;
        any = true;
      }
      if (any) this._send(client, { type: 'data', version: 2, signals });
    }
  }

  _send(client, msg) {
    if (client.ws.readyState !== client.ws.OPEN) return;
    client.ws.send(JSON.stringify(msg));
  }

  _heartbeat() {
    for (const client of this.clients) {
      if (!client.alive) { client.ws.terminate(); this.clients.delete(client); continue; }
      client.alive = false;
      try { client.ws.ping(); } catch { /* closing */ }
    }
  }

  close() {
    clearInterval(this._ping);
    this._unsubscribe();
    for (const client of this.clients) client.ws.terminate();
    this.clients.clear();
    this.wss.close();
  }
}
