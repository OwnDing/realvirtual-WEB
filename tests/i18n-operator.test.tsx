// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the operator runtime surface (EP-I18N-001 batch 5).
 *
 * This batch is the one an operator on a shop floor actually reads: the machine
 * panel, the maintenance stepper, the historian, the 3D hover tooltips. What is
 * specific to it, and what these cases defend:
 *
 *  - **Units and international abbreviations stay English; measurement words do
 *    not.** `MTBF`, `NPSH`, `DN`, `pH`, `ΔP` and `OEE` are what the datasheet
 *    prints and what the operator was trained on, so they must survive a
 *    translation pass untouched. `Flow`, `Level` and `Vibration` are ordinary
 *    words and must not. The split is invisible in a diff, so it is asserted.
 *  - **A store builds text outside React.** `problems-store` composes problem
 *    titles at model-load time, so it needs the imperative `rvT`. It is also
 *    where the identifier rule reappears: `assetId` and `path` are field names
 *    inside a sentence that does move.
 *  - **The panels are the deferred half of the catalog.** Every string here
 *    lives in the `operator` namespace, which ADR-0001 R1 loads as a chunk. A
 *    case that reads English without awaiting `setLocale` would pass today and
 *    fail the moment the chunk is genuinely late.
 *
 * Every case pins its locale — inheriting the default passes for the wrong
 * reason exactly once, and then hides a regression.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { missingReferenceDetail } from '../src/core/hmi/problems-store';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';

/**
 * Values that are NOTHING BUT an abbreviation, so the whole value must survive.
 * `tip.npsh` is deliberately absent: it is `NPSH Margin`, where the
 * abbreviation survives and the noun beside it does not — the third case below
 * is the one that owns that shape.
 */
const IDENTIFIERS = [
  'tip.mtbf', 'tip.mttr', 'tip.deltaP', 'tip.ph',
  'historian.subtitle',
] as const;

/** Ordinary measurement words that must NOT survive as English. */
const PROSE = ['tip.flow', 'tip.level', 'tip.vibration', 'tip.pressure'] as const;

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('units and datasheet abbreviations', () => {
  it('read identically in both languages', () => {
    for (const key of IDENTIFIERS) {
      expect(leaf(zhCN, 'operator', key), key).toBe(leaf(enUS, 'operator', key));
    }
  });

  it('do not make the whole namespace untranslated', () => {
    // The counterweight. Without it, a catalog that simply copied English
    // everywhere would pass the case above with full marks.
    for (const key of PROSE) {
      expect(leaf(zhCN, 'operator', key), key).not.toBe(leaf(enUS, 'operator', key));
      expect(leaf(zhCN, 'operator', key), key).toMatch(/[一-鿿]/);
    }
  });

  it('keep the unit inside a sentence that moved', () => {
    // `NPSH Margin` is the shape this rule takes in practice: the abbreviation
    // survives, the word next to it does not.
    expect(rvT('operator', 'tip.npsh')).toContain('NPSH');
    expect(rvT('operator', 'tip.npsh')).toMatch(/[一-鿿]/);
  });
});

describe('problems raised while a model loads', () => {
  it('are Chinese by default, with the field names left alone', async () => {
    // `missingReferenceDetail` runs in a store, not a component: if it had been
    // left on a template literal, nothing in the panel would ever translate it.
    const detail = missingReferenceDetail({ assetId: 'a1', path: 'p/q.glb' });
    expect(detail).toContain('assetId');   // a field name, not copy
    expect(detail).toContain('path');
    expect(detail).toMatch(/[一-鿿]/);

    // The empty case is a SEPARATE sentence in the catalog, and it names the
    // same two fields in prose. Translating them there ("资产 ID"/"路径") reads
    // fine and sends the user looking for a field that does not exist.
    const none = missingReferenceDetail({});
    expect(none).toContain('assetId');
    expect(none).toContain('path');
    expect(none).toMatch(/[一-鿿]/);
  });

  it('switch language with the catalog', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(missingReferenceDetail({ assetId: 'a1' })).toContain('Searched for:');
    expect(missingReferenceDetail({})).toContain('neither an assetId nor a path');
  });

  it('join two paths with a translated connective', async () => {
    // The separator is copy hiding inside `.join()`: ' and ' reads as English in
    // the middle of a Chinese sentence, and no assertion on the sentence itself
    // would catch it.
    expect(rvT('operator', 'problems.and')).not.toBe(' and ');
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('operator', 'problems.and')).toBe(' and ');
  });
});

describe('the machine panel', () => {
  it('translates the ISA state badge, which is the largest word on screen', async () => {
    expect(rvT('operator', 'machine.stateRunning')).toBe('运行中');
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('operator', 'machine.stateRunning')).toBe('RUNNING');
  });

  it('counts drives through a plural-safe key rather than a spliced string', () => {
    const zh = rvT('operator', 'machine.drivesCount', { running: 2, total: 5 });
    expect(zh).toContain('2');
    expect(zh).toContain('5');
    expect(zh).not.toContain('{{');
  });
});

describe('the operator catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.operator as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(180);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('operator', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('operator:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });

  it('is served from the deferred chunk, not the entry bundle', async () => {
    // ADR-0001 R1: `operator` is a non-startup namespace. If it ever moves back
    // into `en-US.ts` this still passes — `tests/bundle-splitting.test.ts` owns
    // the byte proof — but a broken await ordering shows up right here.
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('operator', 'machine.title')).toBe('Machine Control');
  });
});

function leaf(catalog: unknown, ns: string, path: string): string {
  let node = (catalog as Record<string, unknown>)[ns];
  for (const part of path.split('.')) node = (node as Record<string, unknown>)[part];
  return String(node);
}

function flatten(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}
