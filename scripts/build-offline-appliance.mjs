// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLIANCE_MANIFEST,
  APPLIANCE_MANIFEST_DIGEST,
  APPLIANCE_PRODUCT,
  SUPPORTED_TARGETS,
  createFileInventory,
  normalizeBundlePath,
  sha256File,
} from '../appliance/runtime/lib/bundle.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const applianceSource = join(repoRoot, 'appliance');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const releaseCompatibility = JSON.parse(readFileSync(join(applianceSource, 'release-compatibility.json'), 'utf8'));
const REQUIRED_NATIVE_COMPONENTS = ['node', 'caddy', 'connect', 'forgejo', 'influxdb', 'influx-cli'];
const REQUIRED_DESTINATIONS = {
  'linux-x64': ['runtime/node/bin/node', 'runtime/caddy/caddy', 'runtime/connect/realvirtual-Connect', 'runtime/forgejo/forgejo', 'runtime/influxdb/influxd', 'runtime/influx-cli/influx'],
  'linux-arm64': ['runtime/node/bin/node', 'runtime/caddy/caddy', 'runtime/connect/realvirtual-Connect', 'runtime/forgejo/forgejo', 'runtime/influxdb/influxd', 'runtime/influx-cli/influx'],
  'windows-x64': ['runtime/node/node.exe', 'runtime/caddy/caddy.exe', 'runtime/connect/realvirtual-Connect.exe', 'runtime/forgejo/forgejo.exe', 'runtime/influxdb/influxd.exe', 'runtime/influx-cli/influx.exe', 'runtime/winsw/winsw.exe'],
};

function arg(args, name, fallback = null) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
}

function has(args, name) {
  return args.includes(`--${name}`);
}

function requiredArg(args, name) {
  const value = arg(args, name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function safeCreatedAt(args) {
  const explicit = arg(args, 'created-at');
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const value = explicit ?? (epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString());
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --created-at: ${value}`);
  return date.toISOString();
}

function parseModes(raw) {
  const modes = [...new Set(String(raw ?? 'container,native').split(',').map((part) => part.trim()).filter(Boolean))].sort();
  if (!modes.length || modes.some((mode) => !['container', 'native'].includes(mode))) throw new Error(`Invalid appliance modes: ${raw}`);
  return modes;
}

function validateDependencyLock(lock, target, modes) {
  if (!lock || lock.schemaVersion !== 1 || lock.target !== target) throw new Error(`Dependency lock target must be ${target} with schemaVersion 1.`);
  if (lock.testFixture === true) throw new Error('A test-fixture dependency lock cannot produce a formal appliance bundle.');
  if (!Array.isArray(lock.components) || !Array.isArray(lock.files)) throw new Error('Dependency lock must contain components and files arrays.');
  const components = new Map();
  for (const component of lock.components) {
    if (!component || typeof component.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(component.id)) throw new Error('Invalid dependency component id.');
    if (components.has(component.id)) throw new Error(`Duplicate dependency component: ${component.id}`);
    if (typeof component.version !== 'string' || !component.version || typeof component.license !== 'string' || !component.license) {
      throw new Error(`Dependency component ${component.id} must declare version and license.`);
    }
    if (!Array.isArray(component.licenseFiles) || component.licenseFiles.length === 0 || component.licenseFiles.some((path) => !String(path).startsWith('licenses/third-party/'))) {
      throw new Error(`Dependency component ${component.id} must declare licenseFiles under licenses/third-party/.`);
    }
    components.set(component.id, component);
  }
  const required = [...REQUIRED_NATIVE_COMPONENTS, ...(target.startsWith('windows-') ? ['service-wrapper'] : []), ...(modes.includes('container') ? ['oci-images'] : [])];
  for (const id of required) if (!components.has(id)) throw new Error(`Dependency lock is missing required component: ${id}`);

  let previous = '';
  const sources = new Set();
  const destinations = new Set();
  for (const file of [...lock.files].sort((a, b) => String(a.source).localeCompare(String(b.source)))) {
    const source = normalizeBundlePath(file?.source);
    const destination = normalizeBundlePath(file?.destination);
    if (previous && source.localeCompare(previous) <= 0) throw new Error('Dependency lock files must be uniquely sorted by source.');
    previous = source;
    if (!components.has(file.component)) throw new Error(`Unknown dependency component for ${source}: ${file.component}`);
    if (!destination.startsWith('runtime/') && !destination.startsWith('images/') && !destination.startsWith('licenses/third-party/')) {
      throw new Error(`Dependency destination must be under runtime/, images/, or licenses/third-party/: ${destination}`);
    }
    if (sources.has(source) || destinations.has(destination)) throw new Error(`Duplicate dependency path: ${source} -> ${destination}`);
    sources.add(source); destinations.add(destination);
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw new Error(`Dependency file must be non-empty: ${source}`);
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error(`Invalid dependency SHA-256: ${source}`);
  }
  for (const id of required) {
    if (!lock.files.some((file) => file.component === id)) throw new Error(`Dependency component has no files: ${id}`);
  }
  for (const component of components.values()) {
    for (const licenseFile of component.licenseFiles) {
      const destination = normalizeBundlePath(licenseFile);
      if (!lock.files.some((file) => file.component === component.id && file.destination === destination)) {
        throw new Error(`Dependency component ${component.id} is missing declared license file: ${destination}`);
      }
    }
  }
  const destinationsInLock = new Set(lock.files.map((file) => file.destination));
  for (const destination of REQUIRED_DESTINATIONS[target]) {
    if (!destinationsInLock.has(destination)) throw new Error(`Dependency lock is missing runtime entrypoint: ${destination}`);
  }
  if (modes.includes('container') && !destinationsInLock.has('images/appliance-images.tar')) {
    throw new Error('Dependency lock is missing OCI archive entrypoint: images/appliance-images.tar');
  }
  return { components, sources };
}

async function listDependencyFiles(root, current = root) {
  const result = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = resolve(current, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Dependency input cannot contain a symlink: ${absolute}`);
    if (stat.isDirectory()) result.push(...await listDependencyFiles(root, absolute));
    else if (stat.isFile()) result.push(normalizeBundlePath(relative(root, absolute).split(sep).join('/')));
    else throw new Error(`Unsupported dependency input: ${absolute}`);
  }
  return result.sort();
}

async function copyDependencies(dependencyRoot, lock, stage, validation) {
  const actual = await listDependencyFiles(dependencyRoot);
  const expected = [...validation.sources].sort();
  if (actual.length !== expected.length || actual.some((path, index) => path !== expected[index])) {
    const extra = actual.find((path) => !validation.sources.has(path));
    const missing = expected.find((path) => !actual.includes(path));
    throw new Error(extra ? `Unexpected dependency input: ${extra}` : `Missing dependency input: ${missing}`);
  }
  for (const declaration of lock.files) {
    const source = resolve(dependencyRoot, declaration.source);
    const sourceStat = statSync(source);
    if (sourceStat.size !== declaration.bytes) throw new Error(`Dependency size mismatch: ${declaration.source}`);
    if (await sha256File(source) !== declaration.sha256) throw new Error(`Dependency digest mismatch: ${declaration.source}`);
    if (declaration.destination.startsWith('licenses/third-party/')) {
      const notice = await readFile(source, 'utf8');
      if (notice.includes('MUST_BE_REPLACED_BY_RELEASE_ENGINEERING')) {
        throw new Error(`Dependency license notice is still a release template: ${declaration.source}`);
      }
    }
    const destination = resolve(stage, declaration.destination);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { force: false, preserveTimestamps: true });
  }
  writeFileSync(join(stage, 'config', 'dependency-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

function generateNpmSbom() {
  const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
  const packages = Object.entries(lock.packages ?? {})
    .filter(([path, value]) => path.startsWith('node_modules/') && value && !value.dev)
    .map(([path, value]) => ({ name: value.name ?? basename(path), version: value.version ?? 'unknown', license: value.license ?? 'NOASSERTION', integrity: value.integrity ?? null }))
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  return {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: APPLIANCE_PRODUCT, version: packageJson.version } },
    components: packages.map((item) => ({
      type: 'library', name: item.name, version: item.version,
      licenses: [{ license: /^[A-Za-z0-9-.+]+$/.test(item.license) ? { id: item.license } : { name: item.license } }],
      ...(item.integrity ? { properties: [{ name: 'npm:integrity', value: item.integrity }] } : {}),
    })),
  };
}

function generateRuntimeSbom(lock) {
  return {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { component: { type: 'application', name: `${APPLIANCE_PRODUCT}-runtime`, version: packageJson.version } },
    components: lock.components.map((component) => ({
      type: component.id === 'oci-images' ? 'container' : 'application',
      name: component.id,
      version: component.version,
      licenses: [{ license: /^[A-Za-z0-9-.+]+$/.test(component.license) ? { id: component.license } : { name: component.license } }],
      properties: component.licenseFiles.map((path) => ({ name: 'xyvirtual:license-file', value: path })),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function assertTargetEntrypoints(stage, target) {
  for (const destination of REQUIRED_DESTINATIONS[target]) {
    const path = join(stage, destination);
    const bytes = readFileSync(path);
    if (target.startsWith('linux-')) {
      const expectedMachine = target === 'linux-x64' ? 62 : 183;
      if (bytes.length < 20 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46 || bytes.readUInt16LE(18) !== expectedMachine) {
        throw new Error(`Runtime entrypoint is not a ${target} ELF executable: ${destination}`);
      }
      if ((statSync(path).mode & 0o111) === 0) throw new Error(`Linux runtime entrypoint is not executable: ${destination}`);
    } else {
      if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error(`Runtime entrypoint is not a Windows PE executable: ${destination}`);
      const peOffset = bytes.readUInt32LE(0x3c);
      if (peOffset + 6 > bytes.length || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' || bytes.readUInt16LE(peOffset + 4) !== 0x8664) {
        throw new Error(`Runtime entrypoint is not a windows-x64 PE executable: ${destination}`);
      }
    }
  }
}

function copyApplianceSource(stage) {
  cpSync(applianceSource, stage, {
    recursive: true,
    filter(source) {
      const rel = relative(applianceSource, source).split(sep).join('/');
      return rel !== 'dependencies' && !rel.startsWith('dependencies/');
    },
  });
}

function exposeLifecycleWrappers(stage, target) {
  const windows = target.startsWith('windows-');
  const folder = join(stage, 'native', windows ? 'windows' : 'linux');
  const extension = windows ? 'ps1' : 'sh';
  for (const command of ['install', 'upgrade', 'rollback', 'backup', 'restore', 'uninstall', 'preflight']) {
    const source = join(folder, `${command}.${extension}`);
    if (!existsSync(source)) throw new Error(`Lifecycle wrapper is missing: ${source}`);
    cpSync(source, join(stage, `${command}.${extension}`));
  }
  if (windows) cpSync(join(folder, 'Invoke-ApplianceManager.ps1'), join(stage, 'Invoke-ApplianceManager.ps1'));
}

function createArchive(bundleDir) {
  const archive = `${bundleDir}.tar.gz`;
  if (existsSync(archive)) throw new Error(`Archive already exists: ${archive}`);
  const result = spawnSync('tar', ['-czf', archive, '-C', dirname(bundleDir), basename(bundleDir)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tar failed with exit code ${result.status}`);
  return archive;
}

export async function buildOfflineAppliance(options) {
  const target = options.target;
  if (!SUPPORTED_TARGETS.has(target)) throw new Error(`Unsupported --target: ${target}`);
  const modes = parseModes(options.modes);
  const dependencyRoot = resolve(options.dependencyRoot);
  const dependencyLock = JSON.parse(await readFile(resolve(options.dependencyLock), 'utf8'));
  const validation = validateDependencyLock(dependencyLock, target, modes);
  const webDist = resolve(options.webDist);
  if (!existsSync(join(webDist, 'index.html'))) throw new Error(`WEB build does not contain index.html: ${webDist}`);
  const output = resolve(options.output);
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = mkdtempSync(join(dirname(output), '.xyvirtual-appliance-stage-'));
  try {
    copyApplianceSource(temporary);
    cpSync(webDist, join(temporary, 'web'), { recursive: true, errorOnExist: true, force: false });
    mkdirSync(join(temporary, 'licenses'), { recursive: true });
    cpSync(join(repoRoot, 'LICENSE'), join(temporary, 'licenses', 'AGPL-3.0-only.txt'));
    mkdirSync(join(temporary, 'sbom'), { recursive: true });
    writeFileSync(join(temporary, 'sbom', 'web-production.cdx.json'), `${JSON.stringify(generateNpmSbom(), null, 2)}\n`);
    writeFileSync(join(temporary, 'sbom', 'appliance-runtime.cdx.json'), `${JSON.stringify(generateRuntimeSbom(dependencyLock), null, 2)}\n`);
    await copyDependencies(dependencyRoot, dependencyLock, temporary, validation);
    assertTargetEntrypoints(temporary, target);
    exposeLifecycleWrappers(temporary, target);
    const inventory = await createFileInventory(temporary);
    const manifest = {
      schemaVersion: 1,
      product: APPLIANCE_PRODUCT,
      version: packageJson.version,
      target,
      createdAt: options.createdAt,
      modes,
      originIdentity: 'scheme-host-port',
      compatibility: releaseCompatibility,
      services: ['edge', 'control', 'web', 'connect', 'forgejo', 'influxdb'],
      components: dependencyLock.components
        .map(({ id, version, license, licenseFiles }) => ({ id, version, license, licenseFiles }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      files: inventory,
    };
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(temporary, APPLIANCE_MANIFEST), bytes);
    writeFileSync(join(temporary, APPLIANCE_MANIFEST_DIGEST), `${createHash('sha256').update(bytes).digest('hex')}\n`);
    renameSync(temporary, output);
    return { bundleDir: output, archive: options.archive ? createArchive(output) : null, manifest };
  } catch (error) {
    // The caller owns cleanup of a failed staging directory. Keeping it preserves forensic evidence
    // and avoids recursive deletion in a packaging path.
    error.stagingDirectory = temporary;
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (has(args, 'help')) {
    console.log('Usage: node scripts/build-offline-appliance.mjs --target <linux-x64|linux-arm64|windows-x64> --dependency-root <dir> --dependency-lock <json> [--web-dist dist] [--no-build] [--output dir] [--modes container,native] [--no-archive]');
    return;
  }
  const target = requiredArg(args, 'target');
  const noBuild = has(args, 'no-build');
  const webDist = resolve(arg(args, 'web-dist', join(repoRoot, 'dist')));
  if (!noBuild) execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit', env: process.env });
  const output = resolve(arg(args, 'output', join(repoRoot, 'artifacts', `xyvirtual-web-appliance-${packageJson.version}-${target}`)));
  const result = await buildOfflineAppliance({
    target,
    modes: arg(args, 'modes', 'container,native'),
    dependencyRoot: requiredArg(args, 'dependency-root'),
    dependencyLock: requiredArg(args, 'dependency-lock'),
    webDist,
    output,
    archive: !has(args, 'no-archive'),
    createdAt: safeCreatedAt(args),
  });
  console.log(JSON.stringify({ bundle: result.bundleDir, archive: result.archive, files: result.manifest.files.length }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[offline-appliance] ${error.message}`);
    if (error.stagingDirectory) console.error(`[offline-appliance] failed staging preserved at ${error.stagingDirectory}`);
    process.exitCode = 1;
  });
}
