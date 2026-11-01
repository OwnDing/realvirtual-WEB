// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Append-only JSON Lines audit of every write attempt, accepted or not (IO-3).
 *
 * One line per attempt: when, which client, which signal, what was asked, and
 * the outcome — `rejected` (policy), `written` (source confirmed Good),
 * `failed` (source returned a Bad status) or `unknown` (timeout / disconnect:
 * the write MAY have reached the PLC and is never retried automatically).
 * Writes are serialized through one promise chain so lines never interleave.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const AUDIT_OUTCOMES = Object.freeze(['rejected', 'written', 'failed', 'unknown']);

export class AuditLog {
  constructor(path) {
    this.path = path;
    this._chain = mkdir(dirname(path), { recursive: true, mode: 0o750 }).then(() => undefined);
    this.failures = 0;
  }

  /**
   * @param {{ client: string, signal: string, requested: unknown, outcome: string, reason?: string, status?: string, value?: unknown, user?: string|null, role?: string|null }} entry
   */
  record(entry) {
    if (!AUDIT_OUTCOMES.includes(entry.outcome)) throw new Error(`invalid audit outcome ${entry.outcome}`);
    const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n';
    this._chain = this._chain
      .then(() => appendFile(this.path, line, { mode: 0o640 }))
      .catch(() => { this.failures++; });
    return this._chain;
  }

  /** Resolves once every queued line is on disk (or counted as failed). */
  flush() { return this._chain; }
}
