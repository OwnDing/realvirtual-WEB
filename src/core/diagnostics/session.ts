// SPDX-License-Identifier: AGPL-3.0-only
import { isStructuredLogEmission } from '../engine/rv-debug';
import { observeConsole } from './console-observer';
import { ownValue, safeStack } from './sanitize';
import { DIAGNOSTIC_LIMITS, type DiagnosticSource, type EventCode, type SafeLog } from './types';

export class DiagnosticSession {
  private events: SafeLog[] = [];
  private overflow = 0;
  private detach: (() => void) | null = null;
  private readonly owners = new Set<symbol>();
  private source: DiagnosticSource | null = null;
  private controller: AbortController | null = null;
  record(code: EventCode, error?: unknown, origin = typeof location === 'undefined' ? '' : location.origin): void {
    const stack = safeStack(ownValue(error, 'stack'), origin);
    const level = /FAILED|ERROR|REJECTION|LOST/.test(code) ? 'error' : code === 'CONSOLE_WARN' ? 'warn' : 'info';
    this.events.push({ code, message: code, timestamp: Date.now(), level, category: 'system', stack, omitted: error !== undefined || code.startsWith('CONSOLE_') || code === 'WINDOW_ERROR', generation: this.source?.generation() ?? null });
    if (this.events.length > DIAGNOSTIC_LIMITS.events) { this.events.shift(); this.overflow++; }
  }
  start(target: Window = window): () => void {
    const owner = Symbol(); this.owners.add(owner);
    const release = () => { if (this.owners.delete(owner) && this.owners.size === 0) this.stop(); };
    if (this.detach) return release;
    const offConsole = observeConsole((level, args) => {
      if (isStructuredLogEmission()) return;
      // Only an Error's own stack is considered, never serialize console arguments.
      const error = args.slice(0, 8).find(arg => typeof ownValue(arg, 'stack') === 'string');
      this.record(level === 'warn' ? 'CONSOLE_WARN' : 'CONSOLE_ERROR', error, target.location.origin);
    });
    const onError = (event: ErrorEvent) => this.record('WINDOW_ERROR', event.error, target.location.origin);
    const onRejection = (event: PromiseRejectionEvent) => this.record('UNHANDLED_REJECTION', event.reason, target.location.origin);
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    this.detach = () => { offConsole(); target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); this.detach = null; };
    return release;
  }
  attach(source: DiagnosticSource): () => void {
    this.source = source;
    return () => { if (this.source === source) { this.cancel(); this.source = null; } };
  }
  getSource(): DiagnosticSource | null { return this.source; }
  snapshot(): { events: SafeLog[]; overflow: number } { return { events: this.events.map(e => ({ ...e, stack: [...e.stack] })), overflow: this.overflow }; }
  begin(): AbortSignal {
    if (this.controller) throw new Error('DIAGNOSTIC_BUSY');
    this.controller = new AbortController(); return this.controller.signal;
  }
  finish(signal: AbortSignal): void { if (signal === this.controller?.signal) this.controller = null; }
  cancel(): void { this.controller?.abort(); }
  stop(): void { this.detach?.(); this.cancel(); this.events = []; this.overflow = 0; this.owners.clear(); }
}
export const diagnosticSession = new DiagnosticSession();
