// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Signal model shared by every source and the WebSocket Realtime v2 server.
 *
 * Direction is named from the PLC's point of view, exactly as the browser
 * contract does (doc-webviewer-interface.md, IO-1):
 *   PLCInput*  — the PLC reads it, the WEB writes it (start button, setpoint)
 *   PLCOutput* — the PLC writes it, the WEB reads it (encoder, state)
 */

const PLC_TYPE = /^PLC(Input|Output)(Bool|Int|Float)$/;

/** Parse `PLCInputBool` → `{ direction: 'input', valueType: 'bool' }`, or null. */
export function parsePlcType(type) {
  const match = typeof type === 'string' ? PLC_TYPE.exec(type) : null;
  if (!match) return null;
  return { direction: match[1] === 'Input' ? 'input' : 'output', valueType: match[2].toLowerCase() };
}

/** The value a signal reports before its source has delivered one. */
export function defaultValue(valueType) {
  return valueType === 'bool' ? false : 0;
}

/**
 * Coerce a wire value to the signal's value type, or return `undefined` when it
 * cannot be represented exactly. Never guesses: `"1"` is not a bool, `1.5` is
 * not an int, `NaN`/`Infinity` are not floats.
 */
export function coerceValue(valueType, value) {
  if (valueType === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 1) return value === 1;
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (valueType === 'int') {
    // The OPC UA data type's own range is enforced by the write policy.
    if (!Number.isSafeInteger(value)) return undefined;
    return value;
  }
  return value;
}

/** Convert a value coming FROM a source (OPC UA variant payload) to the wire type. */
export function fromSourceValue(valueType, raw) {
  if (raw === null || raw === undefined) return undefined;
  if (valueType === 'bool') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    return undefined;
  }
  // Int64/UInt64 arrive as [high, low] word pairs from node-opcua.
  if (Array.isArray(raw) && raw.length === 2 && raw.every((n) => Number.isInteger(n))) {
    raw = raw[0] * 4294967296 + raw[1];
  }
  if (typeof raw === 'bigint') raw = Number(raw);
  if (typeof raw === 'boolean') raw = raw ? 1 : 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return valueType === 'int' ? Math.trunc(raw) : raw;
}

/**
 * Live registry of configured signals. Holds the last value delivered by the
 * source plus its quality, and notifies listeners on real changes only.
 */
export class SignalRegistry {
  /** @param {Array<import('./config.mjs').SignalConfig>} signals */
  constructor(signals) {
    /** @type {Map<string, { config: any, direction: string, valueType: string, value: boolean|number, quality: 'good'|'bad'|'uncertain'|'pending', sourceTime: number|null }>} */
    this._entries = new Map();
    for (const config of signals) {
      const parsed = parsePlcType(config.type);
      this._entries.set(config.name, {
        config, ...parsed, value: defaultValue(parsed.valueType), quality: 'pending', sourceTime: null,
      });
    }
    this._listeners = new Set();
  }

  get(name) { return this._entries.get(name); }
  has(name) { return this._entries.has(name); }
  names() { return [...this._entries.keys()]; }
  entries() { return [...this._entries.values()]; }

  /** `{ name: value }` for all (or the given) signals. */
  values(names = this.names()) {
    const out = {};
    for (const name of names) {
      const entry = this._entries.get(name);
      if (entry) out[name] = entry.value;
    }
    return out;
  }

  /** `{ name: PLCType }` exactly as configured. */
  types() {
    const out = {};
    for (const [name, entry] of this._entries) out[name] = entry.config.type;
    return out;
  }

  /**
   * Apply a value from the source. Returns true when the value or quality
   * changed (listeners are notified with the changed value only).
   */
  update(name, raw, quality = 'good', sourceTime = Date.now()) {
    const entry = this._entries.get(name);
    if (!entry) return false;
    const value = fromSourceValue(entry.valueType, raw);
    const nextQuality = value === undefined ? 'bad' : quality;
    // The first good sample always counts as a change: it replaces the default.
    const valueChanged = value !== undefined && (value !== entry.value || entry.quality === 'pending');
    const changed = valueChanged || nextQuality !== entry.quality;
    if (value !== undefined) entry.value = value;
    entry.quality = nextQuality;
    entry.sourceTime = sourceTime;
    if (changed) for (const listener of this._listeners) listener(name, entry, { valueChanged });
    return changed;
  }

  /** Mark every signal as uncertain (source connection lost); values are kept. */
  markAll(quality) {
    for (const [name, entry] of this._entries) {
      if (entry.quality === quality) continue;
      entry.quality = quality;
      for (const listener of this._listeners) listener(name, entry, { valueChanged: false });
    }
  }

  onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
