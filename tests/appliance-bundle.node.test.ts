// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { assertArchiveMatchesBundle, buildOfflineAppliance, readArchiveEntries } from '../scripts/build-offline-appliance.mjs';
import { normalizeBundlePath, verifyBundle } from '../appliance/runtime/lib/bundle.mjs';
import { gatewayFixture } from './helpers/gateway-fixture';

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
  mkdirSync(join(web, 'present'), { recursive: true });
  writeFileSync(join(web, 'present', 'index.html'), '<!doctype html><title>presentation fixture</title>');
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
  return { root, dependencies, web, output, lock, lockPath, gateway: gatewayFixture(root) };
}

describe('offline appliance bundle', () => {
  it('builds without CONNECT, with the gateway and the same-origin WEB preset (ADR-0023)', async () => {
    const f = fixture();
    const connectFiles = f.lock.files.filter((item) => item.component === 'connect');
    f.lock.components = f.lock.components.filter((item) => item.id !== 'connect');
    f.lock.files = f.lock.files.filter((item) => item.component !== 'connect');
    for (const file of connectFiles) rmSync(join(f.dependencies, file.source));
    writeFileSync(f.lockPath, JSON.stringify(f.lock));
    const built = await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: f.dependencies, gatewayRoot: f.gateway,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    });
    expect(built.manifest.services).toEqual(['edge', 'control', 'web', 'gateway', 'forgejo', 'influxdb']);
    expect(built.manifest.components.some((c: any) => c.id === 'connect')).toBe(false);
    expect(readFileSync(join(f.output, 'runtime', 'gateway', 'src', 'main.mjs'), 'utf8')).toContain('fixture gateway');
    expect(readFileSync(join(f.output, 'runtime', 'gateway', 'node_modules', 'fixture-dep', 'LICENSE'), 'utf8')).toContain('MIT');
    expect(readFileSync(join(f.output, 'licenses', 'third-party', 'gateway-npm-notices.txt'), 'utf8')).toContain('fixture-dep@1.0.0');
    const settings = JSON.parse(readFileSync(join(f.output, 'web', 'settings.json'), 'utf8'));
    expect(settings.services.historian).toEqual({ url: '/gateway/history' });
    expect(settings.interface).toMatchObject({ activeType: 'websocket-realtime', wsAddress: '', wsPath: '/gateway/ws' });
    expect(settings.services.access).toEqual({ url: '/api/access/v1' });
    expect(settings.services.projects).toEqual({ url: '/api/projects/v1' });
    expect(settings.services.multiuser).toEqual({ url: '/gateway/multiuser' });
    expect(readFileSync(join(f.output, 'web', 'login', 'index.html'), 'utf8')).toContain('login.mjs');
    await expect(verifyBundle(f.output, { expectedTarget: 'linux-arm64' })).resolves.toBeTruthy();
  });

  it('refuses a gateway install that is not exactly the production lock', async () => {
    const dev = fixture();
    mkdirSync(join(dev.gateway, 'node_modules', 'fixture-dev'), { recursive: true });
    writeFileSync(join(dev.gateway, 'node_modules', 'fixture-dev', 'package.json'), JSON.stringify({ name: 'fixture-dev', version: '1.0.0' }));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: dev.dependencies, gatewayRoot: dev.gateway,
      dependencyLock: dev.lockPath, webDist: dev.web, output: dev.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/development package/);
    const unlocked = fixture();
    mkdirSync(join(unlocked.gateway, 'node_modules', 'sneaky'), { recursive: true });
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: unlocked.dependencies, gatewayRoot: unlocked.gateway,
      dependencyLock: unlocked.lockPath, webDist: unlocked.web, output: unlocked.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/unlocked package/);
  });

  it('builds a complete target bundle and verifies every file', async () => {
    const f = fixture();
    const built = await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: f.dependencies, gatewayRoot: f.gateway,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    });
    expect(built.manifest.services).toEqual(['edge', 'control', 'web', 'gateway', 'connect', 'forgejo', 'influxdb']);
    expect(built.manifest.components.find((c: any) => c.id === 'gateway')).toMatchObject({ license: 'AGPL-3.0-only', version: '0.1.0' });
    expect(built.manifest.files.some((file: any) => file.path === 'web/index.html')).toBe(true);
    const verified = await verifyBundle(f.output, { expectedTarget: 'linux-arm64' });
    expect(verified.version).toBe('6.3.27');
    expect(readFileSync(join(f.output, 'container', 'compose.yaml'), 'utf8')).toContain('pull_policy: never');
  });

  it('detects a changed file instead of trusting the manifest', async () => {
    const f = fixture();
    await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: f.dependencies, gatewayRoot: f.gateway,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    });
    writeFileSync(join(f.output, 'web', 'index.html'), '<!doctype html><title>tampered</title>');
    await expect(verifyBundle(f.output)).rejects.toThrow(/size mismatch|digest mismatch/);
  });

  it('fails closed for missing components, extras, and fixture locks', async () => {
    const missing = fixture();
    missing.lock.components = missing.lock.components.filter((item) => item.id !== 'forgejo');
    writeFileSync(missing.lockPath, JSON.stringify(missing.lock));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: missing.dependencies, gatewayRoot: missing.gateway,
      dependencyLock: missing.lockPath, webDist: missing.web, output: missing.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/missing required component: forgejo/);

    const extra = fixture();
    writeFileSync(join(extra.dependencies, 'undeclared.bin'), 'not allowed');
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: extra.dependencies, gatewayRoot: extra.gateway,
      dependencyLock: extra.lockPath, webDist: extra.web, output: extra.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/Unexpected dependency input/);

    const marked = fixture();
    writeFileSync(marked.lockPath, JSON.stringify({ ...marked.lock, testFixture: true }));
    await expect(buildOfflineAppliance({
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: marked.dependencies, gatewayRoot: marked.gateway,
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
      target: 'linux-arm64', modes: 'container,native', dependencyRoot: noticeTemplate.dependencies, gatewayRoot: noticeTemplate.gateway,
      dependencyLock: noticeTemplate.lockPath, webDist: noticeTemplate.web, output: noticeTemplate.output,
      archive: false, createdAt: '2026-08-30T00:00:00.000Z',
    })).rejects.toThrow(/release template/);
  });

  // EP-APPLIANCE-001 local rehearsal (2026-11-04): an archive built on macOS carried an
  // AppleDouble `._*` entry and an xattr record for every file. GNU tar on the Linux host
  // extracted 4,951 extra files and preflight correctly refused the bundle (BUNDLE_INVALID).
  // macOS `tar -t` hides those entries, so the archive is read with the builder's own parser.
  it('archives exactly the bundle inventory, with no platform metadata', async () => {
    const f = fixture();
    const built = await buildOfflineAppliance({
      target: 'linux-arm64', modes: 'native', dependencyRoot: f.dependencies, gatewayRoot: f.gateway,
      dependencyLock: f.lockPath, webDist: f.web, output: f.output,
      archive: true, createdAt: '2026-08-30T00:00:00.000Z',
    });
    expect(built.archive).toBe(`${f.output}.tar.gz`);
    const entries = await readArchiveEntries(built.archive!);
    expect(entries.violations).toEqual([]);
    const expected = [...built.manifest.files.map((file: any) => `bundle/${file.path}`), 'bundle/appliance-manifest.json', 'bundle/manifest.sha256'];
    expect([...entries.files].sort()).toEqual(expected.sort());
    expect(entries.directories.every((dir) => dir === 'bundle' || dir.startsWith('bundle/'))).toBe(true);
  });

  it('refuses an archive with entries or metadata outside the inventory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-appliance-archive-'));
    cleanups.push(root);
    const tarHeader = (name: string, size: number, type: string, linkname = '') => {
      const header = Buffer.alloc(512);
      header.write(name, 0, 'utf8');
      header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
      header.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
      header.write('00000000000\0', 136);
      header.write(type, 156);
      header.write(linkname, 157);
      header.write('ustar\0', 257); header.write('00', 263);
      header.fill(0x20, 148, 156);
      let sum = 0; for (const byte of header) sum += byte;
      header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
      return header;
    };
    const entry = (name: string, body: Buffer, type = '0', linkname = '') => Buffer.concat([
      tarHeader(name, type === '2' ? 0 : body.length, type, linkname),
      ...(type === '2' ? [] : [body, Buffer.alloc((512 - (body.length % 512)) % 512)]),
    ]);
    const pax = (records: Record<string, string>) => {
      const text = Object.entries(records).map(([key, value]) => {
        const tail = ` ${key}=${value}\n`;
        let length = tail.length + 1;
        while (`${length}${tail}`.length !== length) length += 1;
        return `${length}${tail}`;
      }).join('');
      return entry('PaxHeader/x', Buffer.from(text), 'x');
    };
    const write = (name: string, parts: Buffer[]) => {
      const path = join(root, name);
      writeFileSync(path, gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)])));
      return path;
    };
    const good = [entry('bundle/', Buffer.alloc(0), '5'), entry('bundle/a.txt', Buffer.from('a')), entry('bundle/manifest.sha256', Buffer.from('m'))];
    await expect(assertArchiveMatchesBundle(write('good.tar.gz', good), 'bundle', ['a.txt', 'manifest.sha256'])).resolves.toEqual({ files: 2, directories: 1 });
    const cases: Array<[string, Buffer[], RegExp]> = [
      ['appledouble', [...good, entry('bundle/._a.txt', Buffer.from('Mac OS X        ATTR'))], /extra bundle\/\._a\.txt/],
      ['root-appledouble', [entry('._bundle', Buffer.from('ATTR')), ...good], /extra \._bundle/],
      ['xattr', [pax({ 'LIBARCHIVE.xattr.com.apple.provenance': 'AQ' }), ...good], /metadata LIBARCHIVE\.xattr/],
      ['symlink', [...good, entry('bundle/link', Buffer.alloc(0), '2', 'a.txt')], /type 2 bundle\/link/],
      ['missing', good.slice(0, 2), /missing bundle\/manifest\.sha256/],
      ['duplicate', [...good, entry('bundle/a.txt', Buffer.from('b'))], /duplicate bundle\/a\.txt/],
      ['pax-path', [...good.slice(0, 2), pax({ path: 'bundle/elsewhere.txt' }), entry('bundle/manifest.sha256', Buffer.from('m'))], /extra bundle\/elsewhere\.txt/],
    ];
    for (const [name, parts, message] of cases) {
      await expect(assertArchiveMatchesBundle(write(`${name}.tar.gz`, parts), 'bundle', ['a.txt', 'manifest.sha256']), name).rejects.toThrow(message);
    }
    writeFileSync(join(root, 'cut.tar.gz'), gzipSync(Buffer.concat(good)));
    await expect(readArchiveEntries(join(root, 'cut.tar.gz'))).rejects.toThrow(/end marker/);
  });

  it('rejects traversal and absolute bundle paths', () => {
    expect(() => normalizeBundlePath('../escape')).toThrow(/Unsafe/);
    expect(() => normalizeBundlePath('/absolute')).toThrow(/Unsafe/);
    expect(() => normalizeBundlePath('a//b')).toThrow(/Unsafe/);
  });
});
