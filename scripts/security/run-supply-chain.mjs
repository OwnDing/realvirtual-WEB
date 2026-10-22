// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Validation, Spec } from '@cyclonedx/cyclonedx-library';
import { lockedEntries, collectInventory, enrichSbom, sha256 } from './inventory.mjs';
import { evaluateAudit, evaluateLicenses, validateExceptions, validatePolicy } from './policy.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'test-results/security');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const readJson = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const save = async (name, value) => writeFile(join(out, name), JSON.stringify(value, null, 2) + '\n');
const errors = [];
await mkdir(out, { recursive: true });
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'public-npm-development-tree', vulnerability: { status: 'incomplete' }, licenses: { status: 'incomplete' }, completeness: { status: 'incomplete' }, errors };
try {
  const [policy, lock, exceptionsDoc, triageDoc] = await Promise.all(['security/policy.json', 'package-lock.json', 'security/exceptions.json', 'security/triage.json'].map(readJson));
  validatePolicy(policy);
  if (triageDoc.schemaVersion !== 1 || !Array.isArray(triageDoc.findings)) throw new Error('Unsupported triage document');
  const entries = lockedEntries(lock, policy.registry); // before any network call
  const exceptions = validateExceptions(exceptionsDoc);
  const opts = { cwd: root, timeout: 120000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, NODE_ENV: 'development', npm_config_registry: policy.registry, npm_config_audit: 'false', npm_config_ignore_scripts: 'true', npm_config_omit: '' } };
  const version = (await exec(npm, ['--version'], opts)).stdout.trim();
  if (Number(process.versions.node.split('.')[0]) !== policy.nodeMajor || version !== policy.npmVersion) throw new Error(`Scanner requires Node ${policy.nodeMajor} / npm ${policy.npmVersion}`);
  if ((await readJson('node_modules/@cyclonedx/cyclonedx-npm/package.json')).version !== policy.cycloneDxVersion) throw new Error('Unexpected CycloneDX tool version');
  result.input = { lockSha256: sha256(await readFile(join(root, 'package-lock.json'))), policySha256: sha256(await readFile(join(root, 'security/policy.json'))), commit: (await exec('git', ['rev-parse', 'HEAD'], opts)).stdout.trim(), dirty: Boolean((await exec('git', ['status', '--porcelain'], opts)).stdout.trim()), packages: entries.length };
  const inputFiles = ['package-lock.json', 'security/policy.json', 'security/exceptions.json', 'security/triage.json'];
  result.input.files = Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, sha256(await readFile(join(root, file)))])));
  result.tools = { node: process.version, npm: version, cyclonedx: policy.cycloneDxVersion, advisoryDatabaseVersion: null, registry: policy.registry };
  // Independent lanes both finish and leave evidence even when the other fails.
  const lanes = await Promise.allSettled([
    (async () => {
      let response;
      try { response = await exec(npm, ['audit', '--json', '--package-lock-only', '--include=dev', '--include=optional', '--include=peer', `--registry=${policy.registry}`, '--fetch-retries=0', '--fetch-timeout=30000'], opts); }
      catch (error) { if (error.code !== 1 || error.killed || !error.stdout) throw new Error('npm audit failed before returning a complete report'); response = error; }
      let audit; try { audit = JSON.parse(response.stdout); } catch { throw new Error('npm audit returned invalid JSON'); }
      await save('npm-audit.json', audit);
      result.vulnerability = evaluateAudit(audit, entries, policy, exceptions, triageDoc.findings);
      await save('vulnerabilities.json', result.vulnerability);
    })(),
    (async () => {
      const inventory = await collectInventory(root, entries, join(out, 'cache'), policy);
      await save('inventory.json', { schemaVersion: 1, input: result.input, components: inventory });
      result.licenses = evaluateLicenses(inventory, policy);
      await save('licenses.json', result.licenses);
      const cdx = join(root, 'node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js');
      await exec(process.execPath, [cdx, '--package-lock-only', '--spec-version', '1.5', '--output-format', 'JSON', '--output-reproducible', '--output-file', join(out, 'dependencies.cdx.json')], opts);
      const bom = enrichSbom(await readJson('test-results/security/dependencies.cdx.json'), inventory);
      const invalid = await new Validation.JsonStrictValidator(Spec.Version.v1dot5).validate(JSON.stringify(bom));
      if (invalid) throw new Error(`CycloneDX schema validation failed: ${JSON.stringify(invalid).slice(0,1200)}`);
      await save('dependencies.cdx.json', bom);
      const incomplete = inventory.filter(e => e.errors.length);
      result.completeness = { status: incomplete.length ? 'incomplete' : 'passed', expected: entries.length, collected: inventory.length - incomplete.length, failures: incomplete.map(e => ({ path: e.path, errors: e.errors })) };
      await writeFile(join(out, 'THIRD-PARTY-NOTICES.txt'), inventory.map(e => `${e.name}@${e.version}\n${e.path}\nDeclared: ${e.license ?? 'UNKNOWN'}\n${e.evidence.map(p => `--- ${p.path} [sha256:${p.sha256}] ---\n${p.text}`).join('\n')}`).join('\n\n'));
    })(),
  ]);
  lanes.forEach((r, i) => { if (r.status === 'rejected') errors.push({ lane: i === 0 ? 'vulnerability' : 'inventory', message: r.reason.message }); });
  for (const file of inputFiles) if (sha256(await readFile(join(root, file))) !== result.input.files[file]) errors.push({ lane: 'input', message: `Input changed during scan: ${file}` });
} catch (error) { errors.push({ lane: 'setup', message: error.message }); }
result.exitCode = errors.length || [result.vulnerability, result.licenses, result.completeness].some(r => r.status === 'incomplete') ? 2 : [result.vulnerability, result.licenses, result.completeness].some(r => r.status !== 'passed') ? 1 : 0;
await save('summary.json', result);
await writeFile(join(out, 'SUMMARY.md'), `# Supply chain evidence\n\nScope: ${result.scope}\nDate: ${result.generatedAt}\n\n- Vulnerabilities: ${result.vulnerability.status}\n- Licenses: ${result.licenses.status}\n- Completeness: ${result.completeness.status}\n- Exit: ${result.exitCode}\n\nThis report does not certify release artifacts or third-party penetration testing. See summary.json for findings and errors.\n`);
console.log(`Supply chain: vulnerabilities=${result.vulnerability.status}, licenses=${result.licenses.status}, completeness=${result.completeness.status}; exit=${result.exitCode}. Evidence: test-results/security/`);
for (const error of errors) console.error(`${error.lane}: ${error.message}`);
process.exitCode = result.exitCode;
