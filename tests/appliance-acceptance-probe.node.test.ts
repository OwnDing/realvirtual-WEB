// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The field acceptance probe (appliance/acceptance/probe.mjs) against a fake
 * Appliance on loopback that answers like the real entry: Caddy forward_auth
 * redirects and 401s, the access service's login/session/users/logout and the
 * gateway's multiuser guard (ADR-0028).
 *
 * What matters most here: a correct Appliance passes, a broken one FAILS the
 * right checks, and the probe never sends a write-class message.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { makeRequester, runChecks, __testing } from '../appliance/acceptance/probe.mjs';

interface Fault { gatewayOpen?: boolean; viewerGetsOperator?: boolean; wrongSessionRole?: boolean }

const ACCOUNTS = {
  viewer: { username: 'vera', password: 'v-secret-1' },
  operator: { username: 'otto', password: 'o-secret-1' },
  admin: { username: 'ada', password: 'a-secret-1' },
} as const;
type Role = 'viewer' | 'operator' | 'admin';

function fakeAppliance(fault: Fault = {}) {
  const sessions = new Map<string, Role>();
  const multiuserTypes: string[] = [];
  const logouts: string[] = [];
  const securityHeaders = {
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "frame-ancestors 'self'; object-src 'none'",
  };
  const roleOf = (req: IncomingMessage): Role | null => {
    const token = /__Host-rv-access=([A-Za-z0-9_-]{43})/.exec(req.headers.cookie ?? '')?.[1];
    return token ? sessions.get(token) ?? null : null;
  };
  const send = (res: ServerResponse, status: number, body = '', headers: Record<string, string> = {}) => {
    res.writeHead(status, { ...securityHeaders, ...headers });
    res.end(body);
  };
  let origin = '';
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const role = roleOf(req);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      if (path === '/health/live' || path === '/health/ready') return send(res, 200, '{"status":"ok"}');
      if (path === '/login/') return send(res, 200, '<html>login</html>');
      if (['/diagnostics/', '/git/', '/appliance/'].includes(path)) return send(res, 401, '', { 'www-authenticate': 'Basic' });
      if (path === '/api/access/v1/login' && req.method === 'POST') {
        if (req.headers.origin !== origin) return send(res, 403);
        const input = JSON.parse(body) as { username: string; password: string };
        const match = (Object.entries(ACCOUNTS) as Array<[Role, { username: string; password: string }]>)
          .find(([, a]) => a.username === input.username && a.password === input.password);
        if (!match) return send(res, 401);
        const token = 'T'.repeat(42) + String(sessions.size);
        sessions.set(token, match[0]);
        return send(res, 200, JSON.stringify({ csrf: 'csrf-' + match[0] }), {
          'set-cookie': `__Host-rv-access=${token}; Path=/; Secure; HttpOnly; SameSite=Strict`,
          'content-type': 'application/json',
        });
      }
      if (path === '/api/access/v1/session') {
        if (!role) return send(res, 401);
        return send(res, 200, JSON.stringify({ username: 'u', role: fault.wrongSessionRole && role === 'operator' ? 'viewer' : role }));
      }
      if (path === '/api/access/v1/users') return send(res, role === 'admin' ? 200 : role ? 403 : 401, '[]');
      if (path === '/api/access/v1/logout' && req.method === 'POST') {
        if (req.headers['x-csrf-token'] !== 'csrf-' + role) return send(res, 403);
        logouts.push(role!);
        return send(res, 200, '{"loggedOut":true}');
      }
      if (path === '/gateway/health') {
        if (!role && !fault.gatewayOpen) return send(res, 401);
        return send(res, 200, JSON.stringify({ status: 'ok', product: 'xyvirtual-gateway', readOnly: true, signals: 0, source: { state: 'idle' }, history: { enabled: true, connected: true }, multiuser: { enabled: true, clients: 0 } }));
      }
      if (path === '/') {
        if (!role) return send(res, 302, '', { location: '/login/?next=%2F' });
        return send(res, 200, '<html>hmi</html>');
      }
      return send(res, 404);
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const role = roleOf(req);
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/gateway/multiuser' || !role) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data) => {
        const message = JSON.parse(String(data)) as { type: string; name?: string };
        multiuserTypes.push(message.type);
        if (message.type === 'room_join') {
          const granted = role === 'viewer' && !fault.viewerGetsOperator ? 'observer' : 'operator';
          ws.send(JSON.stringify({ type: 'room_state', players: [{ id: 'p1', name: message.name, role: granted }] }));
        }
      });
    });
  });
  return {
    multiuserTypes, logouts,
    async start(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as { port: number };
      origin = `http://127.0.0.1:${address.port}`;
      return origin;
    },
    async stop(): Promise<void> {
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let appliance: ReturnType<typeof fakeAppliance> | null = null;
afterEach(async () => { await appliance?.stop(); appliance = null; });

async function probe(fault: Fault = {}, multiuser = true) {
  appliance = fakeAppliance(fault);
  const url = await appliance.start();
  return runChecks({
    url,
    accounts: ACCOUNTS,
    multiuser,
    request: makeRequester({ allowHttpLoopback: true }),
    openSocket: (target, headers) => new WebSocket(target, { headers }) as never,
  });
}

const result = (evidence: Awaited<ReturnType<typeof probe>>, id: string) => evidence.checks.find((c) => c.id === id)?.result;

describe('appliance acceptance probe', () => {
  it('passes a correctly protected Appliance and skips only the role it was not given', async () => {
    const evidence = await probe();
    const failed = evidence.checks.filter((c) => c.result === 'failed');
    expect(failed, JSON.stringify(failed)).toEqual([]);
    expect(evidence.checks.filter((c) => c.result === 'skipped').map((c) => c.id)).toEqual(['R-engineer']);
    expect(result(evidence, 'M-viewer')).toBe('passed');
    expect(result(evidence, 'M-operator')).toBe('passed');
    expect(evidence.summary.failed).toBe(0);
  });

  it('never sends a write-class multiuser message and logs every session out', async () => {
    await probe();
    expect(new Set(appliance!.multiuserTypes)).toEqual(new Set(['room_join', 'room_leave']));
    expect(appliance!.logouts.sort()).toEqual(['admin', 'operator', 'viewer']);
  });

  it('fails the checks a broken Appliance breaks', async () => {
    const evidence = await probe({ gatewayOpen: true, viewerGetsOperator: true, wrongSessionRole: true });
    expect(result(evidence, 'A4')).toBe('failed');
    expect(result(evidence, 'M-viewer')).toBe('failed');
    expect(result(evidence, 'R-operator')).toBe('failed');
    expect(evidence.summary.failed).toBe(3);
  });

  it('records no secret in the evidence', async () => {
    const evidence = await probe();
    const text = JSON.stringify(evidence);
    for (const secret of ['v-secret-1', 'o-secret-1', 'a-secret-1', '__Host-rv-access', 'csrf-']) expect(text).not.toContain(secret);
  });

  it('skips the multiuser checks unless asked for them', async () => {
    const evidence = await probe({}, false);
    expect(result(evidence, 'M0')).toBe('skipped');
    expect(appliance!.multiuserTypes).toEqual([]);
  });

  it('refuses plain HTTP outside loopback and insists on --url https and --ca', async () => {
    await expect(makeRequester({ allowHttpLoopback: true })('http://appliance.example.test/')).rejects.toThrow(/loopback/);
    expect(() => __testing.parseArgs(['--url', 'http://x'])).toThrow(/https/);
    expect(() => __testing.parseArgs(['--url', 'https://x'])).toThrow(/--ca/);
    expect(__testing.parseArgs(['--url', 'https://x', '--ca', 'root.crt', '--multiuser'])).toMatchObject({ multiuser: true });
    expect(__testing.sessionCookie({ 'set-cookie': ['__Host-rv-access=; Max-Age=0'] })).toBeNull();
  });
});
