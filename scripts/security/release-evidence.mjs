// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, readdir, lstat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './inventory.mjs';
import { validatePolicy } from './policy.mjs';

export async function artifactInventory(directory) {
  const files = [];
  async function walk(rel = '') {
    for (const entry of await readdir(join(directory, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Artifact symlink has no verified bytes: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const bytes = await readFile(join(directory, path));
        files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`Unsupported artifact entry: ${path}`);
    }
  }
  await walk();
  if (!files.length) throw new Error('Empty artifact directory');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Exact file set + digests: removed, added and changed bytes all invalidate evidence. */
export function verifyArtifactInventory(expected, actual) {
  if (!Array.isArray(expected) || expected.length !== actual.length) throw new Error('Artifact coverage changed');
  const byPath = new Map(expected.map(e => [e.path, e]));
  if (byPath.size !== expected.length) throw new Error('Duplicate artifact path');
  for (const file of actual) {
    const item = byPath.get(file.path);
    if (!item || item.sha256 !== file.sha256 || item.bytes !== file.bytes) throw new Error(`Artifact bytes changed: ${file.path}`);
  }
}

export function verifyReleaseEvidence(report, scan, actual, policy, now = new Date()) {
  validatePolicy(policy);
  verifyArtifactInventory(report.files, actual);
  const age = +now - Date.parse(scan.generatedAt);
  if (!Number.isFinite(age) || age < 0 || age > policy.releaseMaxAgeHours * 3600000) throw new Error('Supply-chain scan is missing or stale');
  if (!['web', 'demo-player', 'appliance'].includes(report.target) || report.dirty
    || scan.exitCode !== 0 || scan.input.lockSha256 !== report.lockSha256 || scan.input.dirty || scan.input.commit !== report.commit
    || ['vulnerability', 'licenses', 'completeness'].some(key => scan[key]?.status !== 'passed')) throw new Error('Release requires a passing scan of this clean commit and lockfile');
  if (scan.vulnerability.findings.some(f => ['high', 'critical'].includes(f.severity))) throw new Error('High/Critical findings cannot be waived for release');
  if (!report.reviews?.length || report.reviews.some(r => r.status !== 'approved' || !r.owner?.trim() || !/^[a-f0-9]{64}$/.test(r.evidenceSha256 ?? ''))) throw new Error('Release provenance and license obligations have not been reviewed');
  const required = report.target === 'appliance' ? ['artifact-provenance', 'license-obligations', 'embedded-components', 'os-and-native-vulnerabilities'] : ['artifact-provenance', 'license-obligations', 'embedded-components'];
  for (const scope of required) if (!report.reviews.some(r => r.scope === scope && r.artifactSetSha256 === sha256(JSON.stringify(actual)))) throw new Error(`Missing exact artifact review: ${scope}`);
}

export async function collectReleaseEvidence(root, directory, target) {
  if (!['web', 'demo-player', 'appliance'].includes(target)) throw new Error('Unknown release target');
  const files = await artifactInventory(directory);
  const lockSha256 = sha256(await readFile(join(root, 'package-lock.json')));
  const mappings = [];
  for (const file of files.filter(f => f.path.endsWith('security-build-graph.json'))) {
    const graph = JSON.parse(await readFile(join(directory, file.path), 'utf8'));
    if (graph.schemaVersion !== 1 || graph.lockSha256 !== lockSha256 || !Array.isArray(graph.files)) throw new Error('Stale/invalid build graph');
    const prefix = file.path.slice(0, -'security-build-graph.json'.length);
    for (const mapping of graph.files) {
      if (!files.some(f => f.path === prefix + mapping.file)) throw new Error('Build graph references a missing artifact');
      mappings.push({ ...mapping, file: prefix + mapping.file });
    }
  }
  if (target !== 'appliance' && !mappings.length) throw new Error('Actual build graph required');
  // Deliberately unresolved: a filename, npm !dev flag or clean audit cannot
  // prove rights for copied assets, embedded engines, patched binaries or OCI.
  return { schemaVersion: 1, target, generatedAt: new Date().toISOString(), lockSha256,
    artifactSetSha256: sha256(JSON.stringify(files)), files, mappings,
    unmappedFiles: files.filter(f => !mappings.some(m => m.file === f.path)).map(f => f.path),
    reviews: [], status: 'review-required' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, target, input, evidenceFile] = process.argv.slice(2);
  try {
    const root = process.cwd(); const dir = resolve(input ?? 'dist');
    if (!(await lstat(dir)).isDirectory()) throw new Error('An existing artifact directory is required');
    if (mode === 'collect') {
      const report = await collectReleaseEvidence(root, dir, target);
      const { execFileSync } = await import('node:child_process');
      report.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
      await mkdir('test-results/security', { recursive: true });
      const output = `test-results/security/release-${target}.json`;
      await writeFile(output, JSON.stringify(report, null, 2) + '\n');
      console.log(`${output}: ${report.files.length} files; provenance/license review required`);
    } else if (mode === 'verify' && evidenceFile) {
      const report = JSON.parse(await readFile(evidenceFile, 'utf8'));
      if (report.target !== target || report.dirty) throw new Error('Wrong target or dirty build');
      const scan = JSON.parse(await readFile('test-results/security/summary.json', 'utf8'));
      const policy = JSON.parse(await readFile('security/policy.json', 'utf8'));
      verifyReleaseEvidence(report, scan, await artifactInventory(dir), policy);
      console.log(`Release evidence verified: ${target} (${relative(root, dir)})`);
    } else throw new Error('Usage: release-evidence.mjs collect|verify web|demo-player|appliance <artifact-directory> [reviewed-evidence.json]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
