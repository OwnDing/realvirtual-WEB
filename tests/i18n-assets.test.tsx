// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the asset lifecycle (EP-I18N-001 batch 7).
 *
 * How a model gets in and how it leaves: create a project, add a library,
 * import CAD, share a link. Three things are specific to this surface:
 *
 *  - **File names and formats are load-bearing.** `project.json`,
 *    `catalog.json`, `.glb`, `STEP`, `JT`, `USD` are what the user must type or
 *    look for on disk. They sit MID-SENTENCE, so the sentence has to move
 *    around them — which is what `<Trans>` slots are for, and what a
 *    three-fragment JSX split would have frozen.
 *  - **Third-party console fields must match the other screen.** The Asset
 *    Manager credentials (`Project ID`, `Service Account Key ID`, `Secret Key`)
 *    are copied out of somebody else's UI. `assets.spec.*` keeps them identical
 *    in both languages on purpose, the same deal `connect.spec.*` has.
 *  - **Two module-level tables feed radio rows.** `RECIPIENT_MODES` and
 *    `EXPIRY_LABELS` are built at import; resolved strings there would be
 *    frozen at whatever language the first import saw.
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
import { NewProjectDialog } from '../src/core/project/ProjectCreateDialogs';
import { ShareDialog } from '../src/core/share/ShareDialog';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('file names and formats inside a sentence', () => {
  it('survive the translation of the sentence around them', async () => {
    // Each of these is something the user types, searches for, or looks up in a
    // folder. The clause holding it has to be Chinese; the token cannot be.
    const cases: Array<[string, string]> = [
      ['project.createHereBody', 'project.json'],
      ['library.urlHint', 'catalog.json'],
      ['library.githubHint', '.glb'],
      ['import.glbHint', '.glb'],
      ['import.buttonIdle', 'STEP'],
    ];
    for (const [key, token] of cases) {
      const zh = rvT('assets', key as never, { name: 'X' });
      expect(zh, key).toContain(token);
      expect(zh, key).toMatch(/[一-鿿]/);
    }
  });

  it('keep the SAME slot set in both languages, everywhere in the namespace', () => {
    // A per-key case only guards the key somebody wrote a case for. A dropped
    // `<0>` renders the whole clause as plain text and loses the element the
    // component array was going to supply — silently, and only in one language.
    const zh = flatten(zhCN.assets as unknown as Record<string, unknown>);
    const en = flatten((enUS as never as Record<string, unknown>).assets as Record<string, unknown>);
    const slots = (v: string) => [...v.matchAll(/<(\/?\d)>/g)].map((m) => m[1]).sort();

    const withSlots = Object.keys(zh).filter((k) => slots(zh[k]).length > 0);
    expect(withSlots.length).toBeGreaterThan(4);
    for (const key of Object.keys(zh)) {
      expect(slots(zh[key]), key).toEqual(slots(en[key] ?? ''));
    }
  });

  it('sit in numbered slots, so a translator can move them', () => {
    // A three-fragment JSX split would have frozen English word order. The
    // slots are what make the whole clause one reorderable key — and zh-CN
    // actually puts `project.json` in a different position than en-US does.
    const zh = String((zhCN.assets as never as Record<string, Record<string, string>>).project.createHereBody);
    const en = String((enUS.assets as never as Record<string, Record<string, string>>).project.createHereBody);
    for (const text of [zh, en]) {
      expect(text).toContain('<0>');
      expect(text).toContain('<1>');
    }
    expect(zh.indexOf('<1>') / zh.length).not.toBeCloseTo(en.indexOf('<1>') / en.length, 1);
  });
});

describe('Asset Manager credentials', () => {
  it('read identically in both languages', () => {
    // They are copied field-by-field out of the Asset Manager console. A
    // translated label sends the user hunting for a field that is not there.
    const zh = zhCN.assets as never as Record<string, Record<string, string>>;
    const en = enUS.assets as never as Record<string, Record<string, string>>;
    expect(Object.keys(zh.spec).length).toBeGreaterThan(2);
    expect(zh.spec).toEqual(en.spec);
  });

  it('do not make the rest of that dialog untranslated', () => {
    // The counterweight: without it, a catalog that copied English everywhere
    // would pass the case above with full marks.
    expect(rvT('assets', 'library.addTitle')).toMatch(/[一-鿿]/);
    expect(rvT('assets', 'library.nameOptional')).toMatch(/[一-鿿]/);
  });
});

describe('module-level tables', () => {
  it('hold keys, not resolved text', () => {
    // Resolved strings in a table built at import are frozen at whatever the
    // first import saw — which for a deferred namespace is Chinese, always.
    for (const key of ['share.modeViewer', 'share.expiry7d'] as const) {
      expect(rvT('assets', key)).toMatch(/[一-鿿]/);
    }
  });

  it('follow a language switch', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('assets', 'share.modeViewer')).toBe('View only');
    expect(rvT('assets', 'share.expiry7d')).toBe('after 7 days');
    expect(rvT('assets', 'share.modeCommissioning')).toBe('Commissioning');
  });
});

describe('a dialog on screen', () => {
  it('labels the expiry choices from the table, in order', async () => {
    // Reaching through the rendered radio row rather than asserting the catalog:
    // the table maps a value to a KEY now, and a swapped key is invisible to any
    // assertion that only reads the catalog back.
    await act(async () => { await setLocale('en-US'); });
    render(
      <ShareDialog
        open
        onClose={() => {}}
        getBytes={() => new ArrayBuffer(0)}
        sizeBytes={1024}
        linkBase="https://example.test/"
      />,
    );
    for (const [testId, label] of [
      ['share-expiry-never', 'never'],
      ['share-expiry-7d', 'after 7 days'],
      ['share-expiry-30d', 'after 30 days'],
      ['share-expiry-90d', 'after 90 days'],
    ] as const) {
      const input = document.querySelector(`[data-testid="${testId}"]`);
      expect(input, testId).toBeTruthy();
      // The <input> sits inside the MUI FormControlLabel that carries the text.
      expect(input!.closest('label')?.textContent, testId).toBe(label);
    }
  });

  it('renders Chinese by default and English after a switch', async () => {
    render(<NewProjectDialog open name="" onChange={() => {}} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('新建项目')).toBeTruthy();

    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByText('New project')).toBeTruthy();
  });
});

describe('the assets catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.assets as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(135);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('assets', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('assets:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
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
