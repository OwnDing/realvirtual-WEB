// SPDX-License-Identifier: AGPL-3.0-only

/**
 * kpi-engine — KPIs computed from live signals, defined per project (ADR-0025).
 *
 * Replaces nothing: the seeded demo charts stay demo content. These KPIs come
 * from `hmi/kpis.json` in the open project and read the SignalStore, so the
 * numbers are the plant's, not a pseudo-random series.
 *
 *   value   current value of one signal (Bool → 0/1)
 *   rate    pieces per hour from a counter signal (resets tolerated)
 *   ratio   numerator / denominator × 100 %
 *   uptime  % of the window a Bool signal was true
 *   oee     availability × performance × quality (running, total, good, ideal cycle)
 *
 * Samples are taken once per second into a bounded per-KPI window held in
 * memory; it starts empty after a reload. Long-term trends belong to the
 * historian. React-free; the HMI subscribes with useSyncExternalStore.
 */

export type KpiKind = 'value' | 'rate' | 'ratio' | 'uptime' | 'oee';
export const KPI_KINDS: readonly KpiKind[] = ['value', 'rate', 'ratio', 'uptime', 'oee'];

export interface KpiDefinition {
  id: string;
  label: string;
  kind: KpiKind;
  unit?: string;
  decimals?: number;
  /** value / rate (counter) / uptime (Bool). */
  signal?: string;
  numerator?: string;
  denominator?: string;
  /** OEE inputs. */
  running?: string;
  totalCount?: string;
  goodCount?: string;
  idealCycleSeconds?: number;
  /** Window for rate / uptime / oee (minutes, default 60). */
  windowMinutes?: number;
  warnBelow?: number;
  alarmBelow?: number;
  warnAbove?: number;
  alarmAbove?: number;
}

export interface KpiConfig { schemaVersion: 1; kpis: KpiDefinition[] }
export const EMPTY_KPI_CONFIG: KpiConfig = { schemaVersion: 1, kpis: [] };

export type KpiStatus = 'ok' | 'warning' | 'alarm' | 'no-data';

export interface KpiResult {
  id: string;
  label: string;
  kind: KpiKind;
  value: number | null;
  unit: string;
  text: string;
  /** OEE breakdown or other context, already formatted. */
  secondary: string | null;
  status: KpiStatus;
  /** Recent computed values for a sparkline (oldest first). */
  history: number[];
  /** Configured signals that do not exist in the current model. */
  missing: string[];
}

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_KPIS = 32;
const SPARK_POINTS = 60;

function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function text(v: unknown, max: number): string | undefined { return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined; }

/** Validate untrusted KPI configuration (a project document); invalid entries are dropped. */
export function parseKpiConfig(raw: unknown): { config: KpiConfig; issues: string[] } {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: unknown }).schemaVersion !== 1 || !Array.isArray((raw as { kpis?: unknown }).kpis)) {
    return { config: { ...EMPTY_KPI_CONFIG, kpis: [] }, issues: raw === null || raw === undefined ? [] : ['kpis: unsupported document'] };
  }
  const seen = new Set<string>();
  const kpis: KpiDefinition[] = [];
  for (const [index, item] of ((raw as { kpis: unknown[] }).kpis).slice(0, MAX_KPIS).entries()) {
    const e = (item ?? {}) as Record<string, unknown>;
    const id = text(e.id, 64);
    const label = text(e.label, 80);
    const kind = (KPI_KINDS as readonly unknown[]).includes(e.kind) ? e.kind as KpiKind : undefined;
    if (!id || !ID.test(id) || seen.has(id) || !label || !kind) { issues.push(`kpis[${index}]: needs a unique id, a label and a kind`); continue; }
    const def: KpiDefinition = { id, label, kind };
    for (const key of ['unit', 'signal', 'numerator', 'denominator', 'running', 'totalCount', 'goodCount'] as const) {
      const value = text(e[key], 256);
      if (value) def[key] = value;
    }
    if (Number.isInteger(e.decimals) && (e.decimals as number) >= 0 && (e.decimals as number) <= 6) def.decimals = e.decimals as number;
    if (finite(e.windowMinutes) && e.windowMinutes >= 1 && e.windowMinutes <= 24 * 60) def.windowMinutes = e.windowMinutes;
    if (finite(e.idealCycleSeconds) && e.idealCycleSeconds > 0) def.idealCycleSeconds = e.idealCycleSeconds;
    for (const key of ['warnBelow', 'alarmBelow', 'warnAbove', 'alarmAbove'] as const) if (finite(e[key])) def[key] = e[key] as number;
    const required: Record<KpiKind, Array<keyof KpiDefinition>> = {
      value: ['signal'], rate: ['signal'], uptime: ['signal'], ratio: ['numerator', 'denominator'],
      oee: ['running', 'totalCount', 'goodCount', 'idealCycleSeconds'],
    };
    const absent = required[kind].filter((key) => def[key] === undefined);
    if (absent.length) { issues.push(`kpis[${index}] (${id}): ${kind} needs ${absent.join(', ')}`); continue; }
    seen.add(id);
    kpis.push(def);
  }
  return { config: { schemaVersion: 1, kpis }, issues };
}

type Reading = number | boolean | undefined;
interface Sample { t: number; v: Record<string, number> }

function num(r: Reading): number | undefined {
  if (typeof r === 'boolean') return r ? 1 : 0;
  return finite(r) ? r : undefined;
}

/** Sum of positive steps of a counter (a decrease is a counter reset, not negative production). */
export function counterIncrease(values: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < values.length; i++) {
    const step = values[i] - values[i - 1];
    total += step >= 0 ? step : Math.max(0, values[i]);
  }
  return total;
}

/** Seconds a Bool signal was true over consecutive samples (each interval counts its start state). */
export function trueSeconds(samples: readonly Sample[], name: string): number {
  let seconds = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1].v[name] === 1) seconds += (samples[i].t - samples[i - 1].t) / 1000;
  return seconds;
}

function signalsOf(def: KpiDefinition): string[] {
  return [def.signal, def.numerator, def.denominator, def.running, def.totalCount, def.goodCount].filter((s): s is string => typeof s === 'string');
}

function statusOf(def: KpiDefinition, value: number | null): KpiStatus {
  if (value === null) return 'no-data';
  if ((def.alarmBelow !== undefined && value < def.alarmBelow) || (def.alarmAbove !== undefined && value > def.alarmAbove)) return 'alarm';
  if ((def.warnBelow !== undefined && value < def.warnBelow) || (def.warnAbove !== undefined && value > def.warnAbove)) return 'warning';
  return 'ok';
}

export class KpiEngine {
  private _config: KpiConfig = { ...EMPTY_KPI_CONFIG, kpis: [] };
  private readonly _windows = new Map<string, Sample[]>();
  private readonly _spark = new Map<string, number[]>();
  private readonly _missing = new Map<string, string[]>();
  private _results: KpiResult[] = [];
  private readonly _listeners = new Set<() => void>();
  private readonly _now: () => number;
  private readonly _read: (name: string) => Reading;
  private readonly _has: (name: string) => boolean;
  private readonly _format: (value: number, decimals: number) => string;

  constructor(options: { readSignal: (name: string) => Reading; hasSignal: (name: string) => boolean; now?: () => number; format?: (value: number, decimals: number) => string }) {
    this._read = options.readSignal;
    this._has = options.hasSignal;
    this._now = options.now ?? (() => Date.now());
    this._format = options.format ?? ((value, decimals) => value.toFixed(decimals));
  }

  get config(): KpiConfig { return this._config; }

  configure(config: KpiConfig): void {
    this._config = config;
    this._windows.clear();
    this._spark.clear();
    this._missing.clear();
    this._results = config.kpis.map((def) => this._compute(def));
    this._emit();
  }

  /** Take one sample of every configured KPI's signals and recompute. */
  sample(): void {
    if (this._config.kpis.length === 0) return;
    const t = this._now();
    for (const def of this._config.kpis) {
      const names = signalsOf(def);
      this._missing.set(def.id, names.filter((n) => !this._has(n)));
      const v: Record<string, number> = {};
      for (const name of names) {
        const value = num(this._read(name));
        if (value !== undefined) v[name] = value;
      }
      const window = this._windows.get(def.id) ?? [];
      window.push({ t, v });
      const horizon = t - (def.windowMinutes ?? 60) * 60_000;
      while (window.length > 2 && window[1].t <= horizon) window.shift();
      this._windows.set(def.id, window);
    }
    this._results = this._config.kpis.map((def) => {
      const result = this._compute(def);
      if (result.value !== null) {
        const spark = this._spark.get(def.id) ?? [];
        spark.push(result.value);
        if (spark.length > SPARK_POINTS) spark.shift();
        this._spark.set(def.id, spark);
      }
      return { ...result, history: [...(this._spark.get(def.id) ?? [])] };
    });
    this._emit();
  }

  private _compute(def: KpiDefinition): KpiResult {
    const samples = this._windows.get(def.id) ?? [];
    const last = samples.at(-1);
    const series = (name: string) => samples.map((s) => s.v[name]).filter(finite);
    const elapsed = samples.length > 1 ? (samples[samples.length - 1].t - samples[0].t) / 1000 : 0;
    let value: number | null = null;
    let secondary: string | null = null;
    let unit = def.unit ?? '';
    switch (def.kind) {
      case 'value':
        value = last?.v[def.signal!] ?? null;
        break;
      case 'ratio': {
        const n = last?.v[def.numerator!];
        const d = last?.v[def.denominator!];
        value = finite(n) && finite(d) && d !== 0 ? (n / d) * 100 : null;
        unit = def.unit ?? '%';
        break;
      }
      case 'rate':
        value = elapsed >= 10 ? counterIncrease(series(def.signal!)) / (elapsed / 3600) : null;
        unit = def.unit ?? '/h';
        break;
      case 'uptime':
        value = elapsed >= 10 ? (trueSeconds(samples, def.signal!) / elapsed) * 100 : null;
        unit = def.unit ?? '%';
        break;
      case 'oee': {
        unit = def.unit ?? '%';
        if (elapsed < 10) break;
        const run = trueSeconds(samples, def.running!);
        const total = counterIncrease(series(def.totalCount!));
        const good = counterIncrease(series(def.goodCount!));
        const availability = run / elapsed;
        const performance = run > 0 ? Math.min(1, (total * def.idealCycleSeconds!) / run) : 0;
        const quality = total > 0 ? Math.min(1, good / total) : null;
        if (quality === null) { secondary = `A ${this._format(availability * 100, 0)}% · P — · Q —`; break; }
        value = availability * performance * quality * 100;
        secondary = `A ${this._format(availability * 100, 0)}% · P ${this._format(performance * 100, 0)}% · Q ${this._format(quality * 100, 0)}%`;
        break;
      }
    }
    const decimals = def.decimals ?? (def.kind === 'value' ? 2 : 1);
    return {
      id: def.id, label: def.label, kind: def.kind, value, unit,
      text: value === null ? '—' : this._format(value, decimals),
      secondary, status: statusOf(def, value), history: [...(this._spark.get(def.id) ?? [])],
      missing: this._missing.get(def.id) ?? [],
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  };

  getSnapshot = (): KpiResult[] => this._results;

  private _emit(): void { for (const listener of this._listeners) listener(); }
}
