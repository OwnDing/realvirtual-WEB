// SPDX-License-Identifier: AGPL-3.0-only
import { abortIfNeeded, DIAGNOSTIC_LIMITS, type DiagnosticReport } from './types';
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const json = (value: unknown) => JSON.stringify(value, null, 2);
export function reportSummary(report: DiagnosticReport): string {
  const m = report.manifest;
  return [
    'XYvirtual diagnostic bundle v1', `ID: ${m.id}`, `Captured: ${m.generatedAt}`,
    'Local export only. Customer chooses whether to share. No assets, credentials or signal values.',
    `Environment: ${report.environment.status} (${report.environment.code})`,
    `Graphics: ${report.graphics.status} (${report.graphics.code})`,
    `Scene: ${report.scene.status} (${report.scene.code})`,
    `Application: ${json(report.environment.data?.version ?? null)}`,
    `Renderer: ${report.graphics.data?.rendererKind ?? 'unavailable'}`,
    `Logs: ${report.logs.length}; errors: ${report.logs.filter(log => log.level === 'error').length}`,
    `Coverage: ${m.logRange.from == null ? 'none' : new Date(m.logRange.from).toISOString()} — ${m.logRange.to == null ? 'none' : new Date(m.logRange.to).toISOString()}`,
    `Omissions: ${json(m.omissions)}`, `Notices: ${m.notices.join(', ') || 'none'}`,
    'Inspect LOAD_FAILED / loading.phase for load issues, CONTEXT_LOST / graphics for GPU issues.',
    'Missing data describes a collection limitation, not a successful health check.',
  ].join('\n');
}
function payloadFiles(report: DiagnosticReport): Record<string, string> {
  return { 'summary.txt': reportSummary(report), 'environment.json': json(report.environment), 'graphics.json': json(report.graphics), 'scene-summary.json': json(report.scene), 'logs.jsonl': report.logs.map(log => JSON.stringify(log)).join('\n') };
}
/** Finalize once before preview. Only bounded safe projections reach this boundary. */
export function finalizeReport(input: DiagnosticReport): DiagnosticReport {
  const report = structuredClone(input);
  const originalLogs = report.logs, originalOmissions = report.manifest.omissions.byteLimit;
  const originalNotices = [...report.manifest.notices];
  // Oldest non-errors go first, then oldest errors. Binary search the smallest
  // sufficient drop count: O(n log n), not one full serialization per removed log.
  const order = originalLogs.map((_, index) => index).sort((a, b) => Number(originalLogs[a].level === 'error') - Number(originalLogs[b].level === 'error') || a - b);
  const rank: number[] = []; order.forEach((index, position) => { rank[index] = position; });
  const measure = (drop: number) => {
    report.logs = originalLogs.filter((_, index) => rank[index] >= drop);
    report.manifest.omissions.byteLimit = originalOmissions + drop;
    report.manifest.notices = [...originalNotices];
    if (report.manifest.omissions.byteLimit && !report.manifest.notices.includes('BYTE_LIMIT')) report.manifest.notices.push('BYTE_LIMIT');
    report.manifest.logRange = { from: report.logs[0]?.timestamp ?? null, to: report.logs.at(-1)?.timestamp ?? null, count: report.logs.length };
    const payloads = payloadFiles(report);
    report.manifest.files = Object.entries(payloads).map(([name, value]) => ({ name, bytes: bytes(value) }));
    // Conservative combined budget covers both pretty JSON fallback and ZIP files.
    return bytes(json(report)) + Object.values(payloads).reduce((total, value) => total + bytes(value), 0) + bytes(json(report.manifest));
  };
  if (measure(0) <= DIAGNOSTIC_LIMITS.bytes) return report;
  if (measure(originalLogs.length) > DIAGNOSTIC_LIMITS.bytes) throw new Error('DIAGNOSTIC_SIZE_LIMIT');
  let low = 1, high = originalLogs.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (measure(mid) <= DIAGNOSTIC_LIMITS.bytes) high = mid;
    else low = mid + 1;
  }
  measure(low);
  return report;
}
export function reportFiles(report: DiagnosticReport): Record<string, string> { return { ...payloadFiles(report), 'manifest.json': json(report.manifest) }; }
export type ZipWriter = (files: Record<string, string>, signal: AbortSignal, progress: (percent: number) => void) => Promise<Blob>;
const writeZip: ZipWriter = async (files, signal, progress) => {
  const { default: JSZip } = await import('jszip');
  abortIfNeeded(signal);
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) zip.file(name, value);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }, state => { abortIfNeeded(signal); progress(state.percent); });
};
export async function createDiagnosticDownload(report: DiagnosticReport, signal: AbortSignal, progress: (percent: number) => void = () => {}, zipper: ZipWriter = writeZip): Promise<{ blob: Blob; filename: string; fallback: boolean }> {
  abortIfNeeded(signal);
  const base = `xyvirtual-diagnostics-${report.manifest.generatedAt.replace(/[:.]/g, '-')}-${report.manifest.id}`;
  try {
    const blob = await writeWithCancellation(zipper(reportFiles(report), signal, progress), signal);
    abortIfNeeded(signal); return { blob, filename: `${base}.zip`, fallback: false };
  } catch {
    abortIfNeeded(signal);
    const fallback = finalizeReport({ ...report, manifest: { ...report.manifest, notices: [...report.manifest.notices, 'archive-failed'] } });
    return { blob: new Blob([json(fallback)], { type: 'application/json' }), filename: `${base}.json`, fallback: true };
  }
}
async function writeWithCancellation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let listener: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    listener = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  });
  try { return await Promise.race([promise, cancelled]); } finally { signal.removeEventListener('abort', listener); }
}
/** One owner for generated download URLs; dispose on page/feature teardown. */
export class DiagnosticDownloads {
  private urls = new Map<string, ReturnType<typeof setTimeout>>();
  save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    const revoke = () => { URL.revokeObjectURL(url); this.urls.delete(url); };
    this.urls.set(url, setTimeout(revoke, 30000));
    try { anchor.href = url; anchor.download = filename; anchor.hidden = true; document.body.append(anchor); anchor.click(); }
    catch (error) { clearTimeout(this.urls.get(url)); revoke(); throw error; }
    finally { anchor.remove(); }
  }
  dispose(): void { for (const [url, timer] of this.urls) { clearTimeout(timer); URL.revokeObjectURL(url); } this.urls.clear(); }
}
export const diagnosticDownloads = new DiagnosticDownloads();
