// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for discrete-event simulation and material flow
 * (EP-I18N-001 batch 8).
 *
 * The experiment matrix, the DES toolbars, the sim/live mode toggle and the
 * order cart. What is specific here:
 *
 *  - **Stored experiment names are not copy.** `Baseline` and `Experiment N`
 *    are written into the project manifest and used as keys for runs,
 *    checkpoints and snapshots. Translating them would make a saved project's
 *    experiment unreachable from a differently-configured browser — so they are
 *    deliberately NOT in the catalog, and this file says so out loud.
 *  - **The parameter script example is executable.** Every token in
 *    `self.setField('Src','DESSource','InterArrivalTime', 3)` is API surface;
 *    a translated version is a script that throws.
 *  - **Domain abbreviations stay.** `DES`, `MU`, `LogicSteps`, `KPI`, `CRN` and
 *    the `DD:HH:MM:SS` duration format are what the simulation literature and
 *    the fields themselves use.
 *  - **A KPI table is built at module load** and hands labels to a panel that
 *    renders much later.
 *
 * Every case pins its locale — inheriting the default passes for the wrong
 * reason exactly once, and then hides a regression.
 */

import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('simulation domain terms', () => {
  it('keep the abbreviations and translate the words around them', async () => {
    const cases: Array<[string, string]> = [
      ['des.runnerUnavailable', 'DES'],
      ['des.modeSwitchNotice', 'MU'],
      ['des.resetMus', 'LogicSteps'],
      ['des.experiments', 'KPI'],
      ['des.endHelper', 'DD:HH:MM:SS'],
      ['matrix.simEndRow', 'DD:HH:MM:SS'],
    ];
    for (const [key, token] of cases) {
      const zh = rvT('sim', key as never);
      expect(zh, key).toContain(token);
      expect(zh, key).toMatch(/[一-鿿]/);
    }
  });

  it('translate the technique names that are ordinary words', async () => {
    // The counterweight. "Common Random Numbers" is a phrase, not a token —
    // it has a settled Chinese rendering and must not be left English.
    expect(rvT('sim', 'matrix.crnTip')).toMatch(/[一-鿿]/);
    expect(rvT('sim', 'des.kpiThroughput')).toBe('吞吐量');
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('sim', 'des.kpiThroughput')).toBe('Throughput');
  });
});

describe('names that are written to disk', () => {
  it('are absent from the catalog on purpose', () => {
    // `Baseline` / `Experiment N` key the runs, checkpoints and snapshots in
    // the project manifest. A locale-dependent name would make a project saved
    // in one language unreadable in the other — so no key may exist for them.
    const zh = flatten(zhCN.sim as unknown as Record<string, unknown>);
    for (const value of Object.values(zh)) {
      expect(value).not.toBe('Baseline');
      expect(value).not.toBe('基线');
    }
  });
});

describe('the parameter script example', () => {
  it('stays executable in both languages', async () => {
    // It is not prose; it is a line the user copies into the editor.
    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      expect(rvT('sim', 'matrix.setterOnly'), locale).not.toContain('setField');
    }
    // …and the sentence that introduces it does move.
    await act(async () => { await setLocale('zh-CN'); });
    expect(rvT('sim', 'matrix.setterOnly')).toMatch(/[一-鿿]/);
  });
});

describe('the sim catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.sim as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(95);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('sim', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('sim:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });

  it('keeps the same interpolation placeholders per key', () => {
    // A dropped `{{seed}}` renders a run line with a hole in it, and no type
    // catches that — the value is a string either way.
    const zh = flatten(zhCN.sim as unknown as Record<string, unknown>);
    const en = flatten((enUS as never as Record<string, unknown>).sim as Record<string, unknown>);
    const ph = (v: string) => [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const interpolated = Object.keys(zh).filter((k) => ph(zh[k]).length > 0);
    expect(interpolated.length).toBeGreaterThan(10);
    for (const key of Object.keys(zh)) {
      expect(ph(zh[key]), key).toEqual(ph(en[key] ?? ''));
    }
  });
});

function flatten(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}
