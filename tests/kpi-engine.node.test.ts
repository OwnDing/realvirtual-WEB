// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0025: KPIs from live signals — computation, windows, resets, thresholds, config parsing. */
import { describe, expect, it } from 'vitest';
import { KpiEngine, parseKpiConfig, counterIncrease } from '../src/core/hmi/kpi-engine';

function harness(signals: Record<string, number | boolean>) {
  let now = 0;
  const engine = new KpiEngine({ readSignal: (n) => signals[n], hasSignal: (n) => n in signals, now: () => now });
  const step = (seconds: number, change: Record<string, number | boolean> = {}) => {
    for (let i = 0; i < seconds; i++) { now += 1000; engine.sample(); }
    Object.assign(signals, change);
  };
  return { engine, signals, step, result: (id: string) => engine.getSnapshot().find((r) => r.id === id)! };
}
const cfg = (kpis: unknown[]) => parseKpiConfig({ schemaVersion: 1, kpis }).config;

describe('KPI engine', () => {
  it('reports the current value of a signal with thresholds', () => {
    const h = harness({ Temp: 61.5 });
    h.engine.configure(cfg([{ id: 'temp', label: 'Temperature', kind: 'value', signal: 'Temp', unit: '°C', decimals: 1, warnAbove: 60, alarmAbove: 80 }]));
    expect(h.result('temp')).toMatchObject({ value: null, status: 'no-data', text: '—' });
    h.engine.sample();
    expect(h.result('temp')).toMatchObject({ value: 61.5, text: '61.5', unit: '°C', status: 'warning' });
    h.signals.Temp = 85; h.engine.sample();
    expect(h.result('temp').status).toBe('alarm');
  });

  it('computes pieces per hour from a counter and tolerates a counter reset', () => {
    expect(counterIncrease([10, 12, 15, 2, 4])).toBe(5 + 2 + 2);
    const h = harness({ Count: 0 });
    h.engine.configure(cfg([{ id: 'rate', label: 'Parts/h', kind: 'rate', signal: 'Count', windowMinutes: 60 }]));
    for (let i = 1; i <= 60; i++) { h.signals.Count = i; h.step(1); } // 1 part per second
    expect(h.result('rate').value).toBeCloseTo(3600 * (59 / 59), 0);
    expect(h.result('rate').unit).toBe('/h');
  });

  it('computes uptime and OEE = availability × performance × quality', () => {
    const h = harness({ Running: true, Total: 0, Good: 0 });
    h.engine.configure(cfg([
      { id: 'up', label: 'Uptime', kind: 'uptime', signal: 'Running' },
      { id: 'oee', label: 'OEE', kind: 'oee', running: 'Running', totalCount: 'Total', goodCount: 'Good', idealCycleSeconds: 2 },
    ]));
    // 80 s running producing one part per 4 s (performance 50 %), 9 of 10 good, then 20 s stopped.
    h.engine.sample();
    for (let s = 1; s <= 80; s++) { if (s % 4 === 0) { h.signals.Total = (h.signals.Total as number) + 1; if (s !== 40) h.signals.Good = (h.signals.Good as number) + 1; } h.step(1); }
    h.signals.Running = false;
    h.step(20);
    // Each sampling interval counts the state at its start: the sample at t=80 s was still
    // running, so 81 of 100 s ran.
    expect(h.result('up').value).toBeCloseTo(81, 6);
    const oee = h.result('oee');
    // A = 81/100, P = 20 parts × 2 s / 81 s, Q = 19/20 → A×P×Q = 0.4 × 0.95 = 38 %
    expect(oee.value).toBeCloseTo(38, 6);
    expect(oee.secondary).toBe('A 81% · P 49% · Q 95%');
  });

  it('drops samples outside the window and flags signals missing from the model', () => {
    const h = harness({ Running: true });
    h.engine.configure(cfg([{ id: 'up', label: 'Uptime', kind: 'uptime', signal: 'Running', windowMinutes: 1 }, { id: 'ghost', label: 'Ghost', kind: 'value', signal: 'Nope' }]));
    h.step(120);
    h.signals.Running = false;
    h.step(61);
    expect(h.result('up').value).toBeLessThan(5);
    expect(h.result('ghost')).toMatchObject({ value: null, status: 'no-data', missing: ['Nope'] });
    expect(h.result('up').history.length).toBeLessThanOrEqual(60);
  });

  it('parses untrusted configuration and explains what it dropped', () => {
    const { config, issues } = parseKpiConfig({ schemaVersion: 1, kpis: [
      { id: 'ok', label: 'OK', kind: 'ratio', numerator: 'A', denominator: 'B' },
      { id: 'ok', label: 'Dup', kind: 'value', signal: 'A' },
      { id: 'oee', label: 'OEE', kind: 'oee', running: 'R' },
      { id: 'bad id!', label: 'X', kind: 'value', signal: 'A' },
      { id: 'k', label: 'K', kind: 'pie', signal: 'A' },
    ] });
    expect(config.kpis.map((k) => k.id)).toEqual(['ok']);
    expect(issues).toHaveLength(4);
    expect(issues.join(' ')).toContain('oee needs totalCount, goodCount, idealCycleSeconds');
    expect(parseKpiConfig(null)).toEqual({ config: { schemaVersion: 1, kpis: [] }, issues: [] });
    expect(parseKpiConfig({ schemaVersion: 2, kpis: [] }).issues).toEqual(['kpis: unsupported document']);
  });
});
