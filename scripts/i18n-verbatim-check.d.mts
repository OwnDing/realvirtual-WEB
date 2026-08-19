// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** The commit the golden-slice string extraction started from. */
export const MIGRATION_BASE_REF: string;

/** Sources the golden slice took its English from. */
export const MIGRATED_SOURCES: string[];

/** Keys the base ref cannot contain verbatim, each mapped to its reason. */
export const NEW_STRING_EXEMPTIONS: Map<string, string>;

export function readBaseSources(ref?: string, root?: string): string;
export function verbatimPattern(value: string): RegExp;
export function checkVerbatim(ref?: string, root?: string): {
  checked: number;
  missing: Array<{ key: string; value: string }>;
};
