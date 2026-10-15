// SPDX-License-Identifier: AGPL-3.0-only
/** Shared by production diagnostics and the existing DEV bridge. No retained arguments. */
export type ConsoleObserver = (level: 'warn' | 'error', args: readonly unknown[]) => void;
const listeners = new Set<ConsoleObserver>();
let release: (() => void) | null = null;
let notifying = false;
export function observeConsole(listener: ConsoleObserver): () => void {
  if (!release) {
    const original = { warn: console.warn, error: console.error };
    const wrappers = Object.fromEntries((['warn', 'error'] as const).map(level => [level, (...args: unknown[]) => {
      if (!notifying) {
        notifying = true;
        try { for (const fn of listeners) { try { fn(level, args); } catch { /* capture cannot replace original error */ } } }
        finally { notifying = false; }
      }
      original[level].apply(console, args);
    }])) as typeof original;
    console.warn = wrappers.warn; console.error = wrappers.error;
    release = () => {
      // A later third-party wrapper may hold this wrapper. Keep it as an inert
      // pass-through instead of installing a second active observer underneath it.
      if (console.warn === wrappers.warn && console.error === wrappers.error) {
        console.warn = original.warn; console.error = original.error; release = null;
      }
    };
  }
  listeners.add(listener);
  let disposed = false;
  return () => { if (disposed) return; disposed = true; listeners.delete(listener); if (!listeners.size) release?.(); };
}
