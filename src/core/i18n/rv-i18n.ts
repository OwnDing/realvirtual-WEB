// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The one i18next instance (ADR-0001 §1, §2, §10).
 *
 * ## Why this is initialised synchronously, from bundled resources
 *
 * `src/main.ts` writes the loading-overlay text before React exists, and
 * `index.html` ships that text in English markup. If the catalog arrived
 * asynchronously, a Chinese-default product would flash English on every cold
 * start. Static `resources` + `initImmediate: false` is what makes the first
 * paint already correct — which is also why ADR-0001 §2 bans an HTTP backend
 * and a browser language detector rather than treating them as optional.
 *
 * ## Why no Provider is required
 *
 * `initReactI18next` registers this instance as react-i18next's default, so
 * `useTranslation` resolves without an `I18nextProvider`. The main HMI mounts
 * through `@rv-private/custom/hmi-entry` — a file the public repository only has
 * a stub of — and the consent, password and login gates mount their own roots.
 * Language availability must not depend on every one of those entries
 * remembering to wrap a provider, because the day one of them forgets, the
 * failure is a half-translated screen nobody notices in review.
 */

import i18next, { type ParseKeys, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, type RVLocale } from './rv-locale';
import { readStoredLocale, resolveStartupLocale, writeStoredLocale } from './rv-i18n-preference';
import { reportI18nDiagnostic } from './rv-i18n-diagnostics';
import { enUS } from './catalogs/en-US';
import { zhCN } from './catalogs/zh-CN';

/**
 * `en-US` namespaces that are NOT in the entry chunk (ADR-0001 R1).
 *
 * English only: `zh-CN` stays whole and static so any failure — a chunk that
 * never arrives, an offline first visit — degrades to readable Chinese via the
 * fallback chain §3 already defines, rather than to raw keys.
 */
const DEFERRED_EN_NAMESPACES = ['projects', 'settings', 'connect', 'operator', 'authoring', 'assets', 'sim', 'demo', 'tools'] as const;

export const RV_NAMESPACES = ['common', 'projects', 'settings', 'shell', 'connect', 'operator', 'authoring', 'assets', 'sim', 'demo', 'tools', 'preboot', 'plugins', 'viewer'] as const;
export type RVNamespace = (typeof RV_NAMESPACES)[number];

/**
 * The keys one namespace defines (ADR-0001 §4).
 *
 * Namespace-scoped rather than one merged union, because merged keys are
 * ambiguous: `open` exists in `common` and `projects` alike, and a bare key
 * would silently resolve against `defaultNS`. Naming the namespace at the call
 * site is what makes `rvT('projects', 'error.readOnly')` both checkable and
 * readable.
 *
 * The `as never` casts below are the price: i18next's `t`/`exists` are overload
 * sets a wrapper cannot forward through generically. The strictness lives in the
 * public signature; the unchecked step is confined to these three lines.
 */
export type RVTranslationKey<N extends RVNamespace = RVNamespace> = ParseKeys<N>;

/** Subscribers that must re-resolve text imperatively (non-React surfaces, baked textures). */
const listeners = new Set<(locale: RVLocale) => void>();

let initialized = false;

/**
 * Keep `<html lang>` in step with the UI language.
 *
 * Not cosmetic: it is what screen readers pick pronunciation from and what the
 * browser hyphenates by, and `index.html` hardcodes `lang="en"`.
 */
function applyDocumentLanguage(locale: RVLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

/**
 * Create and initialise the instance. Idempotent: a second call is a no-op, so a
 * test importing a module that boots i18n cannot fight `main.ts` over it.
 */
export function initI18n(locale: RVLocale = resolveStartupLocale()): I18nInstance {
  if (initialized) return i18next;
  initialized = true;

  void i18next.use(initReactI18next).init({
    lng: locale,
    // The source catalog is the last resort, and it is complete by construction:
    // every key is authored in `zh-CN` first (ADR-0001 §3).
    fallbackLng: DEFAULT_LOCALE,
    ns: [...RV_NAMESPACES],
    defaultNS: 'common',
    resources: { 'zh-CN': zhCN, 'en-US': enUS },
    // Synchronous init — see the header. i18next defers to a microtask unless
    // this is off, and the first render would then miss the catalog. (v23
    // renamed the old `initImmediate` to `initAsync`; same switch, inverted.)
    initAsync: false,
    interpolation: {
      // React escapes for us; letting i18next escape again turns a quoted
      // document name into `&quot;` on screen.
      escapeValue: false,
    },
    // Belt and braces for any path that reaches i18next without going through
    // `probe()` below — the key itself is still better than a blank.
    parseMissingKeyHandler: (key) => key,
    saveMissing: true,
    missingKeyHandler: (languages, ns, key) => {
      reportI18nDiagnostic({
        kind: 'missing',
        key: `${ns}:${key}`,
        locale: (languages[0] as RVLocale) ?? DEFAULT_LOCALE,
      });
    },
    react: {
      // Nothing loads late, so suspending would only add a boundary that has to
      // exist in five separate roots for no benefit.
      useSuspense: false,
    },
  });

  applyDocumentLanguage(locale);
  // Start the deferred fetch as early as possible for a user who is ALREADY in
  // English — `main.ts` awaits the same promise a few lines later, so this only
  // moves the request earlier, never adds one.
  if (locale === 'en-US') void ensureEnglishCatalog();
  return i18next;
}

/**
 * Pull in the deferred `en-US` namespaces (ADR-0001 R1).
 *
 * Awaited BEFORE React mounts and before `changeLanguage`, which is what keeps
 * this free of any loading state: the only thing on screen while it resolves is
 * the pre-boot overlay, which was already waiting for the model.
 *
 * Idempotent and never rejects. A chunk that cannot be fetched leaves the
 * English namespaces absent, i18next falls back to `zh-CN`, and the diagnostic
 * is what makes "an English user is seeing Chinese" observable instead of
 * silent. Booting is not allowed to depend on it (§8).
 */
let englishCatalogPromise: Promise<void> | null = null;

export function ensureEnglishCatalog(): Promise<void> {
  englishCatalogPromise ??= import('./catalogs/en-US.deferred')
    .then(({ enUSDeferred }) => {
      const i18n = getI18n();
      for (const ns of DEFERRED_EN_NAMESPACES) {
        // `deep`/`overwrite` false: a namespace already present wins, so a second
        // call can never clobber live resources.
        i18n.addResourceBundle('en-US', ns, enUSDeferred[ns], false, false);
      }
    })
    .catch(() => {
      // Retryable: a later switch back to English should get another chance.
      englishCatalogPromise = null;
      reportI18nDiagnostic({ kind: 'fallback', key: 'en-US:<deferred-catalog>', locale: 'en-US' });
    });
  return englishCatalogPromise;
}

/** Test seam: forget that the deferred catalog was ever requested. */
export function resetEnglishCatalogForTests(): void {
  englishCatalogPromise = null;
}

/** The instance. Callers outside this module should prefer `rvT` / `useRvTranslation`. */
export function getI18n(): I18nInstance {
  if (!initialized) initI18n();
  return i18next;
}

export function getLocale(): RVLocale {
  return (i18next.resolvedLanguage as RVLocale) ?? DEFAULT_LOCALE;
}

/**
 * Switch language and persist the choice.
 *
 * Resolves synchronously in practice — the catalogs are already in memory — but
 * stays a promise because `changeLanguage` is one, and because the notification
 * has to happen after i18next has actually swapped.
 */
export async function setLocale(locale: RVLocale): Promise<void> {
  await changeLocale(locale, true);
}

/** Apply a resolved deployment/project/session locale without turning it into user state. */
export async function applyConfiguredLocale(locale: RVLocale): Promise<void> {
  await changeLocale(locale, false);
}

async function changeLocale(locale: RVLocale, persist: boolean): Promise<void> {
  getI18n();
  // BEFORE the no-op check, not after. A returning user's stored preference is
  // already `en-US`, so `initI18n` starts there and this call has nothing to
  // change — but the deferred catalog still has to be in. Putting the ensure
  // behind the early return left exactly those users with English startup
  // namespaces and Chinese panels (ADR-0001 R1).
  if (locale === 'en-US') await ensureEnglishCatalog();
  if (getLocale() === locale && (!persist || readStoredLocale() === locale)) return;
  await i18next.changeLanguage(locale);
  if (persist) writeStoredLocale(locale);
  applyDocumentLanguage(locale);
  for (const listener of listeners) listener(locale);
}

/**
 * Subscribe to language changes (ADR-0001 §9).
 *
 * This is the seam for everything React does not re-render on its own: labels a
 * plugin handed to a registry, and text already baked into a `CanvasTexture`,
 * which has to be redrawn rather than merely re-read.
 */
export function onLocaleChange(listener: (locale: RVLocale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Classify one lookup before it happens, and report it (PS-I18N-001 §4).
 *
 * Two things i18next will not tell us on its own:
 *   - it resolves `en-US` → `zh-CN` silently, which is right for the user and
 *     useless for whoever owns the catalog;
 *   - when nothing resolves it hands `parseMissingKeyHandler` the BARE key, and
 *     `noSuchKey` in a screenshot is far harder to trace than `viewer:noSuchKey`.
 *
 * Returning the qualified key here makes the missing case locatable and makes
 * the contract ours rather than a detail of i18next's resolver.
 *
 * `options` is forwarded because a plural key does not exist under its own name:
 * `settings:groups.objectCount` is stored as `…_one` / `…_other`, and only a
 * probe that sees the `count` resolves to the form `t()` will actually read.
 * Without it every pluralised string would report itself missing and render as
 * its own key — the failure mode this function exists to prevent.
 */
export function probeLookup(
  qualified: string,
  locale: RVLocale,
  options?: Record<string, unknown>,
): string | null {
  const i18n = getI18n();
  if (!i18n.exists(qualified as never, options as never)) {
    reportI18nDiagnostic({ kind: 'missing', key: qualified, locale });
    return qualified;
  }
  if (locale !== DEFAULT_LOCALE
    && !i18n.exists(qualified as never, { ...options, lng: locale, fallbackLng: false } as never)) {
    reportI18nDiagnostic({ kind: 'fallback', key: qualified, locale });
  }
  return null;
}

/**
 * Translate imperatively, with the same probe React's hook runs.
 */
export function translate<N extends RVNamespace>(
  namespace: N,
  key: RVTranslationKey<N>,
  options?: Record<string, unknown>,
): string {
  const i18n = getI18n();
  const locale = getLocale();
  const qualified = `${namespace}:${String(key)}`;
  const missing = probeLookup(qualified, locale, options);
  if (missing !== null) return missing;
  return i18n.t(qualified as never, options as never) as unknown as string;
}

/** Short alias for the imperative call sites (plugins, managers, canvas painters). */
export const rvT = translate;

/** Test seam: drop the instance so a fresh `initI18n` can run. */
export function resetI18nForTests(): void {
  initialized = false;
  listeners.clear();
  englishCatalogPromise = null;
}
