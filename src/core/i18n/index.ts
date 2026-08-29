// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Public surface of the i18n core. Nothing outside this folder imports i18next directly. */

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, normalizeLocale, type RVLocale } from './rv-locale';
export {
  LANGUAGE_PREFERENCE_VERSION,
  readStoredLocale,
  resolveStartupLocale,
  writeStoredLocale,
  resetPreferenceMemory,
} from './rv-i18n-preference';
export {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  reportI18nDiagnostic,
  type I18nDiagnostic,
} from './rv-i18n-diagnostics';
export {
  RV_NAMESPACES,
  applyConfiguredLocale,
  ensureEnglishCatalog,
  resetEnglishCatalogForTests,
  getI18n,
  getLocale,
  initI18n,
  onLocaleChange,
  resetI18nForTests,
  rvT,
  setLocale,
  translate,
  type RVNamespace,
  type RVTranslationKey,
} from './rv-i18n';
export { useRvTranslation, type RvTranslation } from './use-rv-translation';
export { enUS } from './catalogs/en-US';
export { zhCN } from './catalogs/zh-CN';
