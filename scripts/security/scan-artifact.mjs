// SPDX-License-Identifier: AGPL-3.0-only
// Scan only explicit local artifacts with a provisioned, verified offline tool/DB.
import { readFile, writeFile, mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { artifactInventory, verifyArtifactInventory } from './release-evidence.mjs';
import { sha256 } from './inventory.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function validateDatabaseMetadata(metadata, now = new Date()) {
  const updated = Date.parse(metadata?.UpdatedAt);
  const next = Date.parse(metadata?.NextUpdate);
  if (metadata?.Version !== 2 || !Number.isFinite(updated) || !Number.isFinite(next)
    || updated > +now || +now - updated > 24 * 3600000 || next <= +now) {
    throw new Error('Trivy vulnerability database is missing, unsupported or stale');
  }
}

export function evaluateTrivyReport(report) {
  if (report?.SchemaVersion !== 2 || !Array.isArray(report.Results) || !report.Results.length) throw new Error('Incomplete Trivy report');
  const findings = [], licenses = [], incompletePackages = []; let packages = 0;
  for (const result of report.Results) {
    if (!result || typeof result.Target !== 'string' || !result.Target) throw new Error('Malformed Trivy target');
    if (['os-pkgs', 'lang-pkgs'].includes(result.Class)) {
      if (!Array.isArray(result.Packages) || !result.Packages.length) throw new Error('Missing recognized package inventory');
      for (const pkg of result.Packages) {
        if (typeof pkg.Name !== 'string' || !pkg.Name) throw new Error('Unidentified Trivy package');
        if (typeof pkg.Version !== 'string' || !pkg.Version) incompletePackages.push({ target: result.Target, package: pkg.Name });
        packages++;
      }
    }
    if (result.Vulnerabilities !== undefined && !Array.isArray(result.Vulnerabilities)) throw new Error('Malformed Trivy vulnerabilities');
    for (const v of result.Vulnerabilities ?? []) {
      if (!v.VulnerabilityID || !v.PkgName || !v.InstalledVersion || !['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(v.Severity)) throw new Error('Unidentified Trivy vulnerability');
      if (!result.Packages?.some(p => p.Name === v.PkgName && p.Version === v.InstalledVersion)) throw new Error('Unmapped Trivy vulnerability');
      findings.push({ target: result.Target, id: v.VulnerabilityID, package: v.PkgName, version: v.InstalledVersion, severity: v.Severity, fixedVersion: v.FixedVersion ?? null });
    }
    if (result.Licenses !== undefined && !Array.isArray(result.Licenses)) throw new Error('Malformed Trivy licenses');
    for (const license of result.Licenses ?? []) licenses.push({ target: result.Target, ...license });
  }
  if (!packages) throw new Error('No recognized package inventory; unsupported input is not a clean scan');
  if (report.Metadata?.OS?.EOSL) throw new Error('End-of-support OS requires explicit remediation');
  return { status: incompletePackages.length ? 'incomplete' : findings.some(f => ['UNKNOWN', 'HIGH', 'CRITICAL'].includes(f.severity)) ? 'failed' : findings.length ? 'review-required' : 'passed', packages, findings, licenses, incompletePackages,
    errors: incompletePackages.map(p => `Missing package version: ${p.target}: ${p.package}`) };
}

async function hashFile(path) {
  if (!(await lstat(path)).isFile()) throw new Error('Expected a regular file (symlinks are not evidence)');
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
async function filesFor(kind, input) {
  if (kind === 'image') return [{ path: basename(input), bytes: (await lstat(input)).size, sha256: await hashFile(input), mode: (await lstat(input)).mode & 0o777 }];
  if (!(await lstat(input)).isDirectory()) throw new Error('Filesystem target must be a directory');
  const files = await artifactInventory(input);
  for (const file of files) file.mode = (await lstat(join(input, file.path))).mode & 0o777;
  return files;
}
async function databaseEvidence(cache) {
  const metadataPath = join(cache, 'db/metadata.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  validateDatabaseMetadata(metadata);
  const files = { 'db/metadata.json': await hashFile(metadataPath), 'db/trivy.db': await hashFile(join(cache, 'db/trivy.db')) };
  // If provisioned, bind the Java index as well; the scanner never downloads it.
  for (const name of ['java-db/metadata.json', 'java-db/trivy-java.db']) {
    try { files[name] = await hashFile(join(cache, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { metadata, files };
}

export async function scanArtifact(kind, inputPath, toolPath, cachePath) {
  if (!['image', 'filesystem'].includes(kind) || !inputPath || !toolPath || !cachePath) throw new Error('Usage: scan-artifact.mjs image|filesystem <local-artifact> <trivy-binary> <offline-cache>');
  const input = resolve(inputPath), tool = resolve(toolPath), cache = resolve(cachePath);
  const output = join(root, 'test-results/security');
  await mkdir(output, { recursive: true });
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), kind, status: 'incomplete', scope: 'scanner-recognized-components-only', distributionReview: 'required', errors: [] };
  let stem = `artifact-${kind}-incomplete`;
  try {
    report.commit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
    report.dirty = Boolean((await exec('git', ['status', '--porcelain'], { cwd: root })).stdout.trim());
    const lockBytes = await readFile(join(root, 'security/scanners.json'));
    const lock = JSON.parse(lockBytes);
    const pin = lock.trivy?.platforms?.[`${process.platform}-${process.arch}`];
    if (lock.schemaVersion !== 1 || !pin || await hashFile(tool) !== pin.binarySha256) throw new Error('Unsupported host or Trivy binary checksum mismatch');
    const before = await filesFor(kind, input);
    report.artifactSetSha256 = sha256(JSON.stringify(before)); report.files = before;
    stem = `artifact-${kind}-${report.artifactSetSha256.slice(0, 16)}`;
    report.database = await databaseEvidence(cache);
    report.scanner = { version: lock.trivy.version, binarySha256: pin.binarySha256, archiveSha256: pin.archiveSha256, policySha256: sha256(lockBytes) };
    // Empty working directory and environment prevent project config, ignore
    // files, server URLs or TRIVY_* variables from changing the fixed scan.
    const cwd = await mkdtemp(join(tmpdir(), 'rv-artifact-scan-'));
    const options = { cwd, timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C.UTF-8' } };
    const version = (await exec(tool, ['--version'], options)).stdout.trim();
    if (version !== `Version: ${lock.trivy.version}`) throw new Error('Unexpected Trivy version');
    // rootfs includes installed packages and native Go binaries; the source
    // repository-oriented fs command does not cover these artifact inputs.
    const args = [kind === 'image' ? 'image' : 'rootfs', '--config=', '--ignorefile=', '--cache-dir', cache,
      '--cache-backend', 'memory', '--offline-scan', '--disable-telemetry', '--skip-version-check',
      '--skip-db-update', '--skip-java-db-update', '--skip-check-update', '--skip-vex-repo-update',
      '--scanners', 'vuln,license', '--license-full', '--list-all-pkgs', '--ignore-unfixed=false',
      '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL', '--format', 'json', '--exit-code', '0'];
    if (kind === 'image') args.push('--input', input); else args.push(input);
    report.arguments = args.map(arg => arg === input ? '<artifact>' : arg === cache ? '<offline-cache>' : arg);
    const { stdout, stderr } = await exec(tool, args, options);
    await writeFile(join(output, `${stem}-raw.json`), stdout);
    await writeFile(join(output, `${stem}-scanner.log`), stderr);
    const raw = JSON.parse(stdout);
    if (raw.ArtifactType !== (kind === 'image' ? 'container_image' : 'filesystem')) throw new Error('Wrong Trivy artifact type');
    Object.assign(report, evaluateTrivyReport(raw));
    report.rawSha256 = sha256(stdout);
    const after = await filesFor(kind, input);
    verifyArtifactInventory(before, after);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Artifact permissions changed during scan');
    const afterDb = await databaseEvidence(cache);
    if (JSON.stringify(afterDb) !== JSON.stringify(report.database) || await hashFile(tool) !== pin.binarySha256
      || sha256(await readFile(join(root, 'security/scanners.json'))) !== report.scanner.policySha256) throw new Error('Scanner inputs changed during scan');
  } catch (error) { report.status = 'incomplete'; report.errors.push(error.message); }
  report.exitCode = report.status === 'incomplete' ? 2 : report.status === 'passed' ? 0 : 1;
  await writeFile(join(output, `${stem}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(`Artifact scan: ${report.status}; ${stem}.json; distribution/provenance review still required`);
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = (await scanArtifact(...process.argv.slice(2))).exitCode; }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
