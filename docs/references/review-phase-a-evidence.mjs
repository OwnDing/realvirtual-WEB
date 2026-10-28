// SPDX-License-Identifier: AGPL-3.0-only
// Reproducible evidence mapping. Candidate texts are not a legal approval or gate exception.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../scripts/security/inventory.mjs';

const base = process.argv[2];
if (!base) throw new Error('Supply a phase-A evidence directory');
const out = join(base, 'review');
await mkdir(out, { recursive: false });
const inventoryBytes = await readFile(join(base, 'npm-inventory.json'));
const inventory = JSON.parse(inventoryBytes).components;
const supplementalBytes = await readFile(join(base, 'supplements/review.json'));
const supplemental = JSON.parse(supplementalBytes).results;
const local = [];
const selections = [
  ['esrecurse', 'esrecurse.js', /^\/\*[\s\S]*?\*\//, 'full-license-section'],
  ['imurmurhash', 'README.md', /License \(MIT\)[\s\S]*$/, 'full-license-section'],
  ['is-module', 'README.md', /## License[\s\S]*$/, 'full-license-section'],
  ['isarray', 'README.md', /## License[\s\S]*$/, 'full-license-section'],
  ['schemes', 'README.md', /\nLicense\n[\s\S]*$/, 'full-license-section'],
  ['stackback', 'formatstack.js', /^(?:\/\/[^\n]*\n)+/, 'embedded-BSD-notice-not-entire-package-license'],
];
for (const [name, file, pattern, kind] of selections) {
  const manifest = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  const matches = inventory.filter(x => x.name === name && x.version === manifest.version);
  if (!matches.length || manifest.name !== name) throw new Error(`Local evidence identity mismatch: ${name}`);
  const path = `node_modules/${name}/${file}`;
  const bytes = await readFile(path); const text = pattern.exec(bytes.toString('utf8'))?.[0];
  if (!text || !/copyright/i.test(text)) throw new Error(`Expected notice not found: ${path}`);
  local.push({ name, version: manifest.version, path, fileSha256: sha256(bytes), kind, textSha256: sha256(Buffer.from(text)), text });
}
const graphBytes = await readFile('dist/security-build-graph.json');
const graph = JSON.parse(graphBytes);
const mappingUsable = graph.lockSha256 === JSON.parse(inventoryBytes).inputSha256['package-lock.json'];
const graphPackages = new Set(graph.files.flatMap(x => x.inputs).filter(x => x.kind === 'npm').map(x => x.packagePath));
const obligation = expression => {
  if (/LGPL/.test(expression)) return 'Review library/embedded source, modifications and applicable relink or replacement obligations; retain license and notice';
  if (/OFL/.test(expression)) return 'Retain font license/copyright; check redistribution, reserved names and modifications';
  if (/CC-BY/.test(expression)) return 'Record attribution, license link, changes and applicable notices';
  if (/CC0/.test(expression)) return 'Retain provenance and dedication evidence; check separate third-party rights';
  if (/Apache/.test(expression)) return 'Retain license, applicable NOTICE and attribution; identify modifications and embedded components';
  if (/BSD|MIT|ISC|0BSD|BlueOak|Zlib|Python/.test(expression)) return 'Retain applicable copyright, license and disclaimer; inspect nested notices and modifications';
  return 'Resolve exact license expression and applicable obligations before release';
};
const rows = inventory.map(x => {
  const upstream = supplemental.find(s => s.name === x.name && s.version === x.version);
  const section = local.find(s => s.name === x.name && s.version === x.version);
  const full = section?.kind === 'full-license-section';
  return { scope: x.scope, path: x.path, name: x.name, version: x.version, declared: x.license,
    selectedBranch: x.selectedLicense ?? 'review-required', policyStatus: x.technicalPolicyStatus,
    evidence: x.evidence.length ? 'package-license-file' : upstream?.candidate ? 'pinned-source-candidate' : full ? 'local-license-section' : 'unresolved',
    extraNotice: section?.kind ?? '',
    observedWebBuild: x.scope !== 'web' ? 'separate-development-tool-scope'
      : mappingUsable && graphPackages.has(x.path) ? 'present-in-existing-build-graph-not-release-certified' : 'not-established',
    obligation: obligation(x.selectedLicense ?? x.license ?? ''),
    action: x.name === 'stackback' ? 'Package declares MIT but contains V8 BSD-3-Clause notice: retain both and verify scope'
      : x.technicalPolicyStatus === 'passed' ? 'Verify notices and obligations in exact delivered artifact'
        : upstream?.candidate || full ? 'Review supplemental source mapping and bundle applicable notice; original gate remains failed'
          : 'Obtain missing source/license proof or exclude from an approved delivery scope; do not waive',
    ownerRole: 'security/engineering; legal for disputed scope', closure: 'open-release-fulfillment' };
});
const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const columns = Object.keys(rows[0]);
const csv = [columns.map(quote).join(','), ...rows.map(row => columns.map(c => quote(row[c])).join(','))].join('\n') + '\n';
const unresolved = [...new Map(rows.filter(x => x.evidence === 'unresolved').map(x => [x.name + '@' + x.version, x])).values()];
const pdfPath = 'public/pdf.worker.min.js';
const pdfBytes = await readFile(pdfPath);
const pdfPackageBytes = await readFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const vipsPath = 'node_modules/@img/sharp-libvips-linux-arm64/versions.json';
const vipsBytes = await readFile(vipsPath);
const data = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  inputSha256: { inventory: sha256(inventoryBytes), upstreamSupplements: sha256(supplementalBytes) },
  basePolicyFailures: rows.filter(x => x.policyStatus === 'failed').length,
  localFullSections: local.filter(x => x.kind === 'full-license-section').length,
  unresolvedLicenseTextPackageVersions: unresolved.map(x => ({ name: x.name, version: x.version, declared: x.declared })),
  existingGraph: { path: 'dist/security-build-graph.json', sha256: sha256(graphBytes), matchingLock: mappingUsable, currentReleaseVerified: false },
  copiedPdfWorker: { path: pdfPath, sha256: sha256(pdfBytes), matchesInstalledPdfjsBytes: pdfBytes.equals(pdfPackageBytes), installedVersion: JSON.parse(await readFile('node_modules/pdfjs-dist/package.json', 'utf8')).version },
  libvipsEmbeddedVersions: { path: vipsPath, sha256: sha256(vipsBytes), components: JSON.parse(vipsBytes), licenseScopeVerified: false },
  limitation: 'Policy decisions unchanged. Source text mapping, distribution scope, source offers and asset rights still require explicit closure.' };
const documents = { 'obligations.csv': csv, 'summary.json': JSON.stringify(data, null, 2) + '\n', 'local-notices.json': JSON.stringify({ local }, null, 2) + '\n' };
const hashes = {};
for (const [name, content] of Object.entries(documents)) { await writeFile(join(out, name), content); hashes[name] = sha256(Buffer.from(content)); }
await writeFile(join(out, 'checksums.json'), JSON.stringify(hashes, null, 2) + '\n');
console.log(JSON.stringify({ policyFailures: data.basePolicyFailures, localFullSections: data.localFullSections, unresolvedLicenseTextPackageVersions: unresolved.length, copiedPdfWorkerMatches: data.copiedPdfWorker.matchesInstalledPdfjsBytes }));
