// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Multiuser guard (ADR-0028): an authenticated WebSocket proxy in front of the
 * Unity MultiplayerWEB service (or a relay).
 *
 * The multiuser protocol lets the BROWSER declare its role in `room_join`, and
 * operators may send `signal_write`, `drive_jog` and `drive_stop` — messages
 * that reach Unity's simulation and possibly a real PLC. Unity can only trust
 * what it is told. Behind the Appliance entry this proxy knows who the user is
 * (X-Rv-User / X-Rv-Role, set by Caddy forward_auth from the HMI session) and
 * makes the role a fact instead of a claim:
 *
 *   - no proxied identity → the upgrade is refused (401);
 *   - `room_join.role` is overwritten: operator for a session that may write
 *     signals, observer otherwise;
 *   - write-class messages from a read-only session are dropped and answered
 *     with the protocol's `error` / `permission_denied`;
 *   - browser → upstream accepts only known message types as JSON objects, so
 *     an unanticipated message cannot become an escalation path;
 *   - every write-class message, forwarded or refused, is audited with the
 *     user. A forwarded write is `unknown`: whether Unity executed it is not
 *     visible here. Upstream → browser traffic is passed through unchanged.
 */
import { WebSocket, WebSocketServer } from 'ws';

const MAX_PAYLOAD = 256 * 1024;
/** Messages buffered while the upstream connection is still opening. */
const MAX_PENDING = 64;
const PING_INTERVAL_MS = 30_000;

/** Message types a browser may send (doc-multiuser-system.md, multiuser/annotation plugins). */
export const CLIENT_MESSAGE_TYPES = Object.freeze([
  'room_join', 'room_leave', 'avatar_update', 'cursor_ray', 'look_at',
  'shared_view_on', 'shared_view_off',
  'signal_write', 'drive_jog', 'drive_stop',
  'annotation_add', 'annotation_update', 'annotation_remove', 'annotation_sync',
]);
/** Reserved for sessions that may write signals (ADR-0024 operator and above). */
export const OPERATOR_MESSAGE_TYPES = Object.freeze(['signal_write', 'drive_jog', 'drive_stop', 'shared_view_on']);
const WRITE_TARGET = { signal_write: 'signalPath', drive_jog: 'drivePath', drive_stop: 'drivePath' };
const CLIENT_TYPES = new Set(CLIENT_MESSAGE_TYPES);
const OPERATOR_TYPES = new Set(OPERATOR_MESSAGE_TYPES);

/** The multiuser role a session may hold. */
export function multiuserRoleFor(identity) {
  return identity?.canWrite ? 'operator' : 'observer';
}

/**
 * Decide what happens to one browser → upstream message.
 * @returns {{ action: 'forward', data: string } | { action: 'drop', reply?: object, audit?: boolean }}
 */
export function decideClientMessage(raw, identity) {
  if (typeof raw !== 'string' || raw.length > MAX_PAYLOAD) return { action: 'drop' };
  let message;
  try { message = JSON.parse(raw); } catch { return { action: 'drop' }; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { action: 'drop' };
  const type = message.type;
  if (typeof type !== 'string' || !CLIENT_TYPES.has(type)) return { action: 'drop' };
  if (type === 'room_join') {
    return { action: 'forward', data: JSON.stringify({ ...message, role: multiuserRoleFor(identity) }) };
  }
  if (OPERATOR_TYPES.has(type) && !identity?.canWrite) {
    return {
      action: 'drop',
      audit: type in WRITE_TARGET,
      reply: { type: 'error', code: 'permission_denied', message: `Only operators can send ${type}` },
    };
  }
  return { action: 'forward', data: raw };
}

export class MultiuserGuard {
  /**
   * @param {{ upstream: string, path: string, maxClients: number, allowedOrigins: string[],
   *   audit: import('./audit-log.mjs').AuditLog,
   *   identify: (req: import('node:http').IncomingMessage) => { user: string, role: string, canWrite: boolean } | null,
   *   connectUpstream?: (url: string) => WebSocket }} options
   */
  constructor(options) {
    this.options = options;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
    this.clients = new Set();
    this._seq = 0;
    this._ping = setInterval(() => {
      for (const client of this.clients) {
        if (!client.alive) { client.browser.terminate(); continue; }
        client.alive = false;
        try { client.browser.ping(); } catch { /* closing */ }
      }
    }, PING_INTERVAL_MS);
    this._ping.unref?.();
  }

  /** Handle an HTTP upgrade for the guard path; returns false when the request is not ours. */
  handleUpgrade(req, socket, head) {
    const url = new URL(req.url ?? '/', 'http://gateway.invalid');
    if (url.pathname !== this.options.path) return false;
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
      return true;
    };
    const origin = req.headers.origin;
    if (origin && this.options.allowedOrigins.length > 0 && !this.options.allowedOrigins.includes(origin)) return reject(403, 'Forbidden');
    const identity = this.options.identify(req);
    if (!identity) return reject(401, 'Unauthorized');
    if (this.clients.size >= this.options.maxClients) return reject(503, 'Service Unavailable');
    this.wss.handleUpgrade(req, socket, head, (browser) => this._attach(browser, req, identity));
    return true;
  }

  _attach(browser, req, identity) {
    const client = { id: `mu-${++this._seq}`, remote: req.socket.remoteAddress ?? 'unknown', identity, browser, upstream: null, pending: [], alive: true };
    this.clients.add(client);
    browser.on('pong', () => { client.alive = true; });

    const connect = this.options.connectUpstream ?? ((target) => new WebSocket(target, { perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 }));
    let upstream;
    try { upstream = connect(this.options.upstream); } catch { browser.close(1011, 'upstream unavailable'); this.clients.delete(client); return; }
    client.upstream = upstream;

    upstream.on('open', () => {
      for (const data of client.pending.splice(0)) upstream.send(data);
    });
    upstream.on('message', (data, isBinary) => {
      if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary: isBinary });
    });
    const closeBoth = (code, reason) => {
      if (browser.readyState === WebSocket.OPEN || browser.readyState === WebSocket.CONNECTING) browser.close(code, reason);
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
      this.clients.delete(client);
    };
    upstream.on('close', () => closeBoth(1001, 'upstream closed'));
    upstream.on('error', () => closeBoth(1011, 'upstream unavailable'));

    browser.on('message', (data, isBinary) => {
      const decision = isBinary ? { action: 'drop' } : decideClientMessage(data.toString('utf8'), identity);
      if (decision.action === 'forward') {
        this._audit(client, decision.data, true);
        if (upstream.readyState === WebSocket.OPEN) upstream.send(decision.data);
        else if (client.pending.length < MAX_PENDING) client.pending.push(decision.data);
        return;
      }
      if (decision.audit) this._audit(client, data.toString('utf8'), false);
      if (decision.reply && browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(decision.reply));
    });
    browser.on('close', () => closeBoth(1000, 'client closed'));
    browser.on('error', () => closeBoth(1011, 'client error'));
  }

  /** Audit a write-class message (ADR-0024 IO-3 / ADR-0028). Non-writes are not recorded. */
  _audit(client, data, forwarded) {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    const field = WRITE_TARGET[message?.type];
    if (!field) return;
    const target = typeof message[field] === 'string' ? message[field].slice(0, 256) : '';
    const requested = message.type === 'signal_write' ? message.value : message.type === 'drive_jog' ? { forward: message.forward === true } : null;
    void this.options.audit.record({
      client: client.id,
      signal: `multiuser:${message.type}:${target}`,
      requested,
      outcome: forwarded ? 'unknown' : 'rejected',
      reason: forwarded ? 'forwarded-to-multiuser' : 'role',
      user: client.identity.user,
      role: client.identity.role,
    });
  }

  close() {
    clearInterval(this._ping);
    for (const client of this.clients) {
      try { client.browser.close(1001, 'gateway stopping'); } catch { /* closing */ }
      try { client.upstream?.close(); } catch { /* closing */ }
    }
    this.clients.clear();
    this.wss.close();
  }
}
