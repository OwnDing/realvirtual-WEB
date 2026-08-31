// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildOfflineAppliance } from '../scripts/build-offline-appliance.mjs';
import { normalizeBundlePath, verifyBundle } from '../appliance/runtime/lib/bundle.mjs';

const cleanups: string[] = [];

afterEach(() => {
  for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true });
});

function sha(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function arm64Elf(label: string) {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46]);
  bytes.writeUInt16LE(183, 18);
  bytes.write(label, 24, 'utf8');
  return bytes;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rv-appliance-test-'));
  cleanups.push(root);
  const dependencies = join(root, 'dependencies');
  const web = join(root, 'web');
  const output = join(root, 'bundle');
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>fixture</title>');
  writeFileSync(join(web, 'settings.json'), '{"schemaVersion":2}\n');
  const rows = [
    ['node', 'node', 'runtime/node/bin/node'],
    ['caddy', 'caddy', 'runtime/caddy/caddy'],
    ['connect', 'connect', 'runtime/connect/realvirtual-Connect'],
    ['forgejo', 'forgejo', 'runtime/forgejo/forgejo'],
    ['influxdb', 'influxd', 'runtime/influxdb/influxd'],
    ['influx-cli', 'influx', 'runtime/influx-cli/influx'],
    ['oci-images', 'images.tar', 'images/appliance-images.tar'],
  ] as const;
  const runtimeFiles = rows.map(([component, source, destination]) => {
    const bytes = component === 'oci-images' ? Buffer.from('real-nonempty-oci-images') : arm64Elf(component);
    const path = join(dependencies, source);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
    chmodSync(path, 0o755);
    return { component, source, destination, bytes: bytes.length, sha256: sha(bytes) };
  });
  const licenseFiles = rows.map(([component]) => {
    const bytes = Buffer.from(`license-text-${component}`);
    const source = `licenses/${component}.txt`;
    const path = join(dependencies, source);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
    return { component, source, destination: `licenses/third-party/${component}.txt`, bytes: bytes.length, sha256: sha(bytes) };
  });
  const files = [...runtimeFiles, ...licenseFiles].sort((a, b) => a.source.localeCompare(b.source));
  const lock = {
    schemaVersion: 1,
    target: 'linux-arm64',
    components: rows.map(([id]) => ({ id, version: '1.0.0', license: 'TEST-LICENSE', licenseFiles: [`licenses/third-party/${id}.txt`] })),
    files,
  };
  const lockPath = join(root, 'dependency-lock.json');
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return { root, dependencies, web, output, lock, lockPath };
}

describe('offline appliance bundle', () => {
  it('builds a complete target bundle and verifies every file', async () => {
    const f = fixture();
    const built = await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: f.dependencies,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    });
    expect(built.manifest.services).toEqual(['edge', 'control', 'web', 'connect', 'forgejo', 'influxdb']);
    expect(built.manifest.files.some((file: any) => file.path === 'web/index.html')).toBe(true);
    const verified = await verifyBundle(f.output, { expectedTarget: 'linux-arm64' });
    expect(verified.version).toBe('6.3.27');
    expect(readFileSync(join(f.output, 'container', 'compose.yaml'), 'utf8')).toContain('pull_policy: never');
  });

  it('detects a changed file instead of trusting the manifest', async () => {
    const f = fixture();
    await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: f.dependencies,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    });
    writeFileSync(join(f.output, 'web', 'index.html'), '<!doctype html><title>tampered</title>');
    await expect(verifyBundle(f.output)).rejects.toThrow(/size mismatch|digest mismatch/);
  });

  it('fails closed for missing components, extras, and fixture locks', async () => {
    const missing = fixture();
    missing.lock.components = missing.lock.components.filter((item) => item.id !== 'connect');
    writeFileSync(missing.lockPath, JSON.stringify(missing.lock));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: missing.dependencies,
      dependencyLock: missing.lockPath, webDist: missing.web, output: missing.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/missing required component: connect/);

    const extra = fixture();
    writeFileSync(join(extra.dependencies, 'undeclared.bin'), 'not allowed');
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: extra.dependencies,
      dependencyLock: extra.lockPath, webDist: extra.web, output: extra.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/Unexpected dependency input/);

    const marked = fixture();
    writeFileSync(marked.lockPath, JSON.stringify({ ...marked.lock, testFixture: true }));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: marked.dependencies,
      dependencyLock: marked.lockPath, webDist: marked.web, output: marked.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/test-fixture/);

    const noticeTemplate = fixture();
    const noticeFile = noticeTemplate.lock.files.find((item) => item.component === 'connect' && item.destination.startsWith('licenses/'))!;
    const noticeBytes = Buffer.from('MUST_BE_REPLACED_BY_RELEASE_ENGINEERING');
    writeFileSync(join(noticeTemplate.dependencies, noticeFile.source), noticeBytes);
    noticeFile.bytes = noticeBytes.length;
    noticeFile.sha256 = sha(noticeBytes);
    writeFileSync(noticeTemplate.lockPath, JSON.stringify(noticeTemplate.lock));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: noticeTemplate.dependencies,
      dependencyLock: noticeTemplate.lockPath, webDist: noticeTemplate.web, output: noticeTemplate.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/release template/);
  });

  it('rejects traversal and absolute bundle paths', () => {
    expect(() => normalizeBundlePath('../escape')).toThrow(/Unsafe/);
    expect(() => normalizeBundlePath('/absolute')).toThrow(/Unsafe/);
    expect(() => normalizeBundlePath('a//b')).toThrow(/Unsafe/);
  });
});
