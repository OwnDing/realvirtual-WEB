// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The things that keep the pre-boot path honest (ADR-0001 §3, §11).
 *
 * 1. **The first paint is already in the right language.** `index.html` ships
 *    the overlay in `zh-CN` — the product default — so the common case needs no
 *    script at all. An inline classic script swaps it to English for a user who
 *    chose English. Both copies of those five strings are duplicated from the
 *    catalog because nothing that early can import it, so both are checked here.
 *
 *    This used to be "ship English, let `main.ts` rewrite it". That does not
 *    satisfy §11: `/src/main.ts` is a MODULE, modules are deferred, and the
 *    overlay is on screen for the whole time the entry chunk is downloading.
 *    A Chinese-default product started in English and corrected itself later —
 *    which is precisely the flash the ADR names.
 *
 * 2. The English catalog must still be the upstream product's own wording. See
 *    scripts/i18n-verbatim-check.mjs for why that is worth a gate at all.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enUS } from '../src/core/i18n/catalogs/en-US';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { DEFAULT_LOCALE } from '../src/core/i18n/rv-locale';
import { LANGUAGE_PREFERENCE_VERSION } from '../src/core/i18n/rv-i18n-preference';
import { LANGUAGE_PREFERENCE_KEY } from '../src/core/hmi/rv-storage-keys';
// eslint-disable-next-line import/extensions
import { MIGRATION_BASE_REF, NEW_STRING_EXEMPTIONS, checkVerbatim } from '../scripts/i18n-verbatim-check.mjs';

const ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/** Text content of the first element carrying `id="…"` or `class="…"`. */
function markupText(selector: { id?: string; className?: string }): string | null {
  const attr = selector.id ? `id="${selector.id}"` : `class="${selector.className}"`;
  const match = html.match(new RegExp(`<[^>]*${attr}[^>]*>([^<]*)<`));
  return match ? match[1] : null;
}

/** The inline pre-boot script, isolated so its literals can be asserted. */
const inlineScript = (() => {
  const match = html.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/);
  return match ? match[0] : '';
})();

describe('pre-boot markup stays in step with the catalog', () => {
  it('ships the DEFAULT language, so the first paint needs no script', () => {
    // The whole point: with no JavaScript at all, a default user's very first
    // frame is already correct.
    expect(markupText({ className: 'loader-slogan' })).toBe(zhCN.preboot.slogan);
    expect(markupText({ className: 'loader-error-title' })).toBe(zhCN.preboot.errorTitle);
    expect(markupText({ id: 'loading-retry-btn' })).toBe(zhCN.preboot.retry);
    expect(markupText({ id: 'loading-reload-btn' })).toBe(zhCN.preboot.reloadPage);
    expect(markupText({ id: 'loading-label' })).toBe(zhCN.preboot.loading);
  });

  it('declares the default locale as the shell lang', () => {
    expect(html).toMatch(new RegExp(`<html\\s+lang="${DEFAULT_LOCALE}"`));
  });

  it('carries an inline CLASSIC script, after the markup it rewrites', () => {
    // Two properties, and only these two matter:
    //
    //  - CLASSIC, not `type="module"`. `defer` is implicit on a module, so a
    //    module cannot run until parsing is done — by then the overlay has been
    //    on screen for the whole download of a 3 MB entry chunk. (Source order
    //    against the module entry proves nothing: Vite hoists the built module
    //    tag into `<head>`, and it is still deferred there.)
    //  - AFTER the overlay, so the elements it rewrites already exist and the
    //    parser has not yielded to paint between the two.
    expect(inlineScript, 'inline pre-boot script not found').not.toBe('');
    expect(inlineScript.startsWith('<script>'), 'pre-boot script must be classic').toBe(true);
    expect(html.indexOf('id="loading-overlay"')).toBeLessThan(html.indexOf(inlineScript));
  });

  it('swaps to exactly the English the catalog holds', () => {
    for (const value of [
      enUS.preboot.slogan, enUS.preboot.loading, enUS.preboot.errorTitle,
      enUS.preboot.retry, enUS.preboot.reloadPage,
    ]) {
      expect(inlineScript, value).toContain(`'${value}'`);
    }
  });

  it('reads the same storage contract the runtime writes', () => {
    // The script cannot import the constants, so the duplication is checked
    // rather than trusted — the same deal `e2e/helpers/pin-locale.ts` gets.
    expect(inlineScript).toContain(`'${LANGUAGE_PREFERENCE_KEY}'`);
    expect(inlineScript).toContain(`rec.v !== ${LANGUAGE_PREFERENCE_VERSION}`);
  });
});

describe('English catalog was moved, not rewritten (ADR-0001 §3)', () => {
  it('traces every value back to the pre-migration source', () => {
    const { checked, missing } = checkVerbatim(MIGRATION_BASE_REF, ROOT);
    expect(missing, `not found verbatim in ${MIGRATION_BASE_REF}`).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });

  it('states a reason for every declared exemption', () => {
    for (const [key, reason] of NEW_STRING_EXEMPTIONS) {
      expect(String(reason).length, key).toBeGreaterThan(40);
    }
  });
});
