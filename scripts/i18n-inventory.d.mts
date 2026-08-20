// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** One hardcoded user-visible string, located and classified. */
export interface I18nFinding {
  file: string;
  line: number;
  category: string;
  text: string;
  /** `intl-format` only: whether the call site passes a locale of its own (ADR-0001 §6). */
  localeExplicit?: boolean;
}

/** A reviewed false positive or deliberate non-translatable. */
export interface I18nException {
  file: string;
  match: string;
  reason: string;
  category?: string;
}

/** The committed shape of tests/i18n-inventory-baseline.json (gated categories only). */
export interface I18nBaseline {
  schemaVersion: number;
  generator: string;
  command: string;
  note: string;
  totals: Record<string, number>;
  total: number;
  fileCount: number;
  files: Record<string, Record<string, number>>;
}

/** Counts that are reported for triage but never gated. */
export interface I18nAdvisory {
  'error-message': number;
  'intl-format': number;
  intlWithoutExplicitLocale: number;
}

export const SCHEMA_VERSION: number;
export const GATED_CATEGORIES: readonly string[];
export const ADVISORY_CATEGORIES: readonly string[];
export const CATEGORIES: readonly string[];

export function hasProse(raw: unknown): boolean;
export function scanSource(repoPath: string, source: string): I18nFinding[];
export function scanHtml(repoPath: string, source: string): I18nFinding[];
export function loadExceptions(root?: string): I18nException[];
export function matchesException(finding: I18nFinding, exception: I18nException): boolean;
export function computeInventory(root?: string): {
  findings: I18nFinding[];
  /** Files the walk opened — not files with findings. See the script for why. */
  filesScanned: number;
  advisory: I18nAdvisory;
  baseline: I18nBaseline;
  unusedExceptions: I18nException[];
};
