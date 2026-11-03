// SPDX-License-Identifier: AGPL-3.0-only

/**
 * alarm-store — alarm management on top of the signal-level ErrorStore (ADR-0025).
 *
 * The ErrorStore stays what it was: an entry exists exactly while a WebError's
 * signal is high. This store observes its transitions and adds what an
 * operator needs from an alarm system (ISA-18.2, reduced):
 *
 *   state          meaning                                   leaves by
 *   active-unack   signal high, nobody acknowledged          ack → active-ack; clear → rtn-unack (latching) or gone
 *   active-ack     signal high, acknowledged                 clear → gone
 *   rtn-unack      signal returned to normal unacknowledged  ack → gone; raise → active-unack
 *   shelved        hidden by an engineer for a bounded time  expiry/unshelve → re-evaluated
 *
 * Priority and latching come from the project's alarm configuration
 * (`hmi/alarms.json`), never from the GLB. Every transition is appended to a
 * bounded history that survives reloads in this browser; acknowledgement and
 * shelving are additionally reported to the Appliance audit (when present) by
 * the caller. React-free on purpose: the HMI subscribes with
 * useSyncExternalStore, tests drive it with an injected clock and storage.
 */

export type AlarmPriority = 'critical' | 'high' | 'medium' | 'low';
export type AlarmState = 'active-unack' | 'active-ack' | 'rtn-unack' | 'shelved';
export type AlarmEventKind = 'raise' | 'clear' | 'ack' | 'shelve' | 'unshelve';

export const ALARM_PRIORITIES: readonly AlarmPriority[] = ['critical', 'high', 'medium', 'low'];
const PRIORITY_RANK: Record<AlarmPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const MAX_SHELVE_MINUTES = 8 * 60;
export const HISTORY_LIMIT = 1000;

export interface AlarmConfig {
  schemaVersion: 1;
  defaultPriority: AlarmPriority;
  /** Latching: an unacknowledged alarm stays listed after its signal returns to normal. */
  latch: boolean;
  /** Per-alarm overrides keyed by WebError node path. */
  alarms: Record<string, { priority?: AlarmPriority; latch?: boolean }>;
}

export const DEFAULT_ALARM_CONFIG: AlarmConfig = { schemaVersion: 1, defaultPriority: 'high', latch: true, alarms: {} };

export interface AlarmRecord {
  id: string;
  text: string;
  priority: AlarmPriority;
  state: AlarmState;
  /** Whether the underlying signal is currently high (also tracked while shelved). */
  signalActive: boolean;
  raisedAt: number;
  ackedAt: number | null;
  ackedBy: string | null;
  clearedAt: number | null;
  shelvedUntil: number | null;
  /** How often the alarm was raised since it was last gone. */
  occurrences: number;
}

export interface AlarmEvent {
  time: number;
  id: string;
  text: string;
  priority: AlarmPriority;
  kind: AlarmEventKind;
  user: string | null;
}

export interface AlarmSnapshot {
  alarms: AlarmRecord[];
  unacknowledged: number;
  shelved: number;
  history: AlarmEvent[];
}

export interface AlarmStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One active ErrorStore entry, as the store reports it. */
export interface ActiveErrorLike { path: string; text: string }

/** Validate untrusted alarm configuration (a project document); invalid parts fall back to defaults. */
export function parseAlarmConfig(raw: unknown): AlarmConfig {
  if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: unknown }).schemaVersion !== 1) return { ...DEFAULT_ALARM_CONFIG, alarms: {} };
  const value = raw as Record<string, unknown>;
  const priority = (p: unknown): AlarmPriority | undefined => (ALARM_PRIORITIES as readonly unknown[]).includes(p) ? p as AlarmPriority : undefined;
  const alarms: AlarmConfig['alarms'] = {};
  if (value.alarms && typeof value.alarms === 'object' && !Array.isArray(value.alarms)) {
    for (const [id, entry] of Object.entries(value.alarms as Record<string, unknown>).slice(0, 5000)) {
      if (!id || id.length > 512 || !entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const override: { priority?: AlarmPriority; latch?: boolean } = {};
      if (priority(e.priority)) override.priority = priority(e.priority);
      if (typeof e.latch === 'boolean') override.latch = e.latch;
      if (Object.keys(override).length) alarms[id] = override;
    }
  }
  return {
    schemaVersion: 1,
    defaultPriority: priority(value.defaultPriority) ?? DEFAULT_ALARM_CONFIG.defaultPriority,
    latch: typeof value.latch === 'boolean' ? value.latch : DEFAULT_ALARM_CONFIG.latch,
    alarms,
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export class AlarmStore {
  private _config: AlarmConfig = { ...DEFAULT_ALARM_CONFIG, alarms: {} };
  private readonly _alarms = new Map<string, AlarmRecord>();
  private _history: AlarmEvent[] = [];
  private _active = new Map<string, string>();
  private readonly _listeners = new Set<() => void>();
  private _snapshot: AlarmSnapshot | null = null;
  private readonly _now: () => number;
  private readonly _storage: AlarmStorage | null;
  private _scope = 'default';

  constructor(options: { now?: () => number; storage?: AlarmStorage | null } = {}) {
    this._now = options.now ?? (() => Date.now());
    this._storage = options.storage === undefined ? defaultStorage() : options.storage;
  }

  // ── Configuration & scope ──

  configure(config: AlarmConfig): void {
    this._config = config;
    for (const record of this._alarms.values()) record.priority = this._priorityOf(record.id);
    this._changed();
  }

  get config(): AlarmConfig { return this._config; }

  /** Switch the history scope (one per model/project); live alarms are reset. */
  setScope(scope: string): void {
    this._scope = scope || 'default';
    this._alarms.clear();
    this._active.clear();
    this._history = this._loadHistory();
    this._changed();
  }

  private _priorityOf(id: string): AlarmPriority { return this._config.alarms[id]?.priority ?? this._config.defaultPriority; }
  private _latches(id: string): boolean { return this._config.alarms[id]?.latch ?? this._config.latch; }

  // ── Input: ErrorStore transitions ──

  /** Feed the full set of currently active errors; raises and clears are derived. */
  sync(active: readonly ActiveErrorLike[]): void {
    const next = new Map(active.map((e) => [e.path, e.text]));
    let changed = false;
    for (const [id, text] of next) if (!this._active.has(id) || this._active.get(id) !== text) changed = this._raise(id, text) || changed;
    for (const id of this._active.keys()) if (!next.has(id)) changed = this._clear(id) || changed;
    this._active = next;
    if (changed) this._changed();
  }

  private _raise(id: string, text: string): boolean {
    const now = this._now();
    const existing = this._alarms.get(id);
    if (existing && existing.signalActive) {
      // Still active: only the message changed — not a new occurrence.
      if (existing.text === text) return false;
      existing.text = text;
      return true;
    }
    if (!existing) {
      this._alarms.set(id, {
        id, text, priority: this._priorityOf(id), state: 'active-unack', signalActive: true,
        raisedAt: now, ackedAt: null, ackedBy: null, clearedAt: null, shelvedUntil: null, occurrences: 1,
      });
    } else {
      const wasActive = existing.signalActive;
      existing.text = text;
      existing.signalActive = true;
      existing.clearedAt = null;
      if (!wasActive) {
        existing.occurrences += 1;
        existing.raisedAt = now;
        if (existing.state === 'rtn-unack') existing.state = 'active-unack';
      }
    }
    this._log('raise', id, text, null);
    return true;
  }

  private _clear(id: string): boolean {
    const record = this._alarms.get(id);
    if (!record || !record.signalActive) return false;
    record.signalActive = false;
    record.clearedAt = this._now();
    this._log('clear', id, record.text, null);
    if (record.state === 'active-ack') this._alarms.delete(id);
    else if (record.state === 'active-unack') {
      if (this._latches(id)) record.state = 'rtn-unack';
      else this._alarms.delete(id);
    }
    return true;
  }

  // ── Operator actions ──

  /** Acknowledge one alarm. Returns false when there was nothing to acknowledge. */
  ack(id: string, user: string | null): boolean {
    const record = this._alarms.get(id);
    if (!record || (record.state !== 'active-unack' && record.state !== 'rtn-unack')) return false;
    record.ackedAt = this._now();
    record.ackedBy = user;
    this._log('ack', id, record.text, user);
    if (record.state === 'rtn-unack') this._alarms.delete(id);
    else record.state = 'active-ack';
    this._changed();
    return true;
  }

  /** Acknowledge every unacknowledged, unshelved alarm; returns their ids. */
  ackAll(user: string | null): string[] {
    const ids = [...this._alarms.values()].filter((r) => r.state === 'active-unack' || r.state === 'rtn-unack').map((r) => r.id);
    for (const id of ids) this.ack(id, user);
    return ids;
  }

  /** Shelve for 1..MAX_SHELVE_MINUTES minutes. */
  shelve(id: string, minutes: number, user: string | null): boolean {
    const record = this._alarms.get(id);
    if (!record || !Number.isFinite(minutes) || minutes < 1 || minutes > MAX_SHELVE_MINUTES || record.state === 'shelved') return false;
    record.state = 'shelved';
    record.shelvedUntil = this._now() + Math.round(minutes) * 60_000;
    this._log('shelve', id, record.text, user);
    this._changed();
    return true;
  }

  unshelve(id: string, user: string | null): boolean {
    const record = this._alarms.get(id);
    if (!record || record.state !== 'shelved') return false;
    this._reinstate(record, user);
    this._changed();
    return true;
  }

  /** Expire shelving; call periodically (the HMI ticks once per second). */
  tick(): void {
    const now = this._now();
    let changed = false;
    for (const record of [...this._alarms.values()]) {
      if (record.state === 'shelved' && record.shelvedUntil !== null && record.shelvedUntil <= now) {
        this._reinstate(record, null);
        changed = true;
      }
    }
    if (changed) this._changed();
  }

  /** After shelving the alarm is presented again as unacknowledged if still active. */
  private _reinstate(record: AlarmRecord, user: string | null): void {
    this._log('unshelve', record.id, record.text, user);
    record.shelvedUntil = null;
    if (record.signalActive) { record.state = 'active-unack'; record.ackedAt = null; record.ackedBy = null; }
    else this._alarms.delete(record.id);
  }

  /** Model switch: live alarms end with the model; the history is kept. */
  reset(): void {
    this._alarms.clear();
    this._active.clear();
    this._changed();
  }

  // ── Output ──

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  getSnapshot = (): AlarmSnapshot => {
    if (!this._snapshot) {
      const alarms = [...this._alarms.values()].map((r) => ({ ...r })).sort((a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.raisedAt - a.raisedAt);
      this._snapshot = {
        alarms,
        unacknowledged: alarms.filter((a) => a.state === 'active-unack' || a.state === 'rtn-unack').length,
        shelved: alarms.filter((a) => a.state === 'shelved').length,
        history: this._history.slice(),
      };
    }
    return this._snapshot;
  };

  /** History as CSV (newest last), formula-injection safe. */
  historyCsv(): string {
    const header = ['time', 'alarm', 'text', 'priority', 'event', 'user'].join(',');
    const rows = this._history.map((e) => [new Date(e.time).toISOString(), e.id, e.text, e.priority, e.kind, e.user ?? ''].map(csvCell).join(','));
    return `${[header, ...rows].join('\r\n')}\r\n`;
  }

  private _log(kind: AlarmEventKind, id: string, text: string, user: string | null): void {
    this._history.push({ time: this._now(), id, text, priority: this._priorityOf(id), kind, user });
    if (this._history.length > HISTORY_LIMIT) this._history.splice(0, this._history.length - HISTORY_LIMIT);
    this._saveHistory();
  }

  private _key(): string { return `rv-alarm-history/${this._scope}`; }

  private _loadHistory(): AlarmEvent[] {
    try {
      const raw = this._storage?.getItem(this._key());
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string' && typeof e.time === 'number').slice(-HISTORY_LIMIT) : [];
    } catch {
      return [];
    }
  }

  private _saveHistory(): void {
    try { this._storage?.setItem(this._key(), JSON.stringify(this._history)); } catch { /* quota/private mode: history stays in memory */ }
  }

  private _changed(): void {
    this._snapshot = null;
    for (const listener of this._listeners) listener();
  }
}

function defaultStorage(): AlarmStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
