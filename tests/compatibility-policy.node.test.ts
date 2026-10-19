// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import matrix from '../src/core/compatibility/support-matrix.json';
import { browserIdentity, evaluateCompatibility, validateMatrix } from '../src/core/compatibility/evaluate.mjs';
import { generateCompatibility, legacyProjection, matrixTable } from '../scripts/generate-compatibility.mjs';
import { messages } from '../src/core/i18n/catalogs/compatibility.mjs';

const environment = { os: 'windows', osRelease: '11', arch: 'x64', browser: 'edge', version: '145.0.0.0', major: 145 };
const pass = { status: 'pass' as const, code: 'TEST_CHECK' };
const ready = { secureContext: pass, webgl2: pass, opfs: pass };
/** Synthetic certificates exercise policy only; never written to the release registry. */
function certifiedMatrix(level = 'supported'): any {
  const value: any = structuredClone(matrix);
  value.evidence = [143, 144].map(major => ({ id: `test-${major}`, runDate: '2026-10-19', productVersion: value.productVersion,
    kind: level === 'supported' ? 'hardware' : 'automated', status: 'passed', build: '1234567', report: 'docs/delivery/snapshots/test.json',
    os: 'windows', osRelease: '11', arch: 'x64', browser: 'edge', major, workflows: ['viewer'], gpu: level === 'supported' ? 'hardware' : 'software' }));
  value.targets = [{ id: 'windows-edge', os: 'windows', osRelease: '11', arch: 'x64', browser: 'edge', minMajor: 143, maxMajor: 144, level, workflows: ['viewer'], evidence: ['test-143', 'test-144'] }];
  return value;
}
describe('release compatibility policy', () => {
  it('keeps generated resources, public version and evidence synchronized', () => {
    expect(validateMatrix(matrix)).toEqual([]);
    expect(() => generateCompatibility(true)).not.toThrow();
    expect(Object.keys(messages['zh-CN']).sort()).toEqual(Object.keys(messages['en-US']).sort());
    expect(matrixTable(matrix, 'zh-CN')).toContain('待实机认证');
    expect(matrixTable(matrix, 'en-US')).toContain('no values published');
  });
  it('separates capability from unverified browser/product claims', () => {
    expect(evaluateCompatibility(matrix, environment, ready)).toMatchObject({ capability: 'satisfied', certification: 'unverified' });
    expect(evaluateCompatibility(matrix, environment, {}, 'browser-project')).toMatchObject({ capability: 'unknown', certification: 'unverified' });
    expect(evaluateCompatibility(matrix, environment, { ...ready, opfs: { status: 'fail', code: 'OPFS_QUOTA_EXCEEDED' } }, 'browser-project').capability).toBe('limited');
  });
  it.each([142, 145, 999])('never extrapolates a certified range to browser %i', major => {
    expect(evaluateCompatibility(certifiedMatrix(), { ...environment, major }, ready).certification).toBe('unverified');
  });
  it.each([143, 144])('accepts only evidenced endpoints %i and exact environments', major => {
    const value = certifiedMatrix(); expect(validateMatrix(value)).toEqual([]);
    expect(evaluateCompatibility(value, { ...environment, major }, ready).certification).toBe('supported');
    for (const patch of [{ os: 'linux' }, { arch: 'arm64' }, { osRelease: null }, { browser: 'chrome' }]) {
      expect(evaluateCompatibility(value, { ...environment, major, ...patch }, ready).certification).toBe('unverified');
    }
    expect(evaluateCompatibility(value, { ...environment, major }, ready, 'browser-project').certification).toBe('unverified');
  });
  it('rejects missing endpoint, wrong browser/scope and software evidence for a full claim', () => {
    const cases = [
      (value: any) => { value.evidence.pop(); },
      (value: any) => { value.evidence[0].browser = 'chrome'; },
      (value: any) => { value.evidence[0].workflows = ['browser-project']; },
      (value: any) => { value.evidence[0].gpu = 'software'; },
      (value: any) => { value.targets[0].maxMajor = null; },
      (value: any) => { value.targets[0].maxMajor = 999; },
    ];
    for (const mutate of cases) { const value = certifiedMatrix(); mutate(value); expect(validateMatrix(value).length).toBeGreaterThan(0); expect(evaluateCompatibility(value, environment, ready).reasons).toContain('MATRIX_INVALID'); }
    const limited = certifiedMatrix('limited'); expect(validateMatrix(limited)).toEqual([]);
    expect(evaluateCompatibility(limited, { ...environment, major: 143 }, ready).certification).toBe('limited');
  });
  it('does not upgrade optional WebGPU or XR prerequisites into device certification', () => {
    expect(evaluateCompatibility(matrix, environment, { ...ready, webgpu: pass }, 'viewer', 'webgpu')).toMatchObject({ capability: 'satisfied', certification: 'experimental' });
    expect(evaluateCompatibility(matrix, environment, { ...ready, webgpu: pass, xrVr: pass }, 'xr-vr', 'webgpu')).toMatchObject({ capability: 'limited', certification: 'unsupported' });
    expect(evaluateCompatibility(matrix, environment, { ...ready, xrVr: pass }, 'xr-vr', 'webgpu-gl').reasons).toContain('XR_REQUIRES_CLASSIC_WEBGL');
    expect(evaluateCompatibility(matrix, environment, ready, 'folder-project').capability).toBe('unknown');
    expect(evaluateCompatibility(matrix, environment, { webgl2: pass }, 'demo-package').capability).toBe('satisfied');
  });
  it('fails closed for missing, legacy and malformed policy rather than throwing', () => {
    for (const value of [null, {}, legacyProjection(matrix), { ...matrix, policy: { frozenVersions: 12 } }, { ...matrix, targets: [null] }, { ...matrix, evidence: [null] }, { ...matrix, hardwareProfiles: [null] }]) {
      expect(() => validateMatrix(value)).not.toThrow(); expect(validateMatrix(value).length).toBeGreaterThan(0);
      expect(evaluateCompatibility(value, environment).reasons).toContain('MATRIX_INVALID');
    }
    expect(Object.values(legacyProjection(matrix).browsers).every(value => value.level === 'diagnostic-only')).toBe(true);
  });
  it('does not publish invented hardware minima or untested frozen versions', () => {
    const value: any = structuredClone(matrix); value.hardwareProfiles[0].minimum = { ramGiB: 8 };
    expect(validateMatrix(value)).toContain('MATRIX_UNVERIFIED_MINIMUM');
    value.policy.frozenVersions.push({ target: 'windows-edge', major: 143 });
    expect(validateMatrix(value)).toContain('MATRIX_FROZEN_VERSION');
  });
  it('exports only reduced identity, without inferring Windows 11, architecture or arbitrary client strings', () => {
    const identity = browserIdentity('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.1.2 customer-secret');
    expect(identity).toEqual({ os: 'windows', osRelease: null, arch: null, browser: 'edge', version: '145.0.1.2', major: 145 });
    expect(JSON.stringify(identity)).not.toContain('customer-secret');
    expect(browserIdentity('Mozilla/5.0 (iPhone) CriOS/145.0 Mobile Safari/604.1').browser).toBe('unknown');
    expect(browserIdentity('Mozilla/5.0 (X11; Linux) Chrome/145.0.0.0', [{ brand: 'Google Chrome' }]).browser).toBe('chrome');
  });
});
