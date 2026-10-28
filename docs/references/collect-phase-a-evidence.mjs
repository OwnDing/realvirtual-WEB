// SPDX-License-Identifier: AGPL-3.0-only
// Analysis tooling only. Run from repository root; never installs or edits dependencies.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { list } from 'tar';
import { lockedEntries, collectInventory, archiveEvidence, sha256 } from '../../scripts/security/inventory.mjs';
import { evaluateLicenses, validatePolicy } from '../../scripts/security/policy.mjs';

const root = process.cwd();
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node docs/references/collect-phase-a-evidence.mjs <new-output-directory>');
const out = resolve(destination);
// Never silently overwrite evidence from an earlier run.
await mkdir(out, { recursive: false });
const cache = join(root, 'test-results/phase-a/cache');
await mkdir(cache, { recursive: true });
const policy = validatePolicy(JSON.parse(await readFile(join(root, 'security/policy.json'), 'utf8')));
const generatedAt = new Date().toISOString();
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const json = (name, data) => writeFile(join(out, name), JSON.stringify(data, null, 2) + '\n');
const csv = async (name, rows, keys) => {
  const cell = x => '"' + String(x ?? '').replaceAll('"', '""') + '"';
  await writeFile(join(out, name), [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\n') + '\n');
};
const before = {};
for (const file of ['package-lock.json', 'mcp-bridge/package-lock.json', 'security/policy.json']) before[file] = sha256(await readFile(join(root, file)));
const licenseTexts = {};
const inventories = [];
const summaries = [];

async function typedArchiveEvidence(bytes, entry) {
  // DefinitelyTyped uses roots such as "node v20.19/", not "package/".
  // Preserve original archive paths; validate name/version and never extract to disk.
  const evidence = []; let manifest; let textBytes = 0;
  await new Promise((done, fail) => {
    const parser = list({ strict: true, onReadEntry(item) {
      const path = item.path;
      if (item.type !== 'File' || path.includes('..') || path.includes('\\') || path.startsWith('/')) return;
      const isManifest = /^[^/]+\/package\.json$/.test(path);
      if (!isManifest && !/\/(?:licen[sc]e|notice|copying|copyright|ofl|unlicense)(?:[._-]|$)/i.test(path)) return;
      if (item.size > 2 * 1024 * 1024 || textBytes + item.size > 8 * 1024 * 1024) { fail(new Error('Archive text budget exceeded')); return; }
      textBytes += item.size; const chunks = [];
      item.on('data', chunk => chunks.push(chunk));
      item.on('end', () => {
        try {
          const body = Buffer.concat(chunks);
          if (isManifest) { if (manifest) throw new Error('Duplicate manifest'); manifest = JSON.parse(body.toString('utf8')); }
          else if (body.length) evidence.push({ path, sha256: sha256(body), text: body.toString('utf8') });
        } catch (error) { fail(error); }
      });
    }});
    parser.on('error', fail); parser.on('end', done); parser.end(bytes);
  });
  if (manifest?.name !== entry.name || manifest?.version !== entry.version) throw new Error('Nonstandard archive identity mismatch');
  return { manifest, evidence, evidenceSource: 'integrity-verified-archive-nonstandard-root' };
}

async function verifiedArchive(entry) {
  const filename = `${sha256(entry.integrity)}.tgz`;
  let bytes;
  for (const dir of [cache, join(root, 'test-results/security/cache')]) {
    try { bytes = await readFile(join(dir, filename)); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!bytes) {
    const response = await fetch(entry.resolved, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error(`Archive HTTP ${response.status}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > policy.maxArchiveBytes) throw new Error('Archive budget exceeded');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > policy.maxArchiveBytes || `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== entry.integrity) throw new Error('Archive integrity mismatch');
  const expanded = gunzipSync(bytes, { maxOutputLength: policy.maxExpandedBytes });
  let evidence;
  try { evidence = archiveEvidence(expanded, entry); }
  catch (error) { if (!entry.name.startsWith('@types/')) throw error; evidence = await typedArchiveEvidence(expanded, entry); }
  await writeFile(join(cache, filename), bytes);
  return evidence;
}

for (const scope of ['', 'mcp-bridge']) {
  const folder = join(root, scope);
  const lock = JSON.parse(await readFile(join(folder, 'package-lock.json'), 'utf8'));
  const entries = lockedEntries(lock, policy.registry); // Reject private/unpinned input before network access.
  console.log(`Collecting ${scope || 'web'}: ${entries.length} dependency paths`);
  const inventory = await collectInventory(folder, entries, cache, policy);
  // The bridge is deliberately not installed. Inspect verified registry archives instead;
  // do not rewrite optional flags or pretend an installed-tree gate passed.
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < inventory.length) {
      const index = cursor++;
      const old = inventory[index];
      if (!old.errors.some(error => error.startsWith('Required installed dependency missing:'))) continue;
      try {
        const details = await verifiedArchive(entries[index]);
        const license = typeof details.manifest.license === 'string' ? details.manifest.license : null;
        const errors = old.lockedLicense && license && old.lockedLicense !== license ? ['lock-manifest-license-conflict'] : [];
        inventory[index] = { ...entries[index], license, evidence: details.evidence, evidenceSource: details.evidenceSource, errors };
      } catch (error) { old.errors.push(error.message); }
    }
  }));
  const decision = evaluateLicenses(inventory, policy);
  const counts = {};
  for (let index = 0; index < inventory.length; index++) {
    const item = inventory[index]; const finding = decision.findings[index];
    const evidence = item.evidence.map(proof => {
      if (sha256(Buffer.from(proof.text)) !== proof.sha256) throw new Error('License text hash differs from bytes');
      licenseTexts[proof.sha256] = proof.text;
      return { path: proof.path, sha256: proof.sha256 };
    });
    counts[item.license ?? 'UNKNOWN'] = (counts[item.license ?? 'UNKNOWN'] ?? 0) + 1;
    inventories.push({ scope: scope || 'web', ...item, evidence, selectedLicense: finding.selected,
      technicalPolicyStatus: finding.status, reasons: finding.reasons,
      distributionStatus: 'not-assessed-from-build', legalApproval: 'not-issued' });
  }
  summaries.push({ scope: scope || 'web', paths: entries.length, packageVersions: new Set(inventory.map(x => x.name + '@' + x.version)).size,
    evidenceCollectionErrors: inventory.filter(x => x.errors.length).length,
    technicalPolicyPassed: decision.findings.filter(x => x.status === 'passed').length,
    technicalPolicyFailed: decision.findings.filter(x => x.status === 'failed').length, declaredLicenses: counts });
}

const files = [];
for (const path of tracked.filter(path => /^(?:src|public|schema|appliance|mcp-bridge|scripts)\//.test(path)
  || /^(?:LICENSE|CONTRIBUTING\.md|README\.md|package(?:-lock)?\.json|vite.*\.ts|index\.html)$/.test(path))) {
  const bytes = await readFile(join(root, path));
  files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
}
const assets = files.filter(f => /\.(?:glb|gltf|hdr|exr|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|aasx|wasm)$/i.test(f.path)
  || /^public\//.test(f.path) && !/^public\/(?:user-help|compatibility)\//.test(f.path)).map(f => ({ ...f,
    kind: /\.(?:glb|gltf|aasx)$/i.test(f.path) ? 'model-or-asset-container' : /\.(?:hdr|exr)$/i.test(f.path) ? 'environment-map'
      : /\.(?:woff2?|ttf|otf)$/i.test(f.path) ? 'font' : /\.(?:pdf)$/i.test(f.path) ? 'document'
        : /\.(?:wasm)$/i.test(f.path) || /pdf\.worker/.test(f.path) ? 'embedded-code' : 'resource-or-static-file',
    rightsStatus: 'requires-provenance-review', // No inference from filename, copyright header, or Git presence.
  }));
const runtimeLocks = [];
for (const path of tracked.filter(x => x.startsWith('appliance/dependencies/locks/') && x.endsWith('.json'))) {
  runtimeLocks.push({ path, sha256: sha256(await readFile(join(root, path))), declaration: JSON.parse(await readFile(join(root, path), 'utf8')) });
}
const embedded = [];
for (const path of ['node_modules/occt-import-js/dist/occt-import-js.wasm', 'node_modules/occt-import-js/dist/occt-import-js.js', 'public/pdf.worker.min.js']) {
  try { const bytes = await readFile(join(root, path)); embedded.push({ path, bytes: bytes.length, sha256: sha256(bytes) }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; embedded.push({ path, missing: true }); }
}
const buildGraphs = [];
for (const path of ['dist/security-build-graph.json', 'dist/demo-player/security-build-graph.json', 'dist/demo-player/demo-player.json']) {
  try {
    const bytes = await readFile(join(root, path)); const data = JSON.parse(bytes);
    buildGraphs.push({ path, sha256: sha256(bytes), mtime: (await stat(join(root, path))).mtime.toISOString(),
      lockSha256: data.lockSha256 ?? null, revision: data.revision ?? null,
      inputCount: data.files?.length ?? null, currentReleaseVerified: false });
  } catch (error) { if (error.code !== 'ENOENT') throw error; buildGraphs.push({ path, missing: true }); }
}
for (const [path, digest] of Object.entries(before)) if (sha256(await readFile(join(root, path))) !== digest) throw new Error(`Input changed: ${path}`);
await json('npm-inventory.json', { schemaVersion: 1, generatedAt, commit, inputSha256: before, components: inventories });
await json('license-texts.json', { schemaVersion: 1, textsBySha256: licenseTexts });
await json('non-npm-evidence.json', { schemaVersion: 1, runtimeLocks, embedded, buildGraphs, runtimePayloadsVerified: false });
await csv('npm-inventory.csv', inventories.map(x => ({ ...x, reasons: x.reasons.join(';'), licenseTextHashes: x.evidence.map(e => e.sha256).join(';') })),
  ['scope', 'path', 'name', 'version', 'dev', 'optional', 'license', 'selectedLicense', 'technicalPolicyStatus', 'reasons', 'evidenceSource', 'licenseTextHashes', 'resolved', 'integrity']);
await csv('npm-findings.csv', inventories.filter(x => x.technicalPolicyStatus !== 'passed').map(x => ({ ...x, reasons: x.reasons.join(';') })),
  ['scope', 'path', 'name', 'version', 'dev', 'optional', 'license', 'reasons']);
await csv('tracked-inputs.csv', files, ['path', 'bytes', 'sha256']);
await csv('asset-inventory.csv', assets, ['path', 'bytes', 'sha256', 'kind', 'rightsStatus']);
const summary = { schemaVersion: 1, generatedAt, commit, inputSha256: before, scopes: summaries,
  totalPaths: inventories.length, totalUniquePackageVersions: new Set(inventories.map(x => x.name + '@' + x.version)).size,
  licenseTextCount: Object.keys(licenseTexts).length, trackedInputs: files.length, assets: assets.length,
  limitation: 'Input enumeration and technical evidence only. No release, ownership or legal clearance; no vulnerability scan.' };
await json('summary.json', summary);
const outputs = ['npm-inventory.json', 'license-texts.json', 'non-npm-evidence.json', 'npm-inventory.csv', 'npm-findings.csv', 'tracked-inputs.csv', 'asset-inventory.csv', 'summary.json'];
const hashes = {};
for (const name of outputs) hashes[name] = sha256(await readFile(join(out, name)));
await json('checksums.json', hashes);
console.log(JSON.stringify(summary, null, 2));
