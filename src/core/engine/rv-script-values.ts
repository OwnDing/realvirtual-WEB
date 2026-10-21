// SPDX-License-Identifier: AGPL-3.0-only
import type { QuickJSContext, QuickJSHandle } from './rv-script-sandbox';

export const SCRIPT_VALUE_LIMITS = Object.freeze({ depth: 16, entries: 4096, stringUnits: 65536, arguments: 64, bridgeCalls: 1024 });
export function positiveScriptLimit(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  return value;
}

// Capture pristine intrinsics before user code runs. Never call guest toJSON or
// accessors when copying data across the bridge. Proxy traps still run inside
// the caller's interrupt deadline. Handles belong to the context's owner.
const readers = new WeakMap<QuickJSContext, QuickJSHandle>();
export function initializeGuestReader(ctx: QuickJSContext): void {
  const result = ctx.evalCode(`(() => {
    const keys = Object.keys, descriptor = Object.getOwnPropertyDescriptor;
    const define = Object.defineProperty, create = Object.create, setProto = Object.setPrototypeOf;
    const isArray = Array.isArray, stringify = JSON.stringify;
    const limits = ${JSON.stringify(SCRIPT_VALUE_LIMITS)};
    return function read(value, error) {
      let entries = 0, units = 0;
      function string(s) { units += s.length; if (units > limits.stringUnits) throw new RangeError('script string budget exceeded'); return s; }
      function copy(v, depth) {
        if (++entries > limits.entries || depth > limits.depth) throw new RangeError('script value budget exceeded');
        if (typeof v === 'string') return string(v);
        if (v === null || typeof v === 'number' || typeof v === 'boolean' || v === undefined) return v;
        if (typeof v === 'function') return '[Function]';
        if (typeof v !== 'object') throw new TypeError('unsupported script value');
        const list = keys(v);
        if (list.length + entries > limits.entries) throw new RangeError('script value budget exceeded');
        const out = isArray(v) ? setProto([], null) : create(null);
        if (isArray(v)) {
          const length = descriptor(v, 'length');
          if (!length || !('value' in length) || length.value > limits.entries) throw new RangeError('script array budget exceeded');
          out.length = length.value;
        }
        for (let i = 0; i < list.length; i++) {
          const k = string(list[i]);
          const d = descriptor(v, k);
          if (!d || !('value' in d)) throw new TypeError('script accessors cannot cross the bridge');
          define(out, k, { value: copy(d.value, depth + 1), enumerable: true, configurable: true, writable: true });
        }
        // Even an own guest toJSON function must never execute during copying.
        define(out, 'toJSON', { value: undefined, configurable: true });
        return out;
      }
      if (error && value !== null && (typeof value === 'object' || typeof value === 'function')) {
        const out = create(null);
        for (const k of ['name', 'message', 'stack']) {
          const v = value[k]; // exception accessors are also under the deadline
          if (typeof v === 'string') out[k] = string(v);
        }
        return stringify(out);
      }
      return stringify(copy(value, 0));
    };
  })()`, 'sandbox://data-reader');
  if (result.error) { result.error.dispose(); throw new Error('Cannot initialize bounded script bridge'); }
  readers.set(ctx, result.value);
  // The first WASM→host trampoline can tier up lazily. Warm it with an inert
  // callback before any user deadline starts; never invoke a real capability.
  const noop = ctx.newFunction('__rv_warm_bridge', () => ctx.undefined);
  try {
    const call = ctx.callFunction(noop, ctx.undefined);
    if (call.error) call.error.dispose(); else call.value.dispose();
  } finally { noop.dispose(); }
  const warm = ctx.callFunction(result.value, ctx.undefined, ctx.null, ctx.false);
  if (warm.error) warm.error.dispose(); else warm.value.dispose();
}
export function releaseGuestReader(ctx: QuickJSContext): void {
  readers.get(ctx)?.dispose();
  readers.delete(ctx);
}

/** Must be called with an active runtime interrupt budget. */
export function readGuestValue(ctx: QuickJSContext, handle: QuickJSHandle, error = false): unknown {
  if (!error) {
    const type = ctx.typeof(handle);
    if (type === 'undefined') return undefined;
    if (type === 'number') return ctx.getNumber(handle);
    if (type === 'boolean') return ctx.eq(handle, ctx.true);
    if (type === 'function') return '[Function]';
    if (ctx.eq(handle, ctx.null)) return null;
  }
  const reader = readers.get(ctx);
  if (!reader) throw new Error('Script bridge was not initialized');
  const result = ctx.callFunction(reader, ctx.undefined, handle, error ? ctx.true : ctx.false);
  if (result.error) { result.error.dispose(); throw new Error('Script value conversion rejected (accessor, resource limit or unsupported value)'); }
  try {
    if (ctx.typeof(result.value) === 'undefined') return undefined;
    const json = ctx.getString(result.value);
    // Escaping may expand a UTF-16 code unit to six JSON characters.
    if (json.length > SCRIPT_VALUE_LIMITS.stringUnits * 6 + SCRIPT_VALUE_LIMITS.entries * 32) throw new Error('Script result is too large');
    return JSON.parse(json);
  } finally { result.value.dispose(); }
}
