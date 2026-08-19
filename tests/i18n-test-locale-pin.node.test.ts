// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The test-locale pinning policy (ADR-0001 Validation).
 *
 * A spec that asserts on user-visible TEXT and does not pin a locale is really
 * asserting "whatever the implementation defaults to today". That already bit
 * this repository once: the product default became `zh-CN`, the pre-boot Retry
 * button started rendering as 重试, and `connect-embed-e2e.spec.ts` would have
 * failed for a reason that has nothing to do with what it tests.
 *
 * Scoped to `e2e/` deliberately. Browser tests drive the runtime directly and
 * call `setLocale` in their own setup; an end-to-end spec loads the real app,
 * where the only way in is the stored preference.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const E2E = join(ROOT, 'e2e');

/** A locator that resolves by human-readable text rather than by test id or role alone. */
const TEXT_LOCATOR = /getBy(Text|Label|LabelText|Placeholder|AltText)\(|getByRole\([^)]*\bname\s*:/;

function specFiles(): string[] {
  return readdirSync(E2E)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

describe('e2e specs that assert on text pin their locale', () => {
  const offenders = specFiles()
    .map((name) => ({ name, source: readFileSync(join(E2E, name), 'utf8') }))
    .filter(({ source }) => TEXT_LOCATOR.test(source))
    .filter(({ source }) => !source.includes('pinLocale('))
    .map(({ name }) => name);

  it('has no spec asserting on text without a pinned locale', () => {
    expect(offenders, 'add `await pinLocale(page, …)` before page.goto in these specs').toEqual([]);
  });

  it('is non-vacuous — at least one spec really does assert on text', () => {
    const withText = specFiles().filter((name) => TEXT_LOCATOR.test(readFileSync(join(E2E, name), 'utf8')));
    expect(withText.length).toBeGreaterThan(0);
  });

  it('keeps the helper in step with the storage contract', async () => {
    // The helper cannot import the app's constants (it runs in Playwright's
    // context), so the duplication is checked instead of trusted.
    const helper = readFileSync(join(E2E, 'helpers', 'pin-locale.ts'), 'utf8');
    const { LANGUAGE_PREFERENCE_KEY } = await import('../src/core/hmi/rv-storage-keys');
    const { LANGUAGE_PREFERENCE_VERSION } = await import('../src/core/i18n/rv-i18n-preference');
    expect(helper).toContain(`'${LANGUAGE_PREFERENCE_KEY}'`);
    expect(helper).toContain(`LANGUAGE_PREFERENCE_VERSION = ${LANGUAGE_PREFERENCE_VERSION}`);
  });
});
