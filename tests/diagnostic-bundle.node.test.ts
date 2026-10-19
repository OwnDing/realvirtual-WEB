// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { projectLog, safeStack, browserText } from '../src/core/diagnostics/sanitize';
import { createDiagnosticDownload, finalizeReport, reportFiles } from '../src/core/diagnostics/export';
import { DIAGNOSTIC_LIMITS, section, type DiagnosticReport } from '../src/core/diagnostics/types';
import type { LogEntry } from '../src/core/engine/rv-debug';

const secret = 'fixture-sensitive-value';
function report(): DiagnosticReport {
  return { manifest: { kind: 'xyvirtual-diagnostic-bundle', schemaVersion: 1, redactionVersion: 1, id: 'fixture-id', generatedAt: '2026-10-13T00:00:00.000Z', options: { logs: true, scene: true }, logRange: { from: null, to: null, count: 0 }, omissions: { freeText: 0, eventOverflow: 0, logOverflow: 0, byteLimit: 0 }, notices: [], files: [] }, environment: section('ok', 'ENVIRONMENT_COLLECTED'), graphics: section('unavailable', 'VIEWER_UNAVAILABLE'), scene: section('ok', 'SCENE_COLLECTED', { nodes: 0 }), logs: [] };
}
describe('diagnostic privacy and export contract', () => {
  it('never serializes free text, customer data, getters, cycles or toJSON', () => {
    const getter = vi.fn(() => { throw new Error(secret); });
    const cycle: any = { secret, url: `http://192.0.2.10/?token=${secret}`, toJSON: getter }; cycle.self = cycle;
    Object.defineProperty(cycle, 'password', { get: getter });
    const raw = { level: 'error', category: 'loader', timestamp: 1, elapsed: 0, message: `Customer-${secret}`, data: cycle, stack: `Error: ${secret}\n at ${secret} (https://example.test/assets/main-AbCd1234.js:10:20)\n at http://192.0.2.10/source.ts:3:4` } as LogEntry;
    const safe = projectLog(raw, 'https://example.test');
    expect(JSON.stringify(safe)).not.toContain(secret);
    expect(JSON.stringify(safe)).not.toContain('192.0.2.10');
    expect(safe.stack).toEqual(['app-chunk-AbCd1234.js:10:20']);
    expect(safe.omitted).toBe(true); expect(getter).not.toHaveBeenCalled();
    Object.defineProperty(raw, 'message', { get: getter });
    expect(() => projectLog(raw, 'https://example.test')).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects source paths, credentials, foreign origins and URL parameters in stacks', () => {
    for (const url of ['https://other.test/assets/main-AbCd1234.js', 'https://user:pass@example.test/assets/main-AbCd1234.js', 'https://example.test/assets/main-AbCd1234.js?token=fixture', 'file:///customer/model.js', 'https://example.test/src/main.ts']) {
      expect(safeStack(`at fn (${url}:1:2)`, 'https://example.test')).toEqual([]);
    }
    expect(browserText('GPU http://192.0.2.1')).toBeNull();
    expect(browserText('fixture token=secret')).toBeNull();
  });
  it('writes a parseable ZIP with matching file sizes and no raw secrets', async () => {
    const value = report(); value.logs.push(projectLog({ message: secret, level: 'warn', category: 'loader', timestamp: 42, elapsed: 0, data: { token: secret } }, 'https://example.test'));
    const finalized = finalizeReport(value), files = reportFiles(finalized);
    const download = await createDiagnosticDownload(finalized, new AbortController().signal);
    expect(download.fallback).toBe(false); expect(download.filename).toMatch(/^xyvirtual-diagnostics-.*\.zip$/);
    const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(files).sort());
    for (const [name, body] of Object.entries(files)) { expect(await zip.file(name)!.async('string')).toBe(body); expect(body).not.toContain(secret); }
    for (const file of finalized.manifest.files) expect(new TextEncoder().encode(files[file.name]).byteLength).toBe(file.bytes);
    expect(finalized.manifest.logRange).toEqual({ from: 42, to: 42, count: 1 });
  });
  it('keeps the same safe sections when ZIP fails and marks JSON fallback', async () => {
    const original = finalizeReport(report());
    const result = await createDiagnosticDownload(original, new AbortController().signal, undefined, async () => { throw new Error(secret); });
    expect(result.filename).toMatch(/\.json$/); expect(result.fallback).toBe(true);
    const decoded = JSON.parse(await result.blob.text());
    expect(decoded.manifest.notices).toContain('archive-failed');
    expect(decoded.environment).toEqual(original.environment); expect(decoded.manifest.schemaVersion).toBe(1);
    expect(await result.blob.text()).not.toContain(secret); expect(original.manifest.notices).toEqual([]);
  });
  it('cancels a stalled ZIP operation without a fallback download', async () => {
    const controller = new AbortController();
    const task = createDiagnosticDownload(finalizeReport(report()), controller.signal, undefined, () => new Promise(() => {}));
    controller.abort(); await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('handles cancellation inside a ZIP writer before it returns a pending promise', async () => {
    const controller = new AbortController();
    const task = createDiagnosticDownload(finalizeReport(report()), controller.signal, undefined, () => { controller.abort(); return new Promise(() => {}); });
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('bounds output and preserves errors ahead of lower priority entries', () => {
    const value = report();
    value.logs = Array.from({ length: 700 }, (_, i) => ({ timestamp: i, category: 'system', level: i === 0 ? 'error' : 'debug', code: 'APPLICATION_LOG', message: 'a'.repeat(4096), stack: [], omitted: false, generation: null }));
    const final = finalizeReport(value);
    expect(final.manifest.omissions.byteLimit).toBeGreaterThan(0); expect(final.logs[0].level).toBe('error');
    const size = Object.values(reportFiles(final)).reduce((n, file) => n + new TextEncoder().encode(file).length, 0);
    expect(size).toBeLessThan(DIAGNOSTIC_LIMITS.bytes);
  });
});
