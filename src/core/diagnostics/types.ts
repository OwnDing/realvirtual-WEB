// SPDX-License-Identifier: AGPL-3.0-only
export const DIAGNOSTIC_LIMITS = { events: 200, logs: 500, text: 4096, bytes: 5 * 1024 * 1024, nodes: 100000, timeoutMs: 3000 } as const;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type CollectionStatus = 'ok' | 'unavailable' | 'failed' | 'timeout' | 'excluded' | 'changed' | 'truncated';
export interface Section { status: CollectionStatus; code: string; data: { [key: string]: Json } | null }
export interface DiagnosticOptions { logs: boolean; scene: boolean }
export interface SafeLog {
  timestamp: number; level: string; category: string; code: string; message: string;
  stack: string[]; omitted: boolean; generation: number | null;
}
export type EventCode = 'BOOT_STARTED' | 'BOOT_FAILED' | 'MODEL_LOADED' | 'MODEL_CLEARED' | 'LOAD_FAILED' | 'CONTEXT_LOST' | 'CONNECTION_CONNECTED' | 'CONNECTION_DISCONNECTED' | 'WINDOW_ERROR' | 'UNHANDLED_REJECTION' | 'CONSOLE_WARN' | 'CONSOLE_ERROR';
export interface DiagnosticSource {
  generation(): number;
  graphics(): Section | Promise<Section>;
  scene(signal: AbortSignal): Section | Promise<Section>;
}
export interface DiagnosticReport {
  manifest: {
    kind: 'xyvirtual-diagnostic-bundle'; schemaVersion: 1; redactionVersion: 1;
    id: string; generatedAt: string; options: DiagnosticOptions;
    logRange: { from: number | null; to: number | null; count: number };
    omissions: { freeText: number; eventOverflow: number; logOverflow: number; byteLimit: number };
    notices: string[]; files: { name: string; bytes: number }[];
  };
  environment: Section; graphics: Section; scene: Section; logs: SafeLog[];
}
export function section(status: CollectionStatus, code: string, data: Section['data'] = null): Section { return { status, code, data }; }
export function abortIfNeeded(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
