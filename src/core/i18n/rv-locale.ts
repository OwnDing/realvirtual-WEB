// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Locale identity and normalisation (ADR-0001 §3, PS-I18N-001 §3).
 *
 * Kept free of i18next, storage and React on purpose: the pre-boot path in
 * `src/main.ts` resolves a locale before anything else exists, and the node
 * tests need to exercise normalisation without a DOM.
 */

/** The locales this product ships. `zh-CN` is the source catalog and the final fallback. */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;

export type RVLocale = (typeof SUPPORTED_LOCALES)[number];

/** Default and final fallback. A new user with no stored preference starts here. */
export const DEFAULT_LOCALE: RVLocale = 'zh-CN';

export function isSupportedLocale(value: unknown): value is RVLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Fold any BCP-47-ish tag onto a supported locale.
 *
 * `zh`, `zh-Hans`, `zh-TW` → `zh-CN`; `en`, `en-GB` → `en-US`; anything else,
 * including junk from a hand-edited localStorage value, → `zh-CN`. Returning the
 * default rather than throwing is deliberate: a bad tag must never be able to
 * stop the viewer from rendering.
 */
export function normalizeLocale(value: unknown): RVLocale {
  if (typeof value !== 'string') return DEFAULT_LOCALE;
  const tag = value.trim().toLowerCase().replace(/_/g, '-');
  if (!tag) return DEFAULT_LOCALE;
  const primary = tag.split('-')[0];
  if (primary === 'zh') return 'zh-CN';
  if (primary === 'en') return 'en-US';
  return DEFAULT_LOCALE;
}
