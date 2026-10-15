// SPDX-License-Identifier: AGPL-3.0-only
import type { LogEntry } from '../engine/rv-debug';
import { DIAGNOSTIC_LIMITS, type SafeLog } from './types';
const levels = new Set(['trace', 'debug', 'info', 'warn', 'error']);
const categories = new Set(['loader', 'playback', 'drive', 'transport', 'sensor', 'logic', 'signal', 'erratic', 'grip', 'parity', 'config', 'multiuser', 'interface', 'render', 'perf', 'plugins', 'system']);
const fixedMessages = new Set(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'Out of memory']);
/** Never invoke arbitrary accessors, toJSON, toString or iterate unknown objects. */
export function ownValue(object: unknown, key: string): unknown {
  try { return object && typeof object === 'object' ? Object.getOwnPropertyDescriptor(object, key)?.value : undefined; }
  catch { return undefined; }
}
export function numberOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
/** Only browser-owned descriptive fields may use this; never log/customer text. */
export function browserText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > DIAGNOSTIC_LIMITS.text) return null;
  if (/https?:|wss?:|file:|blob:|data:|@|[/\\]|(?:\d{1,3}\.){3}\d{1,3}|token|password|secret|authorization|bearer/i.test(value)) return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256);
}
/** Keep only same-origin Vite build asset coordinates, never function names or source paths. */
export function safeStack(value: unknown, origin: string): string[] {
  if (typeof value !== 'string') return [];
  const output: string[] = [];
  for (const line of value.slice(0, DIAGNOSTIC_LIMITS.text).split('\n').slice(0, 12)) {
    const match = line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      if (url.origin !== origin || url.search || url.hash || url.username || url.password) continue;
      // Project scripts, source paths and arbitrary filenames are not application assets.
      const asset = url.pathname.match(/\/assets\/([a-zA-Z][a-zA-Z0-9_-]{0,80}-[a-zA-Z0-9_-]{8}\.js)$/);
      if (asset) output.push(`app-chunk-${asset[1].slice(-11)}:${match[2]}:${match[3]}`);
    } catch { /* omit malformed URL */ }
  }
  return output.slice(0, 6);
}
export function projectLog(entry: LogEntry, origin: string): SafeLog {
  const message = ownValue(entry, 'message');
  const safe = typeof message === 'string' && fixedMessages.has(message);
  const level = ownValue(entry, 'level'), category = ownValue(entry, 'category');
  const timestamp = numberOrNull(ownValue(entry, 'timestamp')) ?? 0;
  return {
    timestamp: timestamp <= 8640000000000000 ? timestamp : 0,
    level: typeof level === 'string' && levels.has(level) ? level : 'info',
    category: typeof category === 'string' && categories.has(category) ? category : 'system',
    code: 'APPLICATION_LOG', message: safe ? message : '[free text omitted]',
    stack: safeStack(ownValue(entry, 'stack'), origin),
    omitted: !safe || ownValue(entry, 'data') !== undefined, generation: null,
  };
}
