// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Validation, Spec } from '@cyclonedx/cyclonedx-library';
import { lockedEntries, collectInventory, enrichSbom, sha256, validateSupplementalEvidence } from './inventory.mjs';
import { evaluateAudit, evaluateLicenses, validateExceptions, validateLicenseDecisions, validatePolicy } from './policy.mjs';
import { readFileSync } from 'node:fs';

const exec = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Scopes are independent npm trees with their own lockfile and registries (ADR-0023):
// `web` is the browser application at the repository root, `gateway` the server-side gateway.
const SCOPES = {
  web: { dir: '.', security: 'security', out: 'test-results/security', label: 'public-npm-development-tree' },
  gateway: { dir: 'gateway', security: 'security/gateway', out: 'test-results/security/gateway', label: 'gateway-npm-tree' },
};
const scopeArg = process.argv.includes('--scope') ? process.argv[process.argv.indexOf('--scope') + 1] : 'web';
const scope = SCOPES[scopeArg];
if (!scope) { console.error(`Unknown scope: ${scopeArg}`); process.exit(2); }
const root = join(repo, scope.dir);
const out = join(repo, scope.out);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const readJson = async path => JSON.parse(await readFile(join(repo, path), 'utf8'));
const save = async (name, value) => writeFile(join(out, name), JSON.stringify(value, null, 2) + '\n');
const lockPath = join(scope.dir, 'package-lock.json');
const sec = name => join(scope.security, name);
const errors = [];
await mkdir(out, { recursive: true });
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: scope.label, vulnerability: { status: 'incomplete' }, licenses: { status: 'incomplete' }, completeness: { status: 'incomplete' }, errors };
try {
  const [policy, lock, exceptionsDoc, triageDoc, decisionsDoc, evidenceDoc] = await Promise.all(['security/policy.json', lockPath, sec('exceptions.json'), sec('triage.json'), sec('license-decisions.json'), sec('license-evidence.json')].map(readJson));
  validatePolicy(policy);
  const licenseDecisions = validateLicenseDecisions(decisionsDoc);
  // Stored texts are read through a fixed directory; names are validated before the join.
  const supplemental = validateSupplementalEvidence(evidenceDoc, name => readFileSync(join(repo, 'security/license-texts', name)));
  if (triageDoc.schemaVersion !== 1 || !Array.isArray(triageDoc.findings)) throw new Error('Unsupported triage document');
  const entries = lockedEntries(lock, policy.registry); // before any network call
  const exceptions = validateExceptions(exceptionsDoc);
  const opts = { cwd: root, timeout: 120000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, NODE_ENV: 'development', npm_config_registry: policy.registry, npm_config_audit: 'false', npm_config_ignore_scripts: 'true', npm_config_omit: '' } };
  const version = (await exec(npm, ['--version'], opts)).stdout.trim();
  if (Number(process.versions.node.split('.')[0]) !== policy.nodeMajor || version !== policy.npmVersion) throw new Error(`Scanner requires Node ${policy.nodeMajor} / npm ${policy.npmVersion}`);
  if ((await readJson('node_modules/@cyclonedx/cyclonedx-npm/package.json')).version !== policy.cycloneDxVersion) throw new Error('Unexpected CycloneDX tool version');
  result.input = { scope: scopeArg, lockSha256: sha256(await readFile(join(repo, lockPath))), policySha256: sha256(await readFile(join(repo, 'security/policy.json'))), commit: (await exec('git', ['rev-parse', 'HEAD'], opts)).stdout.trim(), dirty: Boolean((await exec('git', ['status', '--porcelain'], opts)).stdout.trim()), packages: entries.length };
  const inputFiles = [lockPath, 'security/policy.json', sec('exceptions.json'), sec('triage.json'), sec('license-decisions.json'), sec('license-evidence.json')];
  result.input.files = Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, sha256(await readFile(join(repo, file)))])));
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
      const inventory = await collectInventory(root, entries, join(out, 'cache'), policy, supplemental);
      await save('inventory.json', { schemaVersion: 1, input: result.input, components: inventory });
      result.licenses = evaluateLicenses(inventory, policy, licenseDecisions);
      // Evidence registered for a package the tree no longer contains is stale and blocks.
      result.licenses.unusedSupplementalEvidence = [...supplemental.packages.keys()].filter(key => !supplemental.used.has(key));
      if (result.licenses.unusedSupplementalEvidence.length) result.licenses.status = 'failed';
      await save('licenses.json', result.licenses);
      const cdx = join(repo, 'node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js');
      await exec(process.execPath, [cdx, '--package-lock-only', '--spec-version', '1.5', '--output-format', 'JSON', '--output-reproducible', '--output-file', join(out, 'dependencies.cdx.json')], opts);
      const bom = enrichSbom(await readJson(join(scope.out, 'dependencies.cdx.json')), inventory);
      const invalid = await new Validation.JsonStrictValidator(Spec.Version.v1dot5).validate(JSON.stringify(bom));
      if (invalid) throw new Error(`CycloneDX schema validation failed: ${JSON.stringify(invalid).slice(0,1200)}`);
      await save('dependencies.cdx.json', bom);
      const incomplete = inventory.filter(e => e.errors.length);
      result.completeness = { status: incomplete.length ? 'incomplete' : 'passed', expected: entries.length, collected: inventory.length - incomplete.length, failures: incomplete.map(e => ({ path: e.path, errors: e.errors })) };
      await writeFile(join(out, 'THIRD-PARTY-NOTICES.txt'), inventory.map(e => `${e.name}@${e.version}\n${e.path}\nDeclared: ${e.license ?? 'UNKNOWN'}\n${e.evidence.map(p => `--- ${p.path} [sha256:${p.sha256}] ---\n${p.text}`).join('\n')}`).join('\n\n'));
    })(),
  ]);
  lanes.forEach((r, i) => { if (r.status === 'rejected') errors.push({ lane: i === 0 ? 'vulnerability' : 'inventory', message: r.reason.message }); });
  for (const file of inputFiles) if (sha256(await readFile(join(repo, file))) !== result.input.files[file]) errors.push({ lane: 'input', message: `Input changed during scan: ${file}` });
} catch (error) { errors.push({ lane: 'setup', message: error.message }); }
result.exitCode = errors.length || [result.vulnerability, result.licenses, result.completeness].some(r => r.status === 'incomplete') ? 2 : [result.vulnerability, result.licenses, result.completeness].some(r => r.status !== 'passed') ? 1 : 0;
await save('summary.json', result);
await writeFile(join(out, 'SUMMARY.md'), `# Supply chain evidence\n\nScope: ${result.scope}\nDate: ${result.generatedAt}\n\n- Vulnerabilities: ${result.vulnerability.status}\n- Licenses: ${result.licenses.status}\n- Completeness: ${result.completeness.status}\n- Exit: ${result.exitCode}\n\nThis report does not certify release artifacts or third-party penetration testing. See summary.json for findings and errors.\n`);
console.log(`Supply chain [${scopeArg}]: vulnerabilities=${result.vulnerability.status}, licenses=${result.licenses.status}, completeness=${result.completeness.status}; exit=${result.exitCode}. Evidence: ${scope.out}/`);
for (const error of errors) console.error(`${error.lane}: ${error.message}`);
process.exitCode = result.exitCode;
