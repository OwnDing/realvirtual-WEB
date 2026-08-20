// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The `en-US` catalog split at runtime (ADR-0001 R1).
 *
 * `tests/bundle-splitting.test.ts` proves the bytes moved. This file proves the
 * behaviour the split promised in exchange:
 *
 *  - **No loading state.** `setLocale('en-US')` does not resolve until the
 *    deferred bundle is in, so nothing can render a frame of Chinese inside an
 *    English UI. That ordering is the whole reason R1 needed no Suspense.
 *  - **Startup namespaces never wait.** The shell is on screen from the first
 *    frame; if its English had been deferred too, the fix would have created the
 *    same flash the pre-boot work just removed.
 *
 * The failure path lives in `i18n-catalog-split-failure.test.ts` — it needs the
 * import to reject, which is a module-level mock and cannot share a file.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  resetEnglishCatalogForTests,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { getI18n } from '../src/core/i18n/rv-i18n';
import { writeStoredLocale } from '../src/core/i18n/rv-i18n-preference';

const DEFERRED = ['projects', 'settings', 'connect'] as const;

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await setLocale('zh-CN');
});

afterEach(async () => {
  await setLocale('zh-CN');
});

describe('deferred en-US namespaces', () => {
  it('are English by the time setLocale resolves — never a frame later', async () => {
    // Awaiting `setLocale` is all a caller does. If the bundle were loaded
    // after `changeLanguage` instead of before it, this would read Chinese.
    await setLocale('en-US');

    expect(rvT('settings', 'backup.resetAll')).toBe('Reset All Settings to Defaults');
    expect(rvT('connect', 'list.add')).toBe('Add Interface');
    expect(rvT('projects', 'nav.newProject')).toBe('New project');
    expect(getI18nDiagnostics().filter((d) => d.kind === 'fallback')).toEqual([]);
  });

  it('start out absent from the instance, so the split is real', async () => {
    // If this ever passes without the load, the namespaces are back in the
    // entry bundle and every other case here would still be green.
    resetEnglishCatalogForTests();
    const i18n = getI18n();
    for (const ns of DEFERRED) i18n.removeResourceBundle('en-US', ns);
    for (const ns of DEFERRED) {
      expect(i18n.hasResourceBundle('en-US', ns), ns).toBe(false);
    }

    await setLocale('en-US');
    for (const ns of DEFERRED) {
      expect(i18n.hasResourceBundle('en-US', ns), ns).toBe(true);
    }
  });

  it('leave the startup namespaces alone — those never wait for a chunk', async () => {
    resetEnglishCatalogForTests();
    const i18n = getI18n();
    // Without ever loading the deferred bundle, the shell is already English.
    i18n.changeLanguage('en-US');
    expect(rvT('shell', 'bar.followPart')).toBe('Follow selected part');
    expect(rvT('preboot', 'retry')).toBe('Retry');
    expect(rvT('common', 'cancel')).toBe('Cancel');
  });

  it('loads for a RETURNING English user, who never calls setLocale to change anything', async () => {
    // The regression that made the full browser suite flaky: `setLocale` used to
    // check "already this locale?" BEFORE ensuring the catalog, so a user whose
    // stored preference is already `en-US` — i.e. every returning English user —
    // got English startup namespaces and Chinese panels. Focused tests missed it
    // because they always switch languages; only the full suite, where storage
    // survives between files, ever reproduced it.
    const i18n = getI18n();
    resetEnglishCatalogForTests();
    for (const ns of DEFERRED) i18n.removeResourceBundle('en-US', ns);
    // BOTH halves of the no-op condition — the instance AND storage. Only when
    // they agree does `setLocale` take the early return, which is precisely the
    // state a returning English user boots into.
    await i18n.changeLanguage('en-US');
    writeStoredLocale('en-US');

    await setLocale('en-US'); // the no-op call
    for (const ns of DEFERRED) {
      expect(i18n.hasResourceBundle('en-US', ns), ns).toBe(true);
    }
    expect(rvT('settings', 'backup.resetAll')).toBe('Reset All Settings to Defaults');
  });

  it('switching back to Chinese needs no bundle at all', async () => {
    await setLocale('en-US');
    await setLocale('zh-CN');
    expect(rvT('settings', 'backup.resetAll')).toBe('将所有设置恢复为默认值');
  });
});
