// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildOfflineAppliance } from '../scripts/build-offline-appliance.mjs';
import { backupAppliance, installOrUpgrade, restoreAppliance, uninstallAppliance } from '../appliance/runtime/manager.mjs';

const cleanups: string[] = [];

afterEach(() => {
  for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true });
});

function digest(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function arm64Elf(label: string) {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46]);
  bytes.writeUInt16LE(183, 18);
  bytes.write(label, 24, 'utf8');
  return bytes;
}

async function bundle(root: string, name: string, connectVersion: string) {
  const dependencyRoot = join(root, `${name}-dependencies`);
  const web = join(root, `${name}-web`);
  const output = join(root, name);
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>appliance</title>');
  writeFileSync(join(web, 'settings.json'), '{"schemaVersion":2}\n');
  const rows = [
    ['node', 'node', 'runtime/node/bin/node'],
    ['caddy', 'caddy', 'runtime/caddy/caddy'],
    ['connect', 'connect', 'runtime/connect/realvirtual-Connect'],
    ['forgejo', 'forgejo', 'runtime/forgejo/forgejo'],
    ['influxdb', 'influxd', 'runtime/influxdb/influxd'],
    ['influx-cli', 'influx', 'runtime/influx-cli/influx'],
  ] as const;
  const files: Array<{ component: string; source: string; destination: string; bytes: number; sha256: string }> = [];
  for (const [component, source, destination] of rows) {
    const bytes = arm64Elf(component);
    const path = join(dependencyRoot, source);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
    chmodSync(path, 0o755);
    files.push({ component, source, destination, bytes: bytes.length, sha256: digest(bytes) });
    const licenseBytes = Buffer.from(`license-${component}`);
    const licenseSource = `licenses/${component}.txt`;
    const licensePath = join(dependencyRoot, licenseSource);
    mkdirSync(join(licensePath, '..'), { recursive: true });
    writeFileSync(licensePath, licenseBytes);
    files.push({
      component, source: licenseSource, destination: `licenses/third-party/${component}.txt`,
      bytes: licenseBytes.length, sha256: digest(licenseBytes),
    });
  }
  files.sort((a, b) => a.source.localeCompare(b.source));
  const lock = {
    schemaVersion: 1,
    target: 'linux-arm64',
    components: rows.map(([id]) => ({
      id,
      version: id === 'connect' ? connectVersion : '1.0.0',
      license: 'TEST-LICENSE',
      licenseFiles: [`licenses/third-party/${id}.txt`],
    })),
    files,
  };
  const lockPath = join(root, `${name}-lock.json`);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  await buildOfflineAppliance({
    target: 'linux-arm64', modes: 'native', dependencyRoot, dependencyLock: lockPath,
    webDist: web, output, archive: false, createdAt: '2026-08-30T00:00:00.000Z',
  });
  return output;
}

function setBundleVersion(path: string, version: string) {
  const manifestPath = join(path, 'appliance-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(manifestPath, bytes);
  writeFileSync(join(path, 'manifest.sha256'), `${digest(bytes)}\n`);
}

function configAt(root: string) {
  const path = join(root, 'appliance.json');
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    hostname: 'appliance.test.internal',
    influxHostname: 'influx.appliance.test.internal',
    httpsPort: 443, httpPort: 80, controlPort: 8081, connectPort: 5100, forgejoPort: 3000, influxPort: 8086,
    tls: { mode: 'internal-ca', certificate: null, privateKey: null },
    authentication: { operatorUser: 'operator' },
  }, null, 2)}\n`);
  return path;
}

function options(root: string, bundleRoot: string, configPath: string) {
  return {
    bundleRoot, configPath, expectedTarget: 'linux-arm64', verifyPlatform: false,
    mode: 'native', installRoot: join(root, 'install-root'), configRoot: join(root, 'config-root'),
    stateRoot: join(root, 'state-root'), systemdUnitRoot: join(root, 'systemd'), minimumFreeBytes: 0,
  };
}

function dependencies(readiness: () => Promise<void>) {
  return {
    lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
    canBindImpl: async () => ({ ok: true }),
    isAdministratorImpl: async () => true,
    runImpl: (command: string, args: string[] = []) => {
      if (command.includes('caddy') && args[0] === 'hash-password') return '$argon2id$v=19$m=65536,t=3,p=2$fixture$fixture';
      if (command === 'runuser' && args.includes('create')) return 'generated random password: fixture-forgejo-password';
      return '';
    },
    bootstrapFetchImpl: async () => new Response('{"allowed":false}', { status: 200, headers: { 'content-type': 'application/json' } }),
    waitForReadinessImpl: readiness,
  };
}

describe('appliance lifecycle', () => {
  it('preserves secrets on repeat install and restores an exact backup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-appliance-lifecycle-'));
    cleanups.push(root);
    const release = await bundle(root, 'release', '1.0.0');
    const configPath = configAt(root);
    const installOptions = options(root, release, configPath);
    const deps = dependencies(async () => {});
    const first = await installOrUpgrade(installOptions, deps);
    const password = readFileSync(join(first.roots.stateRoot, 'secrets', 'operator-password'), 'utf8');
    const installId = first.state.installId;
    const second = await installOrUpgrade(installOptions, deps);
    expect(second.generatedOperatorPassword).toBeNull();
    expect(second.state.installId).toBe(installId);
    expect(readFileSync(join(first.roots.stateRoot, 'secrets', 'operator-password'), 'utf8')).toBe(password);

    const sentinel = join(first.roots.stateRoot, 'data', 'connect', 'sentinel.txt');
    writeFileSync(sentinel, 'before-backup');
    const backup = await backupAppliance({ ...installOptions, noStop: true }, deps);
    writeFileSync(sentinel, 'after-backup');
    await restoreAppliance({ ...installOptions, backupPath: backup, confirmRestore: installId, noStop: true }, deps);
    expect(readFileSync(sentinel, 'utf8')).toBe('before-backup');

    writeFileSync(join(backup, 'undeclared.txt'), 'tamper');
    await expect(restoreAppliance({ ...installOptions, backupPath: backup, confirmRestore: installId, noStop: true }, deps)).rejects.toThrow(/count mismatch|Unexpected backup/);
  });

  it('restores the previous consistency backup when a data-service upgrade fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-appliance-upgrade-'));
    cleanups.push(root);
    const original = await bundle(root, 'release-old', '1.0.0');
    const candidate = await bundle(root, 'release-new', '2.0.0');
    setBundleVersion(candidate, '6.3.28');
    const configPath = configAt(root);
    const originalOptions = options(root, original, configPath);
    let readinessCalls = 0;
    let sentinel = '';
    const deps = dependencies(async () => {
      readinessCalls += 1;
      if (readinessCalls === 2) {
        writeFileSync(sentinel, 'candidate-mutated-data');
        throw new Error('candidate-not-ready');
      }
    });
    const installed = await installOrUpgrade(originalOptions, deps);
    sentinel = join(installed.roots.stateRoot, 'data', 'connect', 'schema.txt');
    writeFileSync(sentinel, 'old-data');

    await expect(installOrUpgrade(options(root, candidate, configPath), deps)).rejects.toThrow('candidate-not-ready');
    const state = JSON.parse(readFileSync(join(installed.roots.stateRoot, 'install-state.json'), 'utf8'));
    expect(state.version).toBe('6.3.27');
    expect(readFileSync(sentinel, 'utf8')).toBe('old-data');
    expect(readinessCalls).toBe(3);
    expect(JSON.parse(readFileSync(join(installed.roots.installRoot, 'current.json'), 'utf8')).version).toBe('6.3.27');
  });

  it('validates purge confirmation before deleting any managed path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-appliance-uninstall-'));
    cleanups.push(root);
    const release = await bundle(root, 'release', '1.0.0');
    const configPath = configAt(root);
    const installOptions = options(root, release, configPath);
    const deps = dependencies(async () => {});
    const installed = await installOrUpgrade(installOptions, deps);
    expect(() => uninstallAppliance({ ...installOptions, noStop: true, purgeData: true, confirmPurge: 'wrong' }, deps)).toThrow(/exact installId/);
    expect(existsSync(installed.roots.installRoot)).toBe(true);
    uninstallAppliance({ ...installOptions, noStop: true, purgeData: true, confirmPurge: installed.state.installId }, deps);
    expect(existsSync(installed.roots.installRoot)).toBe(false);
    expect(existsSync(installed.roots.configRoot)).toBe(false);
    expect(existsSync(installed.roots.stateRoot)).toBe(false);
  });
});
