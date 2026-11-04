// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildNativeServiceDefinitions } from '../appliance/runtime/manager.mjs';
import { renderTemplate, validateApplianceConfig } from '../appliance/runtime/lib/config.mjs';

const root = resolve(import.meta.dirname, '..');

const CONFIG = {
  schemaVersion: 1,
  hostname: 'appliance.plant.example', influxHostname: 'influx.appliance.plant.example',
  httpsPort: 443, httpPort: 80, controlPort: 8081, connectPort: 5100, forgejoPort: 3000, influxPort: 8086,
  tls: { mode: 'internal-ca', certificate: null, privateKey: null },
  authentication: { operatorUser: 'operator' },
};

describe('appliance runtime topology', () => {
  it('validates stable host/port configuration and rejects collisions', () => {
    expect(validateApplianceConfig(CONFIG).hostname).toBe('appliance.plant.example');
    expect(() => validateApplianceConfig({ ...CONFIG, influxPort: 5100 })).toThrow(/conflicts/);
    expect(() => validateApplianceConfig({ ...CONFIG, hostname: 'https://bad.example' })).toThrow(/without scheme/);
  });

  it('renders templates only when every variable is supplied', () => {
    expect(renderTemplate('hello {{NAME}}', { NAME: 'appliance' })).toBe('hello appliance');
    expect(() => renderTemplate('{{MISSING}}', {})).toThrow(/missing/);
  });

  it('defines the native services for Linux and Windows, with CONNECT only when the release has it', () => {
    const roots = { installRoot: '/opt/xyvirtual', configRoot: '/etc/xyvirtual', stateRoot: '/var/lib/xyvirtual' };
    const withConnect = ['edge', 'control', 'web', 'gateway', 'connect', 'forgejo', 'influxdb'];
    const withoutConnect = withConnect.filter((id) => id !== 'connect');
    const linux = buildNativeServiceDefinitions({ roots, releaseRoot: '/opt/xyvirtual/releases/1', manifest: { target: 'linux-x64', services: withConnect } as any, config: CONFIG as any });
    expect(linux.map((item) => item.id)).toEqual(['control', 'gateway', 'connect', 'forgejo', 'influxdb', 'edge']);
    expect(linux.every((item) => item.unit?.includes('Restart=on-failure'))).toBe(true);
    const gateway = linux.find((item) => item.id === 'gateway')!;
    expect(gateway.unit).toContain('runtime/gateway/src/main.mjs');
    expect(gateway.unit).toContain('User=xyvirtual');
    const linuxNoConnect = buildNativeServiceDefinitions({ roots, releaseRoot: '/opt/xyvirtual/releases/1', manifest: { target: 'linux-x64', services: withoutConnect } as any, config: CONFIG as any });
    expect(linuxNoConnect.map((item) => item.id)).toEqual(['control', 'gateway', 'forgejo', 'influxdb', 'edge']);
    const windows = buildNativeServiceDefinitions({ roots, releaseRoot: 'C:\\XYvirtual\\releases\\1', manifest: { target: 'windows-x64', services: withoutConnect } as any, config: CONFIG as any });
    expect(windows.map((item) => item.id)).toEqual(['control', 'gateway', 'forgejo', 'influxdb', 'edge']);
    expect(windows.every((item) => item.wrapper?.endsWith('.exe'))).toBe(true);
  });

  // EP-APPLIANCE-001 rehearsal (2026-11-04): systemd does not unquote WorkingDirectory=, so the
  // quoted form was a fatal "path is not absolute" in every unit and no native install started.
  it('renders systemd units that systemd itself accepts', () => {
    const roots = { installRoot: '/opt/xy virtual', configRoot: '/etc/xy virtual', stateRoot: '/var/lib/xy virtual 100%' };
    const units = buildNativeServiceDefinitions({ roots, releaseRoot: '/opt/xy virtual/releases/1', manifest: { target: 'linux-arm64', services: ['edge', 'control', 'web', 'gateway', 'forgejo', 'influxdb'] } as any, config: CONFIG as any });
    for (const { id, unit } of units) {
      expect(unit, id).toContain('\nWorkingDirectory=/var/lib/xy virtual 100%%\n');
      expect(unit, id).toContain('\nReadWritePaths="/var/lib/xy virtual 100%%"\n');
    }
    // influxd 2.x has no --config flag (it exited on every start); the path goes in its env.
    const influx = units.find(({ id }) => id === 'influxdb')!.unit!;
    expect(influx).not.toContain('--config');
    expect(influx).toContain('\nEnvironment="INFLUXD_CONFIG_PATH=/etc/xy virtual/influxdb.toml"\n');
    expect(influx).toMatch(/\nExecStart="\/opt\/xy virtual\/releases\/1\/runtime\/influxdb\/influxd"\n/);
    const analyze = spawnSync('systemd-analyze', ['--version'], { stdio: 'ignore' });
    if (analyze.error || analyze.status !== 0) return; // not a systemd host (macOS/Windows dev machines)
    const dir = mkdtempSync(join(tmpdir(), 'rv-units-'));
    try {
      for (const { id, unit } of units) writeFileSync(join(dir, `xyvirtual-${id}.service`), unit!);
      const result = spawnSync('systemd-analyze', ['verify', ...units.map(({ id }) => join(dir, `xyvirtual-${id}.service`))], { encoding: 'utf8' });
      const own = `${result.stdout}${result.stderr}`.split('\n').filter((line) => line.includes(dir));
      expect(own.filter((line) => /bad unit file setting|fatal error|not absolute|Failed to parse/i.test(line))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps the HTTPS journey test rendering every Caddyfile variable through the installer renderer', () => {
    const template = readFileSync(resolve(root, 'appliance/config/Caddyfile.template'), 'utf8');
    const script = readFileSync(resolve(root, 'scripts/test-protected-presentations.mjs'), 'utf8');
    expect(script).toContain('renderCaddyfile(');
    const names = new Set([...template.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]).filter((n) => n !== 'CONNECT_ROUTES'));
    for (const name of names) expect(script, `scripts/test-protected-presentations.mjs does not set ${name}`).toMatch(new RegExp(`\\b${name}:`));
  });

  it('has no customer-side package or image downloads', () => {
    const files = [
      'appliance/runtime/manager.mjs', 'appliance/runtime/lib/config.mjs', 'appliance/native/linux/install.sh',
      'appliance/native/windows/Invoke-ApplianceManager.ps1', 'appliance/container/compose.yaml',
      'appliance/config/Caddyfile.template',
    ];
    const source = files.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
    expect(source).not.toMatch(/\b(?:curl|wget|npm\s+(?:install|ci)|docker\s+pull|podman\s+pull)\b/);
    expect(source).toContain('pull_policy: never');
    expect(source).toContain('internal: true');
    expect(source).toContain('networks: [frontend, backend]');
    expect(source).toContain('frontend:');
    expect(source).toContain('rv_connect_origin=1');
    expect(source).toContain('@connectRoot path /health /ws /webviewer');
  });
});
