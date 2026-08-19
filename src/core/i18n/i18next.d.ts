// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Strict key checking (ADR-0001 §4).
 *
 * Binding i18next's `CustomTypeOptions` to the SOURCE catalog makes `t('typo')`
 * a compile error rather than a string that renders as its own key at runtime.
 * `zh-CN` is the resource of record here for the same reason it is the fallback:
 * it is the catalog that is complete by construction, so typing against it can
 * never accept a key the fallback cannot serve.
 */

import type { zhCN } from './catalogs/zh-CN';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof zhCN;
    /** Values are read from the catalogs, never mutated, so a readonly literal is honest. */
    returnNull: false;
  }
}
