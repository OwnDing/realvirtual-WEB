// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('defines all five native services for Linux and Windows', () => {
    const roots = { installRoot: '/opt/xyvirtual', configRoot: '/etc/xyvirtual', stateRoot: '/var/lib/xyvirtual' };
    const linux = buildNativeServiceDefinitions({ roots, releaseRoot: '/opt/xyvirtual/releases/1', manifest: { target: 'linux-x64' } as any, config: CONFIG as any });
    expect(linux.map((item) => item.id)).toEqual(['control', 'connect', 'forgejo', 'influxdb', 'edge']);
    expect(linux.every((item) => item.unit?.includes('Restart=on-failure'))).toBe(true);
    const windows = buildNativeServiceDefinitions({ roots, releaseRoot: 'C:\\XYvirtual\\releases\\1', manifest: { target: 'windows-x64' } as any, config: CONFIG as any });
    expect(windows.map((item) => item.id)).toEqual(['control', 'connect', 'forgejo', 'influxdb', 'edge']);
    expect(windows.every((item) => item.wrapper?.endsWith('.exe'))).toBe(true);
  });

  it('has no customer-side package or image downloads', () => {
    const files = [
      'appliance/runtime/manager.mjs', 'appliance/native/linux/install.sh',
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
