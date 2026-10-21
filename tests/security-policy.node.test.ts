// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { licenseDecision, evaluateLicenses, evaluateAudit, validateExceptions, validatePolicy } from '../scripts/security/policy.mjs';
import { lockedEntries, enrichSbom, archiveEvidence } from '../scripts/security/inventory.mjs';
const policy = JSON.parse(readFileSync('security/policy.json', 'utf8'));
const entry = { path: 'node_modules/example', name: 'example', version: '1.2.3', integrity: 'sha512-proof' };
const advisory = 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz';
function audit(severity = 'high') { return { auditReportVersion: 2, metadata: { dependencies: { total: 1 }, vulnerabilities: { total: 1, info: 0, low: 0, moderate: 0, high: 0, critical: 0, [severity]: 1 } }, vulnerabilities: { example: { severity, nodes: [entry.path], via: [{ url: advisory, severity }], fixAvailable: false } } }; }
const now = new Date('2026-10-20T00:00:00Z');
const waiver = { id: 'SEC-test', kind: 'vulnerability', finding: advisory, package: 'example', version: '1.2.3', path: entry.path, integrity: entry.integrity, owner: 'maintainer', approvedBy: 'reviewer', approval: 'review/123', reason: 'isolated build input', mitigation: 'fixed config', task: 'task/123', severity: 'high', knownExploited: false, createdAt: '2026-10-19T00:00:00Z', expiresAt: '2026-10-26T00:00:00Z' };

describe('supply-chain decisions fail closed', () => {
  it('evaluates SPDX choices, conjunctions, exceptions and unknowns', () => {
    expect(licenseDecision('(MPL-2.0 OR Apache-2.0)', policy).selected).toBe('Apache-2.0');
    for (const value of [null, 'SEE LICENSE IN file', 'MIT OR', 'MIT AND GPL-3.0-only', 'MIT WITH Classpath-exception-2.0']) expect(licenseDecision(value, policy).status).not.toBe('allow');
    expect(licenseDecision('MIT AND ISC', policy).status).toBe('allow');
  });
  it('requires license text even for an allowed declared license', () => {
    expect(evaluateLicenses([{ ...entry, license: 'MIT', evidence: [] }], policy).status).toBe('failed');
    expect(evaluateLicenses([{ ...entry, license: 'MIT', evidence: [{ path: 'LICENSE', text: 'evidence' }] }], policy).status).toBe('passed');
  });
  it('blocks a known high advisory and unmapped/incomplete reports', () => {
    expect(evaluateAudit(audit(), [entry], policy).status).toBe('failed');
    expect(() => evaluateAudit({}, [entry], policy)).toThrow();
    expect(() => evaluateAudit(audit(), [], policy)).toThrow(/coverage/);
    const malformed = audit(); malformed.vulnerabilities.example.nodes = ['node_modules/other'];
    expect(() => evaluateAudit(malformed, [entry], policy)).toThrow(/Unmapped/);
  });
  it('rejects damaged summaries and policy that could disable thresholds', () => {
    for (const summary of [{ total: 0 }, { total: 1, high: 0 }, { low: -1 }, { total: '1' }]) {
      const value = audit();
      Object.assign(value.metadata.vulnerabilities, summary);
      expect(() => evaluateAudit(value, [entry], policy)).toThrow();
    }
    for (const change of [{ reviewDays: {} }, { releaseMaxAgeHours: 0 }, { registry: 'https://private.example' }]) expect(() => validatePolicy({ ...policy, ...change })).toThrow();
    const empty = { ...audit(), vulnerabilities: {}, metadata: { dependencies: { total: 1 }, vulnerabilities: { total: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
    expect(evaluateAudit(empty, [entry], policy).status).toBe('passed');
  });
  it('accepts only an exact, unexpired approved exception and rejects it for release', () => {
    const exceptions = validateExceptions({ schemaVersion: 1, exceptions: [waiver] }, now);
    expect(evaluateAudit(audit(), [entry], policy, exceptions, [], now).status).toBe('passed');
    expect(evaluateAudit(audit(), [{ ...entry, version: '1.2.4' }], policy, exceptions, [], now).status).toBe('failed');
    expect(evaluateAudit(audit(), [entry], policy, exceptions, [], now, true).status).toBe('failed');
    for (const change of [{ expiresAt: '2026-10-19T01:00:00Z' }, { severity: 'critical' }, { package: '*' }, { knownExploited: true }, { kind: 'license' }]) expect(() => validateExceptions({ schemaVersion: 1, exceptions: [{ ...waiver, ...change }] }, now)).toThrow();
  });
  it('requires lower-severity findings to have a dated owner and task', () => {
    expect(evaluateAudit(audit('low'), [entry], policy, [], [], now).status).toBe('failed');
    const ticket = { ...waiver, firstSeen: '2026-10-19T00:00:00Z', dueAt: '2026-11-01T00:00:00Z' };
    expect(evaluateAudit(audit('low'), [entry], policy, [], [ticket], now).status).toBe('passed');
  });
  it('blocks private and unpinned inputs before online audit; retains alias identity', () => {
    const pkg = { name: 'example', version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity: `sha512-${Buffer.alloc(64).toString('base64')}` };
    const lock = (value: object) => ({ lockfileVersion: 3, packages: { '': {}, 'node_modules/alias': value } });
    expect(lockedEntries(lock(pkg))[0]).toMatchObject({ name: 'example', installedName: 'alias' });
    for (const change of [{ resolved: 'https://private.example/pkg' }, { integrity: '' }, { integrity: 'sha512-YQ==' }, { link: true }, { resolved: 'https://user:secret@registry.npmjs.org/pkg' }]) expect(() => lockedEntries(lock({ ...pkg, ...change }))).toThrow();
  });
  it('never accepts an SBOM that silently drops a package or a malformed archive', () => {
    expect(() => enrichSbom({ bomFormat: 'CycloneDX', specVersion: '1.5', dependencies: [{}], components: [] }, [entry])).toThrow(/omitted/);
    expect(() => archiveEvidence(Buffer.alloc(512), entry)).toThrow(/identity/);
  });
});

import { verifyArtifactInventory, verifyReleaseEvidence } from '../scripts/security/release-evidence.mjs';
describe('release evidence binds actual artifacts', () => {
  const files = [{ path: 'assets/app.js', bytes: 3, sha256: 'a'.repeat(64) }];
  it('rejects missing, added and modified files', () => {
    expect(() => verifyArtifactInventory(files, files)).not.toThrow();
    expect(() => verifyArtifactInventory(files, [])).toThrow();
    expect(() => verifyArtifactInventory(files, [...files, { ...files[0], path: 'other' }])).toThrow();
    expect(() => verifyArtifactInventory(files, [{ ...files[0], sha256: 'b'.repeat(64) }])).toThrow();
  });
  it('does not treat an npm pass as approval of copied assets or native binaries', () => {
    const report = { files, lockSha256: 'lock', commit: 'revision', target: 'appliance', reviews: [] };
    const scan = { generatedAt: now.toISOString(), exitCode: 0, input: { lockSha256: 'lock', commit: 'revision', dirty: false }, vulnerability: { status: 'passed', findings: [] }, licenses: { status: 'passed' }, completeness: { status: 'passed' } };
    expect(() => verifyReleaseEvidence(report, scan, files, policy, now)).toThrow(/reviewed/);
    expect(() => verifyReleaseEvidence(report, { ...scan, generatedAt: '2020-01-01' }, files, policy, now)).toThrow(/stale/);
  });
});
