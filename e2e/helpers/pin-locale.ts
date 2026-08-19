// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Pin the UI language for a spec (ADR-0001 Validation).
 *
 * A spec that asserts on text and does NOT pin the locale is asserting against
 * whatever the implementation currently defaults to. That passes today and turns
 * into a mystery failure the day the default moves — which it already did once,
 * when `zh-CN` became the product default and this suite's `Retry` button
 * started rendering as 重试.
 *
 * Call this BEFORE `page.goto`: the preference has to be in storage before the
 * bundle's synchronous `initI18n()` reads it.
 */

import type { Page } from 'playwright/test';

/** Must match `LANGUAGE_PREFERENCE_KEY` / `LANGUAGE_PREFERENCE_VERSION`. */
const LANGUAGE_PREFERENCE_KEY = 'rv-language';
const LANGUAGE_PREFERENCE_VERSION = 1;

export type E2ELocale = 'zh-CN' | 'en-US';

export async function pinLocale(page: Page, locale: E2ELocale): Promise<void> {
  await page.addInitScript(({ key, version, value }) => {
    localStorage.setItem(key, JSON.stringify({ v: version, locale: value }));
  }, { key: LANGUAGE_PREFERENCE_KEY, version: LANGUAGE_PREFERENCE_VERSION, value: locale });
}
