// SPDX-License-Identifier: AGPL-3.0-only
// Supplemental upstream license candidates. Does not alter the policy or approve distribution.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../scripts/security/inventory.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Supply a phase-A evidence directory');
const output = join(directory, 'supplements');
await mkdir(output, { recursive: false });
const inputBytes = await readFile(join(directory, 'npm-inventory.json'));
const components = JSON.parse(inputBytes).components;
const candidates = [...new Map(components.filter(x => x.reasons.includes('missing-license-text')).map(x => [x.name + '@' + x.version, x])).values()];
const documents = {}; const requests = new Map();
async function get(url) {
  if (!requests.has(url)) requests.set(url, (async () => {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    let count = 0; const chunks = [];
    for await (const chunk of response.body) { count += chunk.length; if (count > 2 * 1024 * 1024) throw new Error('Response budget exceeded'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  })());
  return requests.get(url);
}
let cursor = 0; const results = new Array(candidates.length);
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < candidates.length) {
    const index = cursor++; const entry = candidates[index];
    const record = { name: entry.name, version: entry.version, paths: components.filter(x => x.name === entry.name && x.version === entry.version).map(x => `${x.scope}:${x.path}`),
      declaration: entry.license, status: 'unresolved', errors: [], attemptedLicenseUrls: [], legalApproval: 'not-issued' };
    results[index] = record;
    try {
      const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${entry.version}`;
      const raw = await get(metadataUrl);
      if (!raw) throw new Error('Version metadata unavailable');
      const metadata = JSON.parse(raw);
      if (metadata.name !== entry.name || metadata.version !== entry.version || metadata.dist?.integrity !== entry.integrity) throw new Error('Metadata identity/integrity conflict');
      record.metadata = { url: metadataUrl, sha256: sha256(raw), gitHead: metadata.gitHead ?? null, repository: metadata.repository ?? null };
      const repositoryUrl = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url;
      const repository = /github\.com[/:]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(repositoryUrl ?? '')?.[1];
      if (!repository || !/^[a-f0-9]{40}$/.test(metadata.gitHead ?? '')) throw new Error('No immutable GitHub source mapping');
      const dir = typeof metadata.repository === 'object' ? metadata.repository.directory : null;
      const names = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'COPYING', 'LICENCE'];
      const paths = [...(dir && /^[A-Za-z0-9_.\/-]+$/.test(dir) && !dir.includes('..') ? names.map(name => `${dir}/${name}`) : []), ...names];
      for (const path of paths) {
        const url = `https://raw.githubusercontent.com/${repository}/${metadata.gitHead}/${path}`;
        record.attemptedLicenseUrls.push(url);
        const text = await get(url);
        if (!text?.length) continue;
        if (!/(?:license|licence|copyright|permission|public domain)/i.test(text.toString('utf8'))) continue;
        const digest = sha256(text); documents[digest] = { url, text: text.toString('utf8') };
        record.candidate = { url, sha256: digest };
        record.status = 'pinned-source-text-found-review-required';
        break;
      }
    } catch (error) { record.errors.push(error.message); }
  }
}));
const counts = { packageVersions: results.length, found: results.filter(x => x.candidate).length, unresolved: results.filter(x => !x.candidate).length };
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), inventorySha256: sha256(inputBytes), counts,
  limitation: 'Publisher gitHead + matching archive integrity is a source mapping lead. Scope, embedded notices and fulfillment require review. No gate result or legal right is overridden.', results };
const outputs = { 'review.json': report, 'texts.json': { documents } };
const checksums = {};
for (const [name, data] of Object.entries(outputs)) { const bytes = JSON.stringify(data, null, 2) + '\n'; await writeFile(join(output, name), bytes); checksums[name] = sha256(Buffer.from(bytes)); }
await writeFile(join(output, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n');
console.log(JSON.stringify(counts));
