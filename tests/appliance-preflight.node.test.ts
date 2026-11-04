// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPreflight } from '../appliance/runtime/lib/preflight.mjs';

/**
 * EP-APPLIANCE-001 local rehearsal (2026-11-04): a release built without CONNECT
 * (optional since ADR-0023) was refused by its own preflight with
 * `RUNTIME_MISSING runtime/connect/realvirtual-Connect`, so no gateway-only
 * appliance could be installed. The entrypoints and the CONNECT port follow the
 * release's declared services, as the installer's `hasConnect` already does.
 */
const cleanups: string[] = [];
afterEach(() => { for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true }); });

const BASE = ['runtime/node/bin/node', 'runtime/caddy/caddy', 'runtime/forgejo/forgejo', 'runtime/influxdb/influxd', 'runtime/influx-cli/influx'];
const CONNECT = 'runtime/connect/realvirtual-Connect';

async function preflight(services: string[], present: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'rv-appliance-preflight-'));
  cleanups.push(root);
  const bundle = join(root, 'bundle');
  for (const rel of present) {
    mkdirSync(dirname(join(bundle, rel)), { recursive: true });
    writeFileSync(join(bundle, rel), 'x');
    chmodSync(join(bundle, rel), 0o755);
  }
  const configPath = join(root, 'appliance.json');
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1, hostname: 'appliance.test', influxHostname: 'influx.appliance.test',
    httpsPort: 443, httpPort: 80, controlPort: 8081, gatewayPort: 5200, connectPort: 5100, forgejoPort: 3000, influxPort: 8086,
    tls: { mode: 'internal-ca', certificate: null, privateKey: null, trustBundle: null },
    authentication: { operatorUser: 'operator' }, license: { file: null },
  }));
  const bound: number[] = [];
  const report = await runPreflight({
    bundleRoot: bundle, configPath, expectedTarget: 'linux-arm64', mode: 'container',
    containerRuntime: 'unavailable-in-test', verifyPlatform: false, minimumFreeBytes: 0,
  }, {
    verifyBundleImpl: async () => ({ version: '6.3.27', target: 'linux-arm64', services, compatibility: null }),
    isAdministratorImpl: async () => true,
    lookupImpl: async () => [{ address: '192.0.2.10', family: 4 }],
    canBindImpl: async (port: number) => { bound.push(port); return { ok: true }; },
  });
  const runtime = report.findings.filter((item: any) => item.id.startsWith('runtime:'));
  return { report, runtime, bound };
}

describe('appliance preflight follows the release components (ADR-0023)', () => {
  it('does not require the CONNECT binary or port when the release has no CONNECT', async () => {
    const { runtime, bound } = await preflight(['edge', 'control', 'web', 'gateway', 'forgejo', 'influxdb'], BASE);
    expect(runtime.map((item: any) => item.detail)).toEqual(BASE);
    expect(runtime.every((item: any) => item.status === 'pass')).toBe(true);
    expect(bound).not.toContain(5100);
    expect(bound).toEqual(expect.arrayContaining([80, 443, 8081, 3000, 8086]));
  });

  it('still requires the CONNECT binary and checks its port when the release ships CONNECT', async () => {
    const services = ['edge', 'control', 'web', 'gateway', 'connect', 'forgejo', 'influxdb'];
    const missing = await preflight(services, BASE);
    expect(missing.runtime.find((item: any) => item.detail === CONNECT)).toMatchObject({ status: 'fail', code: 'RUNTIME_MISSING' });
    expect(missing.report.ok).toBe(false);
    expect(missing.bound).toContain(5100);
    const shipped = await preflight(services, [...BASE, CONNECT]);
    expect(shipped.runtime.find((item: any) => item.detail === CONNECT)).toMatchObject({ status: 'pass', code: 'RUNTIME_PRESENT' });
  });
});
