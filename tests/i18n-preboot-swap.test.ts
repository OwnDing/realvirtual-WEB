// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The pre-boot language swap, executed (ADR-0001 §11).
 *
 * `tests/i18n-preboot.node.test.ts` proves the shipped HTML says the right
 * things and is ordered correctly. This file proves the script in it actually
 * DOES the right thing, by running the real source out of `index.html` against
 * the real markup out of `index.html` — no copy of either.
 *
 * Why that is worth its own file: the whole mechanism exists to be correct
 * before any bundle runs, so nothing in the app imports it and nothing else in
 * the suite would notice if it silently stopped working.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { LANGUAGE_PREFERENCE_KEY } from '../src/core/hmi/rv-storage-keys';
import { LANGUAGE_PREFERENCE_VERSION } from '../src/core/i18n/rv-i18n-preference';
import { enUS } from '../src/core/i18n/catalogs/en-US';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';

/** The loading overlay exactly as `index.html` ships it. */
const OVERLAY = /<div id="loading-overlay">[\s\S]*?\n  <\/div>/.exec(indexHtml)?.[0] ?? '';

/** The inline pre-boot script's body, exactly as `index.html` ships it.
 *  Located by the storage key it reads rather than by shape, so a reformat of
 *  the script does not silently turn this file into a no-op. */
const SCRIPT = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .find((body) => body.includes(LANGUAGE_PREFERENCE_KEY)) ?? '';

let host: HTMLDivElement;
let originalLang: string;

beforeEach(() => {
  expect(OVERLAY, 'loading overlay not found in index.html').not.toBe('');
  expect(SCRIPT, 'inline pre-boot script not found in index.html').not.toBe('');
  originalLang = document.documentElement.lang;
  host = document.createElement('div');
  host.innerHTML = OVERLAY;
  document.body.appendChild(host);
  localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
});

afterEach(() => {
  host.remove();
  document.documentElement.lang = originalLang;
  localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
});

/** Run the shipped script the way the browser would. */
function runPreboot(): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(SCRIPT)();
}

const text = (selector: string) => host.querySelector(selector)?.textContent;

function storePreference(value: unknown): void {
  localStorage.setItem(LANGUAGE_PREFERENCE_KEY, JSON.stringify(value));
}

describe('pre-boot language swap', () => {
  it('leaves the default language alone when nothing is stored', () => {
    document.documentElement.lang = 'zh-CN';
    runPreboot();

    // The markup already IS the default — the script must not touch it. This is
    // the case that makes the first paint correct with no script at all.
    expect(text('.loader-slogan')).toBe(zhCN.preboot.slogan);
    expect(text('#loading-label')).toBe(zhCN.preboot.loading);
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('swaps every overlay string and the lang when English is stored', () => {
    storePreference({ v: LANGUAGE_PREFERENCE_VERSION, locale: 'en-US' });
    runPreboot();

    expect(text('.loader-slogan')).toBe(enUS.preboot.slogan);
    expect(text('#loading-label')).toBe(enUS.preboot.loading);
    expect(text('.loader-error-title')).toBe(enUS.preboot.errorTitle);
    expect(text('#loading-retry-btn')).toBe(enUS.preboot.retry);
    expect(text('#loading-reload-btn')).toBe(enUS.preboot.reloadPage);
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('folds a bare `en` onto en-US, the way normalizeLocale does', () => {
    storePreference({ v: LANGUAGE_PREFERENCE_VERSION, locale: 'en' });
    runPreboot();
    expect(text('#loading-label')).toBe(enUS.preboot.loading);
  });

  it('keeps the default for junk, a wrong version, or an unknown locale', () => {
    // Every failure mode collapses to "start in the default", the same rule
    // `rv-i18n-preference.ts` follows. A hand-edited value must never be able to
    // leave the overlay in a language nobody asked for.
    for (const stored of [
      { v: 99, locale: 'en-US' },        // future version
      { v: LANGUAGE_PREFERENCE_VERSION, locale: 'fr-FR' },
      { v: LANGUAGE_PREFERENCE_VERSION, locale: 42 },
      { v: LANGUAGE_PREFERENCE_VERSION },
      'not json at all',
    ]) {
      host.innerHTML = OVERLAY;
      document.documentElement.lang = 'zh-CN';
      if (typeof stored === 'string') localStorage.setItem(LANGUAGE_PREFERENCE_KEY, stored);
      else storePreference(stored);

      runPreboot();

      expect(text('#loading-label'), JSON.stringify(stored)).toBe(zhCN.preboot.loading);
      expect(document.documentElement.lang, JSON.stringify(stored)).toBe('zh-CN');
    }
  });
});
