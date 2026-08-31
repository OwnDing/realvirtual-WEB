// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const APPLIANCE_PRODUCT = 'xyvirtual-web-appliance';
export const APPLIANCE_MANIFEST = 'appliance-manifest.json';
export const APPLIANCE_MANIFEST_DIGEST = 'manifest.sha256';
export const SUPPORTED_TARGETS = new Set(['linux-x64', 'linux-arm64', 'windows-x64']);
const MANIFEST_EXCLUDES = new Set([APPLIANCE_MANIFEST, APPLIANCE_MANIFEST_DIGEST]);

export function normalizeBundlePath(value) {
  const path = String(value ?? '').replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.includes('\0')) throw new Error(`Unsafe bundle path: ${value}`);
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe bundle path: ${value}`);
  return parts.join('/');
}

export function targetForPlatform(platform = process.platform, arch = process.arch) {
  const normalizedArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : null;
  if (platform === 'linux' && normalizedArch) return `linux-${normalizedArch}`;
  if (platform === 'win32' && normalizedArch === 'x64') return 'windows-x64';
  return null;
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

export async function listBundleFiles(root, current = root, excludes = MANIFEST_EXCLUDES) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = resolve(current, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in an appliance bundle: ${absolute}`);
    if (stat.isDirectory()) {
      files.push(...await listBundleFiles(root, absolute, excludes));
      continue;
    }
    if (!stat.isFile()) throw new Error(`Unsupported appliance bundle entry: ${absolute}`);
    const rel = normalizeBundlePath(relative(root, absolute).split(sep).join('/'));
    if (!excludes.has(rel)) files.push({ path: rel, absolute, bytes: stat.size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Appliance manifest must be an object.');
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported appliance manifest schemaVersion: ${manifest.schemaVersion}`);
  if (manifest.product !== APPLIANCE_PRODUCT) throw new Error(`Unexpected appliance product: ${manifest.product}`);
  if (!SUPPORTED_TARGETS.has(manifest.target)) throw new Error(`Unsupported appliance target: ${manifest.target}`);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`Invalid appliance version: ${manifest.version}`);
  }
  if (!Array.isArray(manifest.modes) || manifest.modes.length === 0 || manifest.modes.some((mode) => !['container', 'native'].includes(mode))) {
    throw new Error('Appliance manifest modes must contain native and/or container.');
  }
  if (!Array.isArray(manifest.services) || !['edge', 'control', 'web', 'connect', 'forgejo', 'influxdb'].every((id) => manifest.services.includes(id))) {
    throw new Error('Appliance manifest does not contain the complete service set.');
  }
  if (!Array.isArray(manifest.components)) throw new Error('Appliance manifest components must be an array.');
  const componentIds = new Set();
  for (const component of manifest.components) {
    if (!component || typeof component.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(component.id) || componentIds.has(component.id)) {
      throw new Error('Appliance manifest components must have unique stable IDs.');
    }
    if (typeof component.version !== 'string' || !component.version || typeof component.license !== 'string' || !component.license) {
      throw new Error(`Appliance component ${component.id} must declare version and license.`);
    }
    if (!Array.isArray(component.licenseFiles) || component.licenseFiles.length === 0 || component.licenseFiles.some((path) => !normalizeBundlePath(path).startsWith('licenses/third-party/'))) {
      throw new Error(`Appliance component ${component.id} must declare third-party license files.`);
    }
    componentIds.add(component.id);
  }
  for (const id of ['node', 'caddy', 'connect', 'forgejo', 'influxdb', 'influx-cli']) {
    if (!componentIds.has(id)) throw new Error(`Appliance manifest is missing component: ${id}`);
  }
  if (!Array.isArray(manifest.files)) throw new Error('Appliance manifest files must be an array.');
  let previous = '';
  const seen = new Set();
  for (const file of manifest.files) {
    const path = normalizeBundlePath(file?.path);
    if (previous && path.localeCompare(previous) <= 0) throw new Error('Appliance manifest files must be uniquely sorted by path.');
    previous = path;
    if (seen.has(path)) throw new Error(`Duplicate appliance manifest path: ${path}`);
    seen.add(path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error(`Invalid byte size for ${path}`);
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error(`Invalid SHA-256 for ${path}`);
  }
  return manifest;
}

export async function createFileInventory(root) {
  const files = await listBundleFiles(root);
  const inventory = [];
  for (const file of files) inventory.push({ path: file.path, bytes: file.bytes, sha256: await sha256File(file.absolute) });
  return inventory;
}

export async function verifyBundle(root, { expectedTarget, verifyPlatform = false } = {}) {
  const manifestPath = resolve(root, APPLIANCE_MANIFEST);
  const manifestBytes = await readFile(manifestPath);
  const manifest = validateManifestShape(JSON.parse(manifestBytes.toString('utf8')));
  if (expectedTarget && manifest.target !== expectedTarget) throw new Error(`Bundle target ${manifest.target} does not match ${expectedTarget}.`);
  if (verifyPlatform) {
    const actual = targetForPlatform();
    if (!actual || actual !== manifest.target) throw new Error(`Bundle target ${manifest.target} cannot be installed on ${process.platform}/${process.arch}.`);
  }
  const expectedDigest = (await readFile(resolve(root, APPLIANCE_MANIFEST_DIGEST), 'utf8')).trim().toLowerCase();
  const actualDigest = createHash('sha256').update(manifestBytes).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedDigest) || expectedDigest !== actualDigest) throw new Error('Appliance manifest digest mismatch.');

  const actualFiles = await listBundleFiles(root);
  const expected = new Map(manifest.files.map((file) => [file.path, file]));
  if (actualFiles.length !== expected.size) throw new Error(`Appliance bundle file count mismatch: expected ${expected.size}, found ${actualFiles.length}.`);
  for (const file of actualFiles) {
    const declaration = expected.get(file.path);
    if (!declaration) throw new Error(`Unexpected appliance bundle file: ${file.path}`);
    if (file.bytes !== declaration.bytes) throw new Error(`Appliance bundle size mismatch: ${file.path}`);
    const digest = await sha256File(file.absolute);
    if (digest !== declaration.sha256) throw new Error(`Appliance bundle digest mismatch: ${file.path}`);
    expected.delete(file.path);
  }
  if (expected.size) throw new Error(`Missing appliance bundle file: ${[...expected.keys()][0]}`);
  return manifest;
}
