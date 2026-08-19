// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Locale resolution, the stored preference and the fallback chain
 * (ADR-0001 §3/§5, PS-I18N-001 §3/§4).
 *
 * Node rather than browser on purpose: none of this needs a DOM, and the
 * failure modes worth pinning — a hand-edited storage value, storage that
 * throws, a key missing in English but present in Chinese — are all easier to
 * construct honestly here than in a real browser.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, normalizeLocale } from '../src/core/i18n/rv-locale';
import {
  LANGUAGE_PREFERENCE_VERSION,
  readStoredLocale,
  resetPreferenceMemory,
  resolveStartupLocale,
  writeStoredLocale,
} from '../src/core/i18n/rv-i18n-preference';
import { LANGUAGE_PREFERENCE_KEY, ALL_RV_STORAGE_KEYS } from '../src/core/hmi/rv-storage-keys';
import { clearI18nDiagnostics, getI18nDiagnostics } from '../src/core/i18n/rv-i18n-diagnostics';
import { getI18n, getLocale, initI18n, onLocaleChange, setLocale, translate } from '../src/core/i18n/rv-i18n';

/** Minimal in-memory Storage. `throwOn` reproduces private-mode/quota refusals. */
function fakeStorage(throwOn?: 'get' | 'set'): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => {
      if (throwOn === 'get') throw new DOMException('denied', 'SecurityError');
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throwOn === 'set') throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
  } as Storage;
}

function useStorage(storage: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

describe('locale normalisation (PS-I18N-001 §3)', () => {
  it('folds Chinese tags onto zh-CN', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans', 'ZH_cn']) {
      expect(normalizeLocale(tag), tag).toBe('zh-CN');
    }
  });

  it('folds English tags onto en-US', () => {
    for (const tag of ['en', 'en-US', 'en-GB', 'EN_us']) expect(normalizeLocale(tag), tag).toBe('en-US');
  });

  it('falls back to the default for anything else', () => {
    // Unsupported language, junk, and non-strings all resolve rather than throw:
    // a bad tag must never be able to stop the viewer from rendering.
    for (const value of ['de-DE', 'fr', '', '   ', '???', null, undefined, 42, {}]) {
      expect(normalizeLocale(value), String(value)).toBe(DEFAULT_LOCALE);
    }
  });
});

describe('stored language preference (ADR-0001 §5)', () => {
  beforeEach(() => { resetPreferenceMemory(); useStorage(fakeStorage()); });
  afterEach(() => { useStorage(undefined); resetPreferenceMemory(); });

  it('is registered for "Reset all"', () => {
    expect(ALL_RV_STORAGE_KEYS as readonly string[]).toContain(LANGUAGE_PREFERENCE_KEY);
  });

  it('round-trips a choice', () => {
    writeStoredLocale('en-US');
    expect(readStoredLocale()).toBe('en-US');
    expect(resolveStartupLocale()).toBe('en-US');
  });

  it('starts in Chinese when nothing is stored', () => {
    expect(readStoredLocale()).toBeNull();
    expect(resolveStartupLocale()).toBe(DEFAULT_LOCALE);
  });

  it('ignores a record from another version', () => {
    globalThis.localStorage.setItem(
      LANGUAGE_PREFERENCE_KEY,
      JSON.stringify({ v: LANGUAGE_PREFERENCE_VERSION + 1, locale: 'en-US' }),
    );
    expect(readStoredLocale()).toBeNull();
    expect(resolveStartupLocale()).toBe(DEFAULT_LOCALE);
  });

  it('ignores malformed and unknown values without repairing them', () => {
    for (const raw of ['not json', '{}', '{"v":1}', '{"v":1,"locale":"de-DE"}', '[]']) {
      globalThis.localStorage.setItem(LANGUAGE_PREFERENCE_KEY, raw);
      expect(readStoredLocale(), raw).toBeNull();
      // A read must not write: a browser the user locked down stays untouched.
      expect(globalThis.localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe(raw);
    }
  });

  it('reports honestly when the write was refused', () => {
    // Quota or private mode: the choice drives THIS session (i18next already
    // switched) but nothing was persisted, and a readable-but-empty storage must
    // say so rather than have memory answer for it. Otherwise "Reset all" and a
    // refused write would both look like a stored preference.
    useStorage(fakeStorage('set'));
    writeStoredLocale('en-US');
    expect(readStoredLocale()).toBeNull();
    expect(resolveStartupLocale()).toBe(DEFAULT_LOCALE);
  });

  it('falls back to memory only when storage cannot be read at all', () => {
    useStorage(fakeStorage('get'));
    writeStoredLocale('en-US');
    expect(readStoredLocale()).toBe('en-US');   // memory carries the session
    resetPreferenceMemory();
    expect(resolveStartupLocale()).toBe(DEFAULT_LOCALE);
  });

  it('survives localStorage being absent entirely', () => {
    useStorage(undefined);
    expect(() => writeStoredLocale('en-US')).not.toThrow();
    expect(readStoredLocale()).toBe('en-US');
  });
});

describe('fallback chain and diagnostics (PS-I18N-001 §4)', () => {
  beforeEach(() => { useStorage(fakeStorage()); initI18n('zh-CN'); clearI18nDiagnostics(); });
  afterEach(() => { useStorage(undefined); resetPreferenceMemory(); });

  it('renders the source catalog by default', async () => {
    await setLocale('zh-CN');
    expect(translate('projects', 'error.readOnly')).toBe('本项目为只读。');
  });

  it('renders English after switching', async () => {
    await setLocale('en-US');
    expect(translate('projects', 'error.readOnly')).toBe('This project is read-only.');
  });

  it('interpolates without escaping the quotes around a document name', async () => {
    await setLocale('en-US');
    expect(translate('projects', 'status.imported', { name: 'Cell "A"', count: 3 }))
      .toBe('Imported "Cell "A"" (3 files).');
  });

  it('falls back to Chinese and leaves locatable evidence when English lacks a key', async () => {
    await setLocale('en-US');
    const i18n = getI18n();
    i18n.removeResourceBundle('en-US', 'viewer');
    i18n.addResourceBundle('en-US', 'viewer', {}, true, true);
    clearI18nDiagnostics();

    expect(translate('viewer', 'badgeError')).toBe('错误');
    expect(getI18nDiagnostics()).toContainEqual({ kind: 'fallback', key: 'viewer:badgeError', locale: 'en-US' });

    i18n.addResourceBundle('en-US', 'viewer', { badgeError: 'Error' }, true, true);
  });

  it('shows the stable key, never a blank, when the source catalog lacks it too', async () => {
    await setLocale('zh-CN');
    clearI18nDiagnostics();
    // Cast: the point of this case is a key the type system would reject.
    const value = translate('viewer', 'noSuchKey' as never);
    expect(value).toBe('viewer:noSuchKey');
    expect(getI18nDiagnostics().some((d) => d.kind === 'missing' && d.key.includes('noSuchKey'))).toBe(true);
  });

  it('notifies imperative subscribers so non-React surfaces can re-resolve', async () => {
    const seen: string[] = [];
    const off = onLocaleChange((locale) => seen.push(locale));
    await setLocale('en-US');
    await setLocale('zh-CN');
    off();
    await setLocale('en-US');
    expect(seen).toEqual(['en-US', 'zh-CN']);
    expect(getLocale()).toBe('en-US');
  });
});
