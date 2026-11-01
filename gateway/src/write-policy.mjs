// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one decision every WEB → PLC write passes through (IO-2).
 *
 * A write is accepted only when ALL of these hold:
 *   - the gateway is not in read-only mode;
 *   - the signal is configured, is a PLCInput* (the PLC reads it) and is
 *     explicitly `writable: true`;
 *   - the value has exactly the signal's type and lies within min/max.
 * Anything else is rejected with a stable reason code and still audited.
 */
import { coerceValue } from './signals.mjs';
import { INTEGER_LIMITS } from './config.mjs';

export const WRITE_REJECTIONS = Object.freeze([
  'read-only', 'unknown-signal', 'not-writable-direction', 'not-writable', 'invalid-type', 'out-of-range',
]);

/**
 * @param {import('./signals.mjs').SignalRegistry} registry
 * @returns {{ ok: true, value: boolean|number, signal: any } | { ok: false, reason: string }}
 */
export function evaluateWrite(registry, name, value, { readOnly }) {
  if (readOnly) return { ok: false, reason: 'read-only' };
  const signal = registry.get(name);
  if (!signal) return { ok: false, reason: 'unknown-signal' };
  if (signal.direction !== 'input') return { ok: false, reason: 'not-writable-direction' };
  if (signal.config.writable !== true) return { ok: false, reason: 'not-writable' };
  const coerced = coerceValue(signal.valueType, value);
  if (coerced === undefined) return { ok: false, reason: 'invalid-type' };
  const limits = signal.valueType === 'int' ? INTEGER_LIMITS[signal.config.dataType] : null;
  if (limits && (coerced < limits[0] || coerced > limits[1])) return { ok: false, reason: 'out-of-range' };
  if (typeof coerced === 'number') {
    if (signal.config.min !== undefined && coerced < signal.config.min) return { ok: false, reason: 'out-of-range' };
    if (signal.config.max !== undefined && coerced > signal.config.max) return { ok: false, reason: 'out-of-range' };
  }
  return { ok: true, value: coerced, signal };
}
