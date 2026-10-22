// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import parseSpdx from 'spdx-expression-parse';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const LICENSE_FILE = /^(?:licen[sc]e|notice|copying|copyright|ofl|unlicense)(?:[._-]|$)/i;
export function lockedEntries(lock, registry = 'https://registry.npmjs.org') {
  if (lock?.lockfileVersion !== 3 || !lock.packages?.['']) throw new Error('A complete npm v3 lockfile is required');
  const entries = Object.entries(lock.packages).filter(([path]) => path !== '').map(([path, value]) => {
    if (!/^(?:node_modules\/(?:@[^/]+\/)?[^/]+\/)*node_modules\/(?:@[^/]+\/)?[^/]+$/.test(path) || path.includes('..')) throw new Error('Non-package lock entry');
    const installedName = path.split('node_modules/').at(-1);
    const name = value.name ?? installedName;
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)) throw new Error('Invalid package identity');
    const url = new URL(value.resolved);
    if (!value.version || value.link || url.origin !== registry || url.username || url.password || url.search || url.hash
      || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value.integrity ?? '')
      || `sha512-${Buffer.from(value.integrity.slice(7), 'base64').toString('base64')}` !== value.integrity) throw new Error(`Non-public or unpinned dependency: ${name}`);
    return { path, name, installedName, version: value.version, resolved: url.href, integrity: value.integrity, dev: value.dev === true, optional: value.optional === true, hasInstallScript: value.hasInstallScript === true, lockedLicense: value.license ?? null };
  });
  if (!entries.length) throw new Error('Empty dependency inventory');
  return entries;
}

function proof(path, content) { return { path, sha256: sha256(content), text: content.toString('utf8') }; }
async function installedEvidence(root, entry) {
  const dir = resolve(root, entry.path);
  let manifest;
  try {
    if ((await lstat(dir)).isSymbolicLink()) throw new Error(`Linked dependency is not public evidence: ${entry.name}`);
    manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (manifest.name !== entry.name || manifest.version !== entry.version) throw new Error(`Installed package differs from lock: ${entry.name}`);
  const evidence = []; let visited = 0; let bytes = 0;
  async function walk(rel = '', depth = 0) {
    for (const item of await readdir(join(dir, rel), { withFileTypes: true })) {
      if (++visited > 100000) throw new Error(`License traversal budget exceeded: ${entry.name}`);
      if (item.isSymbolicLink()) continue;
      const path = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory() && depth < 3 && item.name !== 'node_modules' && !item.name.startsWith('.')) await walk(path, depth + 1);
      else if (item.isFile() && LICENSE_FILE.test(item.name)) {
        const size = (await lstat(join(dir, path))).size;
        if (size > 2 * 1024 * 1024 || bytes + size > 8 * 1024 * 1024) throw new Error(`License text budget exceeded: ${entry.name}`);
        const content = await readFile(join(dir, path)); bytes += content.length;
        if (content.length) evidence.push(proof(path, content));
      }
    }
  }
  await walk();
  return { manifest, evidence: evidence.sort((a, b) => a.path.localeCompare(b.path)), evidenceSource: 'installed-package' };
}

/** Read-only tar inspection: never extract archive paths, symlinks or execute package scripts. */
export function archiveEvidence(tar, entry) {
  let manifest; const evidence = []; let offset = 0; let nextPath = null; let totalText = 0;
  while (offset + 512 <= tar.length) {
    const h = tar.subarray(offset, offset + 512); offset += 512;
    if (h.every(x => x === 0)) break;
    const string = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const sizeText = string(124, 136).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw new Error('Invalid tar size');
    const size = parseInt(sizeText, 8);
    if (offset + size > tar.length) throw new Error('Truncated package archive');
    const data = tar.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    const type = string(156, 157);
    if (type === 'x') {
      if (size > 65536) throw new Error('Oversized PAX header');
      nextPath = /(?:^|\n)\d+ path=([^\n]+)/.exec(data.toString('utf8'))?.[1] ?? null;
      continue;
    }
    if (type === 'L') { if (size > 4096) throw new Error('Oversized archive path'); nextPath = data.toString('utf8').replace(/\0.*$/s, ''); continue; }
    const prefix = string(345, 500); const path = nextPath ?? (prefix ? `${prefix}/` : '') + string(0, 100); nextPath = null;
    if (type && type !== '0') continue;
    if (!path.startsWith('package/') || path.includes('..') || path.includes('\\')) continue;
    if (path === 'package/package.json') {
      if (size > 1024 * 1024 || manifest) throw new Error('Invalid archive manifest');
      manifest = JSON.parse(data.toString('utf8'));
    } else if (LICENSE_FILE.test(basename(path))) {
      totalText += size;
      if (size > 2 * 1024 * 1024 || totalText > 8 * 1024 * 1024) throw new Error('Archive license budget exceeded');
      if (size) evidence.push(proof(path.slice(8), data));
    }
  }
  if (manifest?.name !== entry.name || manifest?.version !== entry.version) throw new Error(`Archive identity mismatch: ${entry.name}`);
  return { manifest, evidence, evidenceSource: 'integrity-verified-archive' };
}

async function optionalEvidence(entry, cache, policy) {
  const file = join(cache, `${sha256(entry.integrity)}.tgz`);
  let archive;
  try { archive = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!archive) {
    const response = await fetch(entry.resolved, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error(`Package evidence unavailable: ${entry.name}`);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > policy.maxArchiveBytes) throw new Error(`Package evidence too large: ${entry.name}`);
      chunks.push(chunk);
    }
    archive = Buffer.concat(chunks);
  }
  if (archive.length > policy.maxArchiveBytes || `sha512-${createHash('sha512').update(archive).digest('base64')}` !== entry.integrity) throw new Error(`Package integrity mismatch: ${entry.name}`);
  const evidence = archiveEvidence(gunzipSync(archive, { maxOutputLength: policy.maxExpandedBytes }), entry);
  await writeFile(file, archive);
  return evidence;
}

export async function collectInventory(root, entries, cache, policy) {
  await mkdir(cache, { recursive: true });
  const results = new Array(entries.length); let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < entries.length) {
      const index = cursor++; const entry = entries[index];
      try {
        let details = await installedEvidence(root, entry);
        if (!details) {
          if (!entry.optional) throw new Error(`Required installed dependency missing: ${entry.name}`);
          details = await optionalEvidence(entry, cache, policy);
        }
        const license = typeof details.manifest.license === 'string' ? details.manifest.license : null;
        const errors = [];
        if (entry.lockedLicense && license && entry.lockedLicense !== license) errors.push('lock-manifest-license-conflict');
        results[index] = { ...entry, license, evidence: details.evidence, evidenceSource: details.evidenceSource, errors };
      } catch (error) { results[index] = { ...entry, license: null, evidence: [], errors: [error.message] }; }
    }
  }));
  return results;
}

export function enrichSbom(bom, inventory) {
  if (bom?.bomFormat !== 'CycloneDX' || bom.specVersion !== '1.5' || !bom.dependencies?.length) throw new Error('Incomplete CycloneDX output');
  const seen = new Set(); const byPath = new Map(inventory.map(e => [e.path, e]));
  function visit(components) {
    for (const component of components ?? []) {
      const path = component.properties?.find(p => p.name === 'cdx:npm:package:path')?.value;
      const entry = byPath.get(path);
      if (!entry || component.version !== entry.version || (component.group ? `${component.group}/` : '') + component.name !== entry.name || seen.has(path)) throw new Error('CycloneDX identity/coverage mismatch');
      seen.add(path);
      if (entry.license) {
        try { parseSpdx(entry.license); component.licenses = [{ expression: entry.license }]; }
        catch { component.licenses = [{ license: { name: entry.license } }]; }
      }
      if (entry.evidence?.length) component.evidence = { licenses: entry.evidence.map(e => ({ license: { name: e.path, text: { contentType: 'text/plain', encoding: 'base64', content: Buffer.from(e.text).toString('base64') } } })) };
      visit(component.components);
    }
  }
  visit(bom.components);
  if (seen.size !== inventory.length) throw new Error('CycloneDX omitted dependencies');
  return bom;
}
