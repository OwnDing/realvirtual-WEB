// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildOfflineAppliance } from '../scripts/build-offline-appliance.mjs';
import { installOrUpgrade, waitForReadiness } from '../appliance/runtime/manager.mjs';
import { gatewayFixture } from './helpers/gateway-fixture';
import { caddyHashAlgorithm } from '../appliance/runtime/lib/config.mjs';

/**
 * EP-APPLIANCE-001 local rehearsal (2026-11-04, Debian 12 + Docker 29): the first real
 * container-mode install of a gateway-only linux-arm64 release failed three ways that the
 * native-only lifecycle tests could not see:
 *
 *  - the control plane (image `USER node`, uid 1000) could not read its 0600 root-owned
 *    `control.container.json` (EACCES, restart loop) — with ANY installer umask;
 *  - `docker compose exec forgejo forgejo admin …` ran as root and Forgejo refuses root
 *    ("Forgejo is not supposed to be run as root"), so the bootstrap failed after 60 tries;
 *  - the project token was written root:root 0600 AFTER `data/access` was handed to uid 1000.
 *
 * And under a hardened installer umask (077 here; CIS-style 027 behaves the same for
 * "other") the release tree and gateway.json were unreadable to the gateway (uid 10001):
 * `MODULE_NOT_FOUND`. Program files and non-secret service configs now get explicit modes.
 */
const cleanups: string[] = [];
afterEach(() => { for (const path of cleanups.splice(0)) rmSync(path, { recursive: true, force: true }); });

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function arm64Elf(label: string) {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46]);
  bytes.writeUInt16LE(183, 18);
  bytes.write(label, 24, 'utf8');
  return bytes;
}

/** A gateway-only (no CONNECT, ADR-0023) linux-arm64 release with container mode. */
async function containerRelease(root: string) {
  const dependencyRoot = join(root, 'dependencies');
  const web = join(root, 'web');
  mkdirSync(join(web, 'present'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>appliance</title>');
  writeFileSync(join(web, 'present', 'index.html'), '<!doctype html><title>presentation</title>');
  writeFileSync(join(web, 'settings.json'), '{"schemaVersion":2}\n');
  const rows = [
    ['node', 'node', 'runtime/node/bin/node'],
    ['caddy', 'caddy', 'runtime/caddy/caddy'],
    ['forgejo', 'forgejo', 'runtime/forgejo/forgejo'],
    ['influxdb', 'influxd', 'runtime/influxdb/influxd'],
    ['influx-cli', 'influx', 'runtime/influx-cli/influx'],
    ['oci-images', 'images.tar', 'images/appliance-images.tar'],
  ] as const;
  const files: Array<Record<string, unknown>> = [];
  for (const [component, source, destination] of rows) {
    const bytes = component === 'oci-images' ? Buffer.from('real-nonempty-oci-images') : arm64Elf(component);
    mkdirSync(join(dependencyRoot, source, '..'), { recursive: true });
    writeFileSync(join(dependencyRoot, source), bytes);
    chmodSync(join(dependencyRoot, source), 0o755);
    files.push({ component, source, destination, bytes: bytes.length, sha256: sha(bytes) });
    const license = Buffer.from(`license-${component}`);
    mkdirSync(join(dependencyRoot, 'licenses'), { recursive: true });
    writeFileSync(join(dependencyRoot, 'licenses', `${component}.txt`), license);
    files.push({ component, source: `licenses/${component}.txt`, destination: `licenses/third-party/${component}.txt`, bytes: license.length, sha256: sha(license) });
  }
  files.sort((a, b) => String(a.source).localeCompare(String(b.source)));
  const lockPath = join(root, 'lock.json');
  writeFileSync(lockPath, JSON.stringify({
    schemaVersion: 1, target: 'linux-arm64',
    components: rows.map(([id]) => ({ id, version: '1.0.0', license: 'TEST-LICENSE', licenseFiles: [`licenses/third-party/${id}.txt`] })),
    files,
  }));
  const output = join(root, 'release');
  await buildOfflineAppliance({
    target: 'linux-arm64', modes: 'container', dependencyRoot, dependencyLock: lockPath,
    gatewayRoot: gatewayFixture(join(root, 'gateway-fixture')), webDist: web, output,
    archive: false, createdAt: '2026-11-04T00:00:00.000Z',
  });
  return output;
}

describe('operator Basic Auth names the stored hash algorithm', () => {
  it('maps argon2id and bcrypt hashes and refuses anything else', () => {
    expect(caddyHashAlgorithm('$argon2id$v=19$m=46,t=1,p=1$c2FsdA$aGFzaA')).toBe('argon2id');
    for (const prefix of ['$2a$', '$2b$', '$2y$']) expect(caddyHashAlgorithm(`${prefix}14$abcdefghijklmnopqrstuv`)).toBe('bcrypt');
    for (const bad of ['', 'plaintext', '$argon2i$v=19$x', '$1$md5crypt']) expect(() => caddyHashAlgorithm(bad)).toThrow(/neither argon2id nor bcrypt/);
  });
});

describe('appliance readiness follows the runtime topology', () => {
  // A host-loopback probe of the control port, as fetch() fails when nothing listens there.
  const refused = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const config = { controlPort: 8081 } as any;

  it('container mode is ready through the HTTPS entry without a host-loopback control port', async () => {
    let loopbackCalls = 0;
    await expect(waitForReadiness(config, {} as any, 1000, async () => { loopbackCalls++; return refused(); }, async () => ({ ok: true, code: 'HTTPS_200' }), 'container', 1)).resolves.toBeUndefined();
    expect(loopbackCalls).toBe(0);
  });

  it('container mode still fails closed when the HTTPS entry is not ready', async () => {
    await expect(waitForReadiness(config, {} as any, 30, refused, async () => ({ ok: false, code: 'HTTPS_502' }), 'container', 1)).rejects.toThrow(/HTTPS_502/);
  });

  it('native mode still requires the control plane on loopback and reports the refused connection', async () => {
    let edgeCalls = 0;
    await expect(waitForReadiness(config, {} as any, 30, refused, async () => { edgeCalls++; return { ok: true, code: 'HTTPS_200' }; }, 'native', 1)).rejects.toThrow(/ECONNREFUSED/);
    expect(edgeCalls).toBe(0);
  });
});

describe('appliance container-mode install (gateway-only release)', () => {
  it('leaves every service able to read what it needs, whatever the installer umask', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-appliance-container-'));
    cleanups.push(root);
    const release = await containerRelease(root);
    const configPath = join(root, 'appliance.json');
    writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1, hostname: 'appliance.test.internal', influxHostname: 'influx.appliance.test.internal',
      httpsPort: 443, httpPort: 80, controlPort: 8081, connectPort: 5100, forgejoPort: 3000, influxPort: 8086,
      tls: { mode: 'internal-ca', certificate: null, privateKey: null }, authentication: { operatorUser: 'operator' },
    }));
    // Caddy creates its internal CA root 0600 beside the CA keys on first start; stand in for it.
    const caRoot = join(root, 'state-root', 'pki', 'caddy-data', 'caddy', 'pki', 'authorities', 'local', 'root.crt');
    mkdirSync(join(caRoot, '..'), { recursive: true });
    writeFileSync(caRoot, '-----BEGIN CERTIFICATE-----\nfixture-public-root\n-----END CERTIFICATE-----\n', { mode: 0o600 });
    const commands: string[] = [];
    const previous = process.umask(0o077);
    let result: Awaited<ReturnType<typeof installOrUpgrade>>;
    try {
      result = await installOrUpgrade({
        bundleRoot: release, configPath, expectedTarget: 'linux-arm64', verifyPlatform: false, mode: 'container',
        containerRuntime: 'docker', installRoot: join(root, 'install-root'), configRoot: join(root, 'config-root'),
        stateRoot: join(root, 'state-root'), minimumFreeBytes: 0,
      }, {
        lookupImpl: async () => [{ address: '127.0.0.1', family: 4 }],
        canBindImpl: async () => ({ ok: true }),
        isAdministratorImpl: async () => true,
        containerRuntimeImpl: () => 'docker',
        runImpl: (command: string, args: string[] = []) => {
          commands.push(`${command} ${args.join(' ')}`);
          if (command.includes('caddy') && args[0] === 'hash-password') return '$argon2id$v=19$m=65536,t=3,p=2$fixture$fixture';
          if (command === 'docker' && args.includes('create')) return 'generated random password: fixture-forgejo-password';
          if (command === 'docker' && args.includes('generate-access-token')) return 'fixtureforgejotoken0123456789abcdef\n';
          return '';
        },
        waitImpl: async () => {},
        waitForReadinessImpl: async () => {},
      });
    } finally {
      process.umask(previous);
    }
    const { roots, state } = result!;
    const mode = (path: string) => statSync(path).mode & 0o777;

    // The control image runs as `node` (uid 1000); its config is not a secret.
    const control = join(roots.configRoot, 'control.container.json');
    expect(mode(control)).toBe(0o644);
    const controlText = readFileSync(control, 'utf8');
    for (const secret of ['operator-password', 'influx-token', 'influx-password', 'forgejo-secret', 'forgejo-internal-token']) {
      expect(controlText).not.toContain(readFileSync(join(roots.stateRoot, 'secrets', secret), 'utf8').trim());
    }
    // The gateway (uid 10001) reads its config and the read-only release mount.
    expect(mode(join(roots.configRoot, 'gateway.json'))).toBe(0o644);
    expect(mode(state.releaseRoot)).toBe(0o755);
    expect(mode(join(state.releaseRoot, 'runtime'))).toBe(0o755);
    expect(mode(join(state.releaseRoot, 'runtime', 'gateway', 'src', 'main.mjs'))).toBe(0o644);
    expect(mode(join(state.releaseRoot, 'runtime', 'node', 'bin', 'node'))).toBe(0o755);
    expect(mode(roots.installRoot)).toBe(0o755);
    expect(mode(join(roots.installRoot, 'releases'))).toBe(0o755);
    // Secrets stay private.
    expect(mode(join(roots.stateRoot, 'secrets'))).toBe(0o700);
    expect(mode(join(roots.stateRoot, 'secrets', 'operator-password'))).toBe(0o600);
    expect(mode(join(roots.configRoot, 'compose.env'))).toBe(0o600);

    // Forgejo's CLI refuses root: every exec runs as the image's `git` user.
    const forgejoExecs = commands.filter((line) => / exec .* forgejo forgejo /.test(line));
    expect(forgejoExecs.length).toBeGreaterThanOrEqual(2);
    for (const line of forgejoExecs) expect(line).toMatch(/ exec -T --user git forgejo forgejo /);

    // Caddy's basic_auth defaults to bcrypt: the directive must name the stored hash's algorithm,
    // or the correct operator password is refused on /appliance/, /diagnostics/ and /git/.
    const caddyfile = readFileSync(join(roots.configRoot, 'Caddyfile'), 'utf8');
    expect(caddyfile).toMatch(/basic_auth @it argon2id \{\n\t+operator \$argon2id\$/);
    expect(caddyfile).toMatch(/\tbasic_auth argon2id \{\n\t+operator \$argon2id\$/);
    expect(caddyfile).not.toMatch(/basic_auth (@it )?\{/);

    // The control plane (uid 1000) reads only a PUBLIC copy of the certificate, from a directory
    // mounted on its own; the PKI tree with the CA keys is not mounted into it at all.
    const evidence = join(roots.stateRoot, 'public', 'certificate-evidence.crt');
    expect(readFileSync(evidence, 'utf8')).toBe(readFileSync(caRoot, 'utf8'));
    expect(mode(evidence)).toBe(0o644);
    expect(mode(join(roots.stateRoot, 'public'))).toBe(0o755);
    expect(JSON.parse(controlText).certificate.path).toBe('/state-public/certificate-evidence.crt');
    const compose = readFileSync(join(state.releaseRoot, 'container', 'compose.yaml'), 'utf8');
    expect(compose).toContain('"${RV_STATE_ROOT}/public:/state-public:ro"');
    // Only the edge (root, serves TLS) mounts the PKI tree; the control service no longer does.
    const controlService = compose.slice(compose.indexOf('\n  control:'), compose.indexOf('\n  gateway:'));
    expect(controlService).toContain('/state-public:ro');
    expect(controlService).not.toContain('/pki');

    // The project token is handed to the control image user after it is written.
    const token = join(roots.stateRoot, 'data', 'access', 'forgejo-token');
    expect(readFileSync(token, 'utf8')).toBe('fixtureforgejotoken0123456789abcdef');
    expect(mode(token)).toBe(0o600);
    const tokenIssued = commands.findIndex((line) => line.includes('generate-access-token'));
    const tokenHandedOver = commands.findIndex((line) => line === `chown 1000:1000 ${token}`);
    expect(tokenIssued).toBeGreaterThanOrEqual(0);
    expect(tokenHandedOver).toBeGreaterThan(tokenIssued);
  });
});
