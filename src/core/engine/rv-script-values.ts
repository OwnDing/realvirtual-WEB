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
  // Warm the actual lifecycle path (property lookup → interpreted guest →
  // host callback), not only a direct host call to a C function. WASM may tier
  // these branches independently. This is trusted code in a fresh context;
  // no user script or real host capability runs outside the deadline.
  const noop = ctx.newFunction('__rv_warm_bridge', () => ctx.undefined);
  const factory = ctx.evalCode('(function(bridge){return {continuous:{fixedUpdate(){bridge();}}};})', 'sandbox://bridge-warmup');
  try {
    if (factory.error) { factory.error.dispose(); throw new Error('Cannot initialize script call path'); }
    const root = ctx.callFunction(factory.value, ctx.undefined, noop);
    try {
      if (root.error) { root.error.dispose(); throw new Error('Cannot initialize script call path'); }
      try {
        const handlers = ctx.getProp(root.value, 'continuous');
        try {
          const handler = ctx.getProp(handlers, 'fixedUpdate');
          try {
            const call = ctx.callFunction(handler, ctx.undefined);
            if (call.error) { call.error.dispose(); throw new Error('Cannot initialize script call path'); }
            call.value.dispose();
          } finally { handler.dispose(); }
        } finally { handlers.dispose(); }
      } finally { root.value.dispose(); }
    } finally { factory.value.dispose(); }
  } finally { noop.dispose(); }
  const warm = ctx.evalCode('({value:["warm",1,true,null]})', 'sandbox://value-warmup');
  if (warm.error) { warm.error.dispose(); throw new Error('Cannot initialize script value path'); }
  try { readGuestValue(ctx, warm.value); } finally { warm.value.dispose(); }
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
    if (type === 'string') {
      // Primitive string length is intrinsic: check it before allocating the
      // host string. Avoid guest JSON serialization for every SDK operation.
      const length = ctx.getProp(handle, 'length');
      try {
        const units = ctx.getNumber(length);
        if (ctx.typeof(length) !== 'number' || !Number.isSafeInteger(units) || units < 0 || units > SCRIPT_VALUE_LIMITS.stringUnits) throw new Error('script string budget exceeded');
        return ctx.getString(handle);
      } finally { length.dispose(); }
    }
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
