// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The testable diagnostics sink the fallback chain reports into (ADR-0001 §3).
 *
 * PS-I18N-001 §4 asks for two distinguishable outcomes, and a user-visible blank
 * is not one of them:
 *
 *   - `fallback` — the active language lacks the key, `zh-CN` supplied it. The UI
 *                  stays correct; the catalog owes a translation.
 *   - `missing`  — the source catalog lacks it too. The stable key is shown, which
 *                  is ugly on purpose: it is locatable in a screenshot.
 *
 * A bounded buffer, because this is evidence for a test and a support report, not
 * telemetry — an unbounded array behind a render loop is a memory leak.
 */

import type { RVLocale } from './rv-locale';

export interface I18nDiagnostic {
  kind: 'fallback' | 'missing';
  /** Fully qualified `namespace:key`, which is what a bug report can be searched for. */
  key: string;
  /** The language that was active when the lookup happened. */
  locale: RVLocale;
}

const MAX_DIAGNOSTICS = 200;

const entries: I18nDiagnostic[] = [];
const seen = new Set<string>();

/**
 * Record one lookup problem. Deduplicated by kind+key+locale: a missing label in a
 * list of 500 rows is one catalog defect, not 500, and 500 copies would push the
 * rest of the evidence out of the buffer.
 */
export function reportI18nDiagnostic(diagnostic: I18nDiagnostic): void {
  const id = `${diagnostic.kind}|${diagnostic.key}|${diagnostic.locale}`;
  if (seen.has(id)) return;
  seen.add(id);
  entries.push(diagnostic);
  if (entries.length > MAX_DIAGNOSTICS) entries.shift();
}

/** Snapshot for tests, the debug endpoint and support reports. */
export function getI18nDiagnostics(): readonly I18nDiagnostic[] {
  return entries.slice();
}

/** Test seam — production code never calls this. */
export function clearI18nDiagnostics(): void {
  entries.length = 0;
  seen.clear();
}
