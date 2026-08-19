// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The language control (PS-I18N-001 §4.2).
 *
 * Switching is immediate and in place: no reload, no re-import, no re-created
 * project. That is a product requirement rather than a nicety — the whole point
 * of the static, synchronously bundled catalogs is that changing language is a
 * render, not a page load.
 *
 * The choice is persisted by `setLocale`, so it survives a refresh, and it is
 * stored under the registered preference key so "Reset all" clears it.
 */

import { MenuItem, Select, Typography } from '@mui/material';
import { SUPPORTED_LOCALES, useRvTranslation, type RVLocale } from '../../i18n';

/** Endonyms: a language is listed the way its own speakers write it. */
const LOCALE_LABELS: Record<RVLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
};

export function LanguageSection() {
  const { locale, setLocale } = useRvTranslation('common');
  return (
    <Select
      size="small"
      value={locale}
      onChange={(e) => { void setLocale(e.target.value as RVLocale); }}
      inputProps={{ 'aria-label': 'Language / 语言' }}
      data-testid="rv-language-select"
      sx={{ fontSize: 12, minWidth: 140 }}
    >
      {SUPPORTED_LOCALES.map((value) => (
        <MenuItem key={value} value={value} sx={{ fontSize: 12 }}>
          <Typography component="span" sx={{ fontSize: 12 }}>{LOCALE_LABELS[value]}</Typography>
        </MenuItem>
      ))}
    </Select>
  );
}
