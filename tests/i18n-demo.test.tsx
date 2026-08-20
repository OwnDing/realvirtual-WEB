// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the demo HMI, the robot alarm and the storage notices
 * (EP-I18N-001 batch 9).
 *
 * This is the layer a visitor actually sees first — the KPI bar, the message
 * tiles down the right-hand side, and the amber banner across the top. Three
 * things are specific to it:
 *
 *  - **Two module-level objects hand rendered prose to code that runs later.**
 *    `SYST_320_SCENARIO` carries a diagnosis, five recommended steps and three
 *    operator notes; `OVERLAY_CATEGORIES` names the Display panel's rows. Both
 *    are built at import — before a language preference exists.
 *  - **The storage banner is written by a non-React module.** `rv-opfs-blobs`
 *    notifies on a failed persistence request, so its text needs the imperative
 *    `rvT`; it is also the string the user reported as still English.
 *  - **Vendor fault codes and manual titles are lookup keys.** `F8060`,
 *    `SYST-320`, `MS2N`, `KA47-DRN90M4` and the FANUC manual titles are what
 *    you match against a datasheet, so they survive; the fault DESCRIPTION next
 *    to them is prose and does not.
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
import { SYST_320_SCENARIO } from '../src/plugins/demo/robot-alarm/alarm-seed-data';
import { OVERLAY_CATEGORIES } from '../src/core/overlay-visibility-store';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('the alarm scenario built at import', () => {
  it('follows a language switch instead of freezing — EVERY prose field', async () => {
    // Enumerated rather than sampled. A per-field spot check passes as long as
    // the field somebody wrote a case for is still a getter, and the one that
    // regressed is always the other one.
    const prose = () => [
      ['title', SYST_320_SCENARIO.title],
      ['subtitle', SYST_320_SCENARIO.subtitle],
      ['diagnosis', SYST_320_SCENARIO.diagnosis],
      ...SYST_320_SCENARIO.recommendedSteps.map((v, i) => [`step${i}`, v] as const),
      ...SYST_320_SCENARIO.seedNotes.flatMap((n, i) => [
        [`note${i}.text`, n.text] as const,
        [`note${i}.shift`, n.shift] as const,
        [`note${i}.date`, n.dateLabel] as const,
      ]),
    ] as ReadonlyArray<readonly [string, string]>;

    for (const [name, value] of prose()) expect(value, `zh ${name}`).toMatch(/[一-鿿]/);

    await act(async () => { await setLocale('en-US'); });
    for (const [name, value] of prose()) expect(value, `en ${name}`).not.toMatch(/[一-鿿]/);
    expect(SYST_320_SCENARIO.title).toBe('SYST-320 — Contact Force Exceeds Limit');
    expect(SYST_320_SCENARIO.recommendedSteps).toHaveLength(5);
    expect(SYST_320_SCENARIO.seedNotes[0].text).toContain('magnetic gripper');
  });

  it('keeps the alarm code and the search terms out of the translation', async () => {
    // The code is what you look up. The search terms hit the ENGLISH manual PDF
    // — translating them would search a document for words it does not contain.
    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      expect(SYST_320_SCENARIO.code, locale).toBe('SYST-320');
      expect(SYST_320_SCENARIO.title, locale).toContain('SYST-320');
      expect(SYST_320_SCENARIO.excerptSearchTerms, locale).toContain('dual check safety');
      expect(SYST_320_SCENARIO.docRefs[0].searchTerms, locale).toContain('payload');
    }
  });

  it('cites the manual by a title you can actually look up', async () => {
    // A citation you cannot find is worse than one you cannot read.
    const zh = SYST_320_SCENARIO.docRefs.map((r) => r.label);
    await act(async () => { await setLocale('en-US'); });
    expect(SYST_320_SCENARIO.docRefs.map((r) => r.label)).toEqual(zh);
    expect(zh[0]).toContain('FANUC CRX Cell Manual');
  });
});

describe('vendor fault tiles', () => {
  it('keep the code and move the description', async () => {
    for (const [key, token] of [
      ['hmi.boschFault', 'F8060'],
      ['hmi.boschSub', 'MS2N'],
      ['hmi.sewSub', 'KA47-DRN90M4'],
    ] as const) {
      expect(rvT('demo', key), key).toContain(token);
    }
    expect(rvT('demo', 'hmi.boschFault')).toMatch(/[一-鿿]/);
    expect(rvT('demo', 'hmi.sewFault')).toMatch(/[一-鿿]/);
  });
});

describe('the storage banner', () => {
  it('is Chinese by default — the string the user saw in English', async () => {
    // Written by a non-React module, which is why it needed the imperative
    // form and why it stayed English through eight batches of component work.
    expect(rvT('demo', 'notice.notPersisted')).toMatch(/[一-鿿]/);
    expect(rvT('demo', 'notice.notPersisted')).not.toContain('persistent storage');

    await act(async () => { await setLocale('en-US'); });
    expect(rvT('demo', 'notice.notPersisted')).toContain('did not grant persistent storage');
  });
});

describe('the Display panel category table', () => {
  it('holds keys, not resolved text', async () => {
    expect(OVERLAY_CATEGORIES.length).toBeGreaterThan(5);
    for (const cat of OVERLAY_CATEGORIES) {
      expect(cat, cat.id).not.toHaveProperty('label');
      expect(rvT('operator', cat.labelKey), cat.id).toMatch(/[一-鿿]/);
    }
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('operator', OVERLAY_CATEGORIES[0].labelKey)).toBe('Tooltips');
  });
});

describe('the demo catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.demo as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(100);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('demo', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('demo:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });

  it('keeps the spec group identical in both languages', () => {
    const zh = (zhCN.demo as never as Record<string, Record<string, string>>).spec;
    const en = (enUS.demo as never as Record<string, Record<string, string>>).spec;
    expect(Object.keys(zh).length).toBeGreaterThan(3);
    expect(zh).toEqual(en);
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
