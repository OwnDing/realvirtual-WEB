// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Signal history in InfluxDB v2, served with the shape the browser's
 * historian-store already expects (`/history/status|signals|query`).
 *
 * Storage: measurement `signal`, tag `name`, float field `value` (bool → 0/1),
 * millisecond precision. One field type for every signal avoids InfluxDB
 * field-type conflicts when a signal's PLC type changes.
 *
 * The InfluxDB token stays in this process. Queries are built only from
 * configured signal names and validated timestamps — no caller-supplied text
 * reaches Flux unescaped.
 */

/** Escape a tag value for InfluxDB line protocol. */
export function escapeTag(value) {
  return String(value).replace(/[\\,= ]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

/** One line-protocol point, or null when the value is not a finite number/bool. */
export function linePoint(name, value, timeMs) {
  const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null;
  // Always a float field: `1` would be a float too, but be explicit for readability.
  const text = String(numeric);
  const field = /^-?\d+$/.test(text) ? `${text}.0` : text;
  return `signal,name=${escapeTag(name)} value=${field} ${Math.trunc(timeMs)}`;
}

/** Quote a string literal for Flux. */
export function fluxString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** Build the Flux query for a validated request. */
export function buildFluxQuery({ bucket, names, fromIso, toIso, everyMs }) {
  const filter = names.map((n) => `r.name == ${fluxString(n)}`).join(' or ');
  return [
    `from(bucket: ${fluxString(bucket)})`,
    `  |> range(start: time(v: ${fluxString(fromIso)}), stop: time(v: ${fluxString(toIso)}))`,
    '  |> filter(fn: (r) => r._measurement == "signal" and r._field == "value")',
    `  |> filter(fn: (r) => ${filter})`,
    ...(everyMs ? [`  |> aggregateWindow(every: ${everyMs}ms, fn: mean, createEmpty: false)`] : []),
    '  |> keep(columns: ["_time", "_value", "name"])',
  ].join('\n');
}

/** Minimal RFC 4180 parser for InfluxDB annotated CSV (quoted fields, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Turn a Flux CSV response into `[{ signal, ts[], values[] }]`. */
export function seriesFromCsv(text, names) {
  const series = new Map(names.map((n) => [n, { signal: n, ts: [], values: [] }]));
  let header = null;
  for (const row of parseCsv(text)) {
    if (row.length === 1 && row[0] === '') { header = null; continue; } // table separator
    if (row[0]?.startsWith('#')) continue; // annotations
    if (!header) { header = row; continue; }
    const time = row[header.indexOf('_time')];
    const value = Number(row[header.indexOf('_value')]);
    const name = row[header.indexOf('name')];
    const entry = series.get(name);
    const ts = Date.parse(time);
    if (!entry || !Number.isFinite(ts) || !Number.isFinite(value)) continue;
    entry.ts.push(ts);
    entry.values.push(value);
  }
  for (const entry of series.values()) {
    // Tables arrive per series but are not guaranteed to be time-ordered across windows.
    const order = entry.ts.map((t, i) => i).sort((a, b) => entry.ts[a] - entry.ts[b]);
    entry.ts = order.map((i) => entry.ts[i]);
    entry.values = order.map((i) => entry.values[i]);
  }
  return [...series.values()];
}

export class HistoryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export class InfluxHistory {
  /**
   * @param {ReturnType<import('./config.mjs').validateConfig>['history']} config
   * @param {import('./signals.mjs').SignalRegistry} registry
   * @param {{ influxToken: string|null }} secrets
   * @param {typeof fetch} [fetchImpl]
   */
  constructor(config, registry, secrets, fetchImpl = fetch) {
    this.config = config;
    this.registry = registry;
    this.token = secrets.influxToken;
    this.fetch = fetchImpl;
    this.queue = [];
    this.droppedPoints = 0;
    this.lastWriteUtc = null;
    this.lastError = null;
    this.authError = false;
    this.connected = false;
    this._timer = null;
    this._flushing = null;
    this._unsubscribe = null;
  }

  start() {
    if (!this.config.enabled) return this;
    this._unsubscribe = this.registry.onChange((name, entry, info) => {
      if (!info?.valueChanged || entry.quality !== 'good' || entry.config.history === false) return;
      const line = linePoint(name, entry.value, entry.sourceTime ?? Date.now());
      if (!line) return;
      if (this.queue.length >= this.config.maxQueue) { this.queue.shift(); this.droppedPoints++; }
      this.queue.push(line);
    });
    this._timer = setInterval(() => { void this.flush(); }, this.config.flushIntervalMs);
    this._timer.unref?.();
    return this;
  }

  _headers(extra = {}) {
    return { Authorization: `Token ${this.token}`, ...extra };
  }

  /** Send the queued points; on failure they are put back (bounded by maxQueue). */
  async flush() {
    if (!this.config.enabled || this.queue.length === 0) return;
    if (this._flushing) return this._flushing;
    const batch = this.queue.splice(0, 5000);
    const url = `${this.config.url}/api/v2/write?org=${encodeURIComponent(this.config.org)}&bucket=${encodeURIComponent(this.config.bucket)}&precision=ms`;
    this._flushing = (async () => {
      try {
        const response = await this.fetch(url, { method: 'POST', headers: this._headers({ 'Content-Type': 'text/plain; charset=utf-8' }), body: batch.join('\n'), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new HistoryError(response.status, `InfluxDB write failed: HTTP ${response.status}`);
        this.connected = true;
        this.authError = false;
        this.lastError = null;
        this.lastWriteUtc = new Date().toISOString();
      } catch (error) {
        this.connected = false;
        this.authError = error instanceof HistoryError && (error.status === 401 || error.status === 403);
        this.lastError = error instanceof Error ? error.message : String(error);
        // Put the batch back in front; anything beyond maxQueue is counted as dropped.
        this.queue.unshift(...batch);
        const excess = this.queue.length - this.config.maxQueue;
        if (excess > 0) { this.queue.splice(0, excess); this.droppedPoints += excess; }
      } finally {
        this._flushing = null;
      }
    })();
    return this._flushing;
  }

  status() {
    if (!this.config.enabled) {
      return { enabled: false, connected: false, bucket: null, lastWriteUtc: null, droppedPoints: 0, authError: false, disabledReason: 'History is disabled in the gateway configuration.' };
    }
    return {
      enabled: true, connected: this.connected, bucket: this.config.bucket, lastWriteUtc: this.lastWriteUtc,
      droppedPoints: this.droppedPoints, authError: this.authError, disabledReason: this.connected ? null : this.lastError,
      queued: this.queue.length,
    };
  }

  /** Probe InfluxDB so status is meaningful before the first write. */
  async probe() {
    if (!this.config.enabled) return;
    try {
      const response = await this.fetch(`${this.config.url}/health`, { signal: AbortSignal.timeout(5000) });
      this.connected = response.ok;
      if (!response.ok) this.lastError = `InfluxDB health: HTTP ${response.status}`;
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  signals() {
    return this.registry.entries()
      .filter((e) => e.config.history !== false)
      .map((e) => ({ name: e.config.name, active: e.quality === 'good' }));
  }

  /** Validate `?from&to&signal...` and return `[{ signal, ts, values }]`. */
  async query(params) {
    if (!this.config.enabled) throw new HistoryError(409, 'History is disabled in the gateway configuration.');
    const from = Date.parse(params.get('from') ?? '');
    const to = Date.parse(params.get('to') ?? '');
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new HistoryError(400, 'from/to must be ISO timestamps with from < to');
    if (to - from > this.config.maxRangeDays * 86_400_000) throw new HistoryError(400, `range exceeds ${this.config.maxRangeDays} days`);
    const requested = [...new Set(params.getAll('signal'))];
    if (requested.length === 0 || requested.length > 50) throw new HistoryError(400, 'request 1..50 signals');
    const known = new Set(this.signals().map((s) => s.name));
    const unknown = requested.filter((n) => !known.has(n));
    if (unknown.length) throw new HistoryError(404, `unknown or unrecorded signal: ${unknown.join(', ')}`);
    const span = to - from;
    const everyMs = span / this.config.maxPointsPerSeries > 1000 ? Math.ceil(span / this.config.maxPointsPerSeries) : 0;
    const query = buildFluxQuery({ bucket: this.config.bucket, names: requested, fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString(), everyMs });
    const response = await this.fetch(`${this.config.url}/api/v2/query?org=${encodeURIComponent(this.config.org)}`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/vnd.flux', Accept: 'application/csv' }),
      body: query,
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new HistoryError(502, `InfluxDB query failed: HTTP ${response.status}`);
    return seriesFromCsv(await response.text(), requested);
  }

  async stop() {
    clearInterval(this._timer);
    this._unsubscribe?.();
    await this.flush();
  }
}
