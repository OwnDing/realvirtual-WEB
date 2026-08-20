// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The React binding (ADR-0001 §1, §10).
 *
 * A thin wrapper over `useTranslation` rather than a replacement for it: the
 * subscription, the re-render on `languageChanged` and the instance are all
 * react-i18next's. What the wrapper adds is the same fallback probe the
 * imperative `rvT` runs, so a missing English key produces evidence whether the
 * caller was a component or a plugin — with raw `useTranslation` the React half
 * of the UI would fall back silently and the catalog would look complete.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, type RVLocale } from './rv-locale';
import { getI18n, probeLookup, setLocale, type RVNamespace, type RVTranslationKey } from './rv-i18n';


export interface RvTranslation<N extends RVNamespace> {
  /** Translate a key of this namespace. An unknown key does not compile. */
  t: (key: RVTranslationKey<N>, options?: Record<string, unknown>) => string;
  /** The active language. */
  locale: RVLocale;
  /** Switch language and persist the choice. */
  setLocale: (locale: RVLocale) => Promise<void>;
}

export function useRvTranslation<N extends RVNamespace>(namespace: N): RvTranslation<N> {
  // Idempotent, and the same guard `rvT` already runs. `main.ts` initialises
  // before React mounts, so in the product this is a no-op — but a component
  // test that renders a migrated panel without booting the app would otherwise
  // get react-i18next's uninitialised `t`, which returns every key as its own
  // text. That failure reads like a missing translation and is not one.
  getI18n();
  const { t, i18n } = useTranslation(namespace);
  const locale = (i18n.resolvedLanguage as RVLocale) ?? DEFAULT_LOCALE;

  // Memoised, and that is not a micro-optimisation: this `t` ends up in the
  // dependency array of the callbacks and memos that build labels. A fresh
  // identity every render would make each of them recompute on every render,
  // which is exactly the kind of regression a translation pass gets blamed for.
  // react-i18next's own `t` is stable per language, so `[t, locale, namespace]`
  // changes precisely when the text can change.
  return useMemo(() => ({
    t: (key: RVTranslationKey<N>, options?: Record<string, unknown>): string => {
      // See rv-i18n.ts: the strictness is in the signature, the cast is the bridge.
      const missing = probeLookup(`${namespace}:${String(key)}`, locale, options);
      if (missing !== null) return missing;
      return t(key as never, options as never) as unknown as string;
    },
    locale,
    setLocale,
  }), [t, locale, namespace]);
}
