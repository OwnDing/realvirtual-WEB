// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The stored language preference (ADR-0001 §5).
 *
 * This is user/browser state, never project state: it must not reach a manifest,
 * a document or a GLB. It lives in `localStorage` under the key registered in
 * `rv-storage-keys.ts`, so "Reset all" clears it like every other preference.
 *
 * Every failure mode collapses to the same answer — start in `zh-CN` and keep
 * running in memory:
 *   - storage throws (private mode, disabled cookies) → in-memory only
 *   - value absent, malformed, wrong version, unknown locale → default
 *
 * A read never repairs the stored value. Writing on read would turn a browser
 * the user had locked down into one we quietly wrote to.
 */

import { LANGUAGE_PREFERENCE_KEY } from '../hmi/rv-storage-keys';
import {
  readUserConfig,
  resetUserConfigMemoryForTests,
  writeUserConfigPatch,
} from '../config/user-config-store';
import { DEFAULT_LOCALE, normalizeLocale, type RVLocale } from './rv-locale';

/** Bump when the stored shape changes; an older or newer record reads as "no preference". */
export const LANGUAGE_PREFERENCE_VERSION = 1;

interface StoredPreference {
  v: number;
  locale: string;
}

/** In-memory fallback so a locked-down browser still switches language for the session. */
let memoryLocale: RVLocale | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // SecurityError — the property access itself can throw.
  }
}

/**
 * The stored preference, or `null` when there is none this code is willing to trust.
 *
 * When storage is READABLE it is the only truth, including when it is empty:
 * "Reset all" clears the key, and an in-memory value answering afterwards would
 * make the reset a no-op until the tab is closed. Memory is the fallback for a
 * browser that refuses storage, not a second cache in front of it.
 */
export function readStoredLocale(): RVLocale | null {
  const unified = readUserConfig(null).locale;
  if (unified === 'zh-CN' || unified === 'en-US') return unified;
  const store = storage();
  if (!store) return memoryLocale;
  let raw: string | null;
  try {
    raw = store.getItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    return memoryLocale;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPreference;
    if (!parsed || parsed.v !== LANGUAGE_PREFERENCE_VERSION) return null;
    // normalizeLocale would fold junk onto the default and hide the corruption;
    // an unreadable record must read as "no preference" so the default applies
    // for the documented reason rather than by accident.
    const locale = parsed.locale;
    return locale === 'zh-CN' || locale === 'en-US' ? locale : null;
  } catch {
    return null;
  }
}

/** Persist the user's choice. Falls back to memory when storage refuses. */
export function writeStoredLocale(locale: RVLocale): void {
  memoryLocale = locale;
  writeUserConfigPatch(null, { locale });
  const store = storage();
  if (!store) return;
  try {
    store.setItem(LANGUAGE_PREFERENCE_KEY, JSON.stringify({ v: LANGUAGE_PREFERENCE_VERSION, locale }));
  } catch {
    // Quota or private mode — the in-memory value above still drives this session.
  }
}

/**
 * The locale to start in: stored preference first, then `zh-CN`.
 *
 * Deliberately NOT `navigator.language`. ADR-0001 §2 bans the browser language
 * detector, and PS-I18N-001 §4 wants a new user to see Chinese — guessing from
 * the browser would make the documented default depend on the machine.
 */
export function resolveStartupLocale(): RVLocale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

/** Test seam for the in-memory path. */
export function resetPreferenceMemory(): void {
  memoryLocale = null;
  resetUserConfigMemoryForTests();
}

export { normalizeLocale };
