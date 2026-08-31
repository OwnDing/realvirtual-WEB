// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createControlServer, validateControlConfig } from '../appliance/runtime/control-plane.mjs';

const roots: string[] = [];
const servers: Array<ReturnType<typeof createControlServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(services = [
  { id: 'connect', url: 'http://127.0.0.1:5100/health', required: true },
  { id: 'forgejo', url: 'http://127.0.0.1:3000/api/healthz', required: true },
  { id: 'influxdb', url: 'http://127.0.0.1:8086/health', required: true },
]) {
  const root = mkdtempSync(join(tmpdir(), 'rv-control-test-'));
  roots.push(root);
  return {
    schemaVersion: 1, version: '6.3.27', target: 'linux-x64', installId: '12345678-1234-1234-1234-123456789abc',
    bundleRoot: root, host: '127.0.0.1', port: 0, staticRoot: root,
    integrityTtlMs: 0, probeTimeoutMs: 100, services,
  };
}

async function listeningServer(fetchImpl: typeof fetch) {
  const server = createControlServer(config(), {
    verifyBundleImpl: async () => ({ version: '6.3.27' }),
    fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('appliance control plane', () => {
  it('separates liveness from dependency readiness', async () => {
    const base = await listeningServer(async () => new Response('{}', { status: 200 }));
    const live = await fetch(`${base}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok', service: 'appliance-control' });
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    const body = await ready.json();
    expect(body.status).toBe('ok');
    expect(body.checks.map((item: any) => item.id)).toEqual(['release', 'connect', 'forgejo', 'influxdb']);
  });

  it('returns 503 and stable codes without leaking probe URLs', async () => {
    const base = await listeningServer(async () => { throw Object.assign(new Error('secret at http://user:password@host'), { code: 'ECONNREFUSED' }); });
    const response = await fetch(`${base}/health/ready`);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain('ECONNREFUSED');
    expect(text).not.toContain('password');
    expect(text).not.toContain('127.0.0.1:5100');
  });

  it('does not treat authentication and not-found responses as healthy', async () => {
    const base = await listeningServer(async () => new Response('{}', { status: 404 }));
    const response = await fetch(`${base}/health/ready`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('HTTP_404');
  });

  it('rejects credential-bearing health URLs', () => {
    expect(() => validateControlConfig(config([{ id: 'bad', url: 'http://user:secret@localhost/health', required: true }]))).toThrow(/Unsafe health probe URL/);
  });

  it('returns sanitized host certificate evidence without exposing its file path', async () => {
    const raw = {
      ...config([]),
      certificate: { mode: 'customer', path: '/secret/customer/server.crt', hostnames: ['appliance.test'] },
    };
    const server = createControlServer(raw, { verifyBundleImpl: async () => ({ version: '6.3.27' }) });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    const text = await fetch(`http://127.0.0.1:${address.port}/appliance/api/info`).then((response) => response.text());
    expect(text).toContain('CERTIFICATE_EVIDENCE_UNAVAILABLE');
    expect(text).not.toContain('/secret/customer/server.crt');
  });
});
