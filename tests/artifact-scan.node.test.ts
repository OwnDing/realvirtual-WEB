// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { evaluateTrivyReport, validateDatabaseMetadata } from '../scripts/security/scan-artifact.mjs';

const now = new Date('2026-10-21T00:00:00Z');
const metadata = { Version: 2, UpdatedAt: '2026-10-20T23:00:00Z', NextUpdate: '2026-10-21T05:00:00Z' };
const result = { Target: 'native/server', Class: 'lang-pkgs', Type: 'gobinary', Packages: [{ Name: 'stdlib', Version: '1.26.0' }] };
const report = { SchemaVersion: 2, Results: [result] };
describe('offline artifact evidence', () => {
  it('requires a supported, fresh database and a nonempty recognized inventory', () => {
    expect(() => validateDatabaseMetadata(metadata, now)).not.toThrow();
    for (const m of [{}, { ...metadata, Version: 1 }, { ...metadata, UpdatedAt: '2020-01-01' }, { ...metadata, UpdatedAt: '2030-01-01' }, { ...metadata, NextUpdate: '2026-10-20' }]) expect(() => validateDatabaseMetadata(m, now)).toThrow();
    expect(evaluateTrivyReport(report)).toMatchObject({ status: 'passed', packages: 1 });
    expect(evaluateTrivyReport({ ...report, Results: [{ ...result, Packages: [{ Name: 'unversioned' }] }] }).status).toBe('incomplete');
    for (const r of [{}, { ...report, Results: [] }, { ...report, Results: [{ ...result, Packages: [] }] }, { ...report, Metadata: { OS: { EOSL: true } } }]) expect(() => evaluateTrivyReport(r)).toThrow();
  });
  it('blocks high and unknown severity, retains unfixed findings, and requires lower-risk review', () => {
    const vulnerability = { VulnerabilityID: 'CVE-fixture', PkgName: 'stdlib', InstalledVersion: '1.26.0', Severity: 'HIGH' };
    for (const severity of ['HIGH', 'CRITICAL', 'UNKNOWN', 'LOW', 'MEDIUM']) {
      const actual = evaluateTrivyReport({ ...report, Results: [{ ...result, Vulnerabilities: [{ ...vulnerability, Severity: severity }] }] });
      expect(actual.status).toBe(['LOW', 'MEDIUM'].includes(severity) ? 'review-required' : 'failed');
      expect(actual.findings).toHaveLength(1);
    }
    expect(() => evaluateTrivyReport({ ...report, Results: [{ ...result, Vulnerabilities: [{ ...vulnerability, PkgName: 'missing' }] }] })).toThrow(/Unmapped/);
  });
});
