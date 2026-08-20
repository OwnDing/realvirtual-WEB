// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * What happens when the deferred `en-US` chunk never arrives (ADR-0001 R1).
 *
 * This is the case the whole asymmetry exists for. R1 refused to split `zh-CN`
 * as well — which would have saved twice the bytes — precisely so that a chunk
 * that cannot be fetched degrades to readable Chinese instead of putting
 * `settings:backup.resetAll` on an operator's screen.
 *
 * Three things have to hold, and all three are easy to lose:
 *   1. it does not throw — booting must not depend on English (§8);
 *   2. the UI is Chinese, not keys;
 *   3. it is OBSERVABLE. "An English user is silently seeing Chinese" is the
 *      failure mode that would otherwise never be reported by anyone.
 *
 * Own file because the rejection is a module-level mock.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module resolves but reading the catalog off it throws. That lands in the
// same `.catch()` a genuinely unfetchable chunk lands in, and unlike a factory
// that throws synchronously it does not break vitest's own mocker.
vi.mock('../src/core/i18n/catalogs/en-US.deferred', () => ({
  get enUSDeferred(): never { throw new Error('simulated chunk load failure'); },
}));

import {
  clearI18nDiagnostics,
  ensureEnglishCatalog,
  getI18nDiagnostics,
  initI18n,
  resetEnglishCatalogForTests,
  rvT,
  setLocale,
} from '../src/core/i18n';

beforeEach(async () => {
  initI18n();
  resetEnglishCatalogForTests();
  clearI18nDiagnostics();
  await setLocale('zh-CN');
});

describe('the deferred catalog cannot be fetched', () => {
  it('does not reject, so boot is never blocked on English', async () => {
    await expect(ensureEnglishCatalog()).resolves.toBeUndefined();
  });

  it('falls back to readable Chinese rather than to raw keys', async () => {
    await setLocale('en-US');

    const text = rvT('settings', 'backup.resetAll');
    expect(text).toBe('将所有设置恢复为默认值');
    // The point of the whole asymmetry, stated as an assertion.
    expect(text).not.toContain('settings:');
  });

  it('reports a diagnostic, so the degrade is observable', async () => {
    clearI18nDiagnostics();
    await ensureEnglishCatalog();

    const reported = getI18nDiagnostics();
    expect(reported.some((d) => d.key.includes('deferred-catalog'))).toBe(true);
  });

  it('stays retryable — a later switch back to English tries again', async () => {
    await ensureEnglishCatalog();
    clearI18nDiagnostics();
    // A cached rejected promise would make the first failure permanent for the
    // session, so a user who reconnects could never get English back.
    await ensureEnglishCatalog();
    expect(getI18nDiagnostics().some((d) => d.key.includes('deferred-catalog'))).toBe(true);
  });

  it('leaves the startup namespaces untouched', async () => {
    await setLocale('en-US');
    // The shell was never deferred, so a failed chunk must not affect it.
    expect(rvT('shell', 'bar.followPart')).toBe('Follow selected part');
  });
});
