// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Catalog parity (ADR-0001 §3, §7 — the machine gates a translation must pass).
 *
 * The fallback chain is only a safety net if the source catalog cannot itself be
 * missing a key, so "same key set" is not a tidiness rule here — it is what makes
 * `fallbackLng: 'zh-CN'` mean something. Placeholder parity matters for the same
 * reason: a `{{name}}` dropped in translation renders a sentence with a hole in
 * it, which no type can catch and no reviewer reliably spots.
 */

import { describe, expect, it } from 'vitest';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';
import { RV_NAMESPACES } from '../src/core/i18n/rv-i18n';

type Catalog = Record<string, unknown>;

/** Flatten a namespace tree to `a.b.c` → value, which is how i18next addresses it. */
function flatten(node: Catalog, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Catalog, path));
    else out[path] = String(value);
  }
  return out;
}

const zh = flatten(zhCN as unknown as Catalog);
const en = flatten(enUS as unknown as Catalog);

/** `{{name}}` placeholders, as a sorted set. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe('i18n catalogs', () => {
  it('define the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('has no empty value in either locale', () => {
    // An empty string renders as a blank control — the exact failure
    // PS-I18N-001 §4 rules out.
    expect(Object.entries(zh).filter(([, v]) => v.trim() === '')).toEqual([]);
    expect(Object.entries(en).filter(([, v]) => v.trim() === '')).toEqual([]);
  });

  it('keeps the same interpolation placeholders per key', () => {
    const mismatched = Object.keys(zh)
      .filter((key) => JSON.stringify(placeholders(zh[key])) !== JSON.stringify(placeholders(en[key] ?? '')))
      .map((key) => ({ key, zh: placeholders(zh[key]), en: placeholders(en[key] ?? '') }));
    expect(mismatched).toEqual([]);
  });

  it('covers exactly the declared namespaces', () => {
    expect(Object.keys(zhCN).sort()).toEqual([...RV_NAMESPACES].sort());
    expect(Object.keys(enUS).sort()).toEqual([...RV_NAMESPACES].sort());
  });

  it('keeps CJK out of the English catalog', () => {
    // Catches the copy/paste that leaves a Chinese source string sitting in the
    // English target, which otherwise only shows up on a customer's screen.
    const leaked = Object.entries(en).filter(([, v]) => /[一-鿿]/.test(v));
    expect(leaked).toEqual([]);
  });

  it('is non-vacuous', () => {
    expect(Object.keys(zh).length).toBeGreaterThan(80);
  });
});
