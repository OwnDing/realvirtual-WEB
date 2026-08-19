// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The two things that keep the pre-boot path honest (ADR-0001 §3, §11).
 *
 * 1. `index.html` ships the loading overlay's text as markup, because a shell
 *    with empty text looks broken while the module loads. `src/main.ts` rewrites
 *    it from the catalog on the first synchronous tick. Two copies of the same
 *    five strings will drift the moment somebody edits the HTML, and the symptom
 *    — a flash of stale English — is invisible in review and in CI screenshots.
 *
 * 2. The English catalog must still be the upstream product's own wording. See
 *    scripts/i18n-verbatim-check.mjs for why that is worth a gate at all.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enUS } from '../src/core/i18n/catalogs/en-US';
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

describe('pre-boot markup stays in step with the catalog', () => {
  it('ships the English source strings the catalog holds', () => {
    expect(markupText({ className: 'loader-slogan' })).toBe(enUS.preboot.slogan);
    expect(markupText({ className: 'loader-error-title' })).toBe(enUS.preboot.errorTitle);
    expect(markupText({ id: 'loading-retry-btn' })).toBe(enUS.preboot.retry);
    expect(markupText({ id: 'loading-reload-btn' })).toBe(enUS.preboot.reloadPage);
    expect(markupText({ id: 'loading-label' })).toBe(enUS.preboot.loading);
  });

  it('still declares a lang attribute for main.ts to correct', () => {
    // `initI18n` overwrites this from the resolved locale; the attribute has to
    // exist in the shell for the pre-JS state to be valid HTML at all.
    expect(html).toMatch(/<html\s+lang="[a-zA-Z-]+"/);
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
