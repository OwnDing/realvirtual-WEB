// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the authoring & inspector workspace (EP-I18N-001 batch 6).
 *
 * The engineer's half of the product: hierarchy, property inspector, signal
 * authoring, scene documents, script editor. Three things are specific to it,
 * and each is a place a translation silently freezes:
 *
 *  - **`signal-vocabulary.ts` is a module-level table.** It exists so the same
 *    fact is worded identically on four surfaces, which means a single frozen
 *    string there is wrong in four places at once. Its exports had to become
 *    getters — a `const` is read at import, and this module is imported
 *    transitively by the badge renderer, usually BEFORE `initI18n()`.
 *  - **Two registries hand labels to code that renders them later.** The type
 *    filter chips resolve a `labelKey` at render; the document verb menu is
 *    rebuilt on every publish and now re-publishes on a language change. Both
 *    would look correct on first paint and never move again.
 *  - **Identifiers keep appearing inside sentences.** `PLC`, `CONNECT`, `DES`,
 *    `IK`, `WebComponent`, `ApiVersion`, `setup(self)` and the module keywords
 *    are what the manual and the compiler say; the prose around them is not.
 *
 * Every case pins its locale — inheriting the default passes for the wrong
 * reason exactly once, and then hides a regression.
 */

import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import {
  AUTHORITY_CONSEQUENCE,
  AUTHORITY_SENTENCE,
  BINDING_STATE_LABEL,
  authorityExplanation,
  notLinkedCell,
  notLinkedLabel,
  provenanceReferencedTitle,
} from '../src/core/hmi/signal-vocabulary';
import { resolveSlotStatusToken } from '../src/core/hmi/rv-signal-slot-row';
import { validateScriptForSave } from '../src/core/hmi/script/rv-script-save-pipeline';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('the shared signal vocabulary', () => {
  it('follows a language switch instead of freezing at import', async () => {
    // The whole reason these are getters. A `const` here reads once, and this
    // module is loaded long before a language preference is known.
    expect(BINDING_STATE_LABEL.conflict).toBe('冲突');
    expect(AUTHORITY_SENTENCE.forced).toMatch(/[一-鿿]/);

    await act(async () => { await setLocale('en-US'); });
    expect(BINDING_STATE_LABEL.conflict).toBe('Conflict');
    expect(AUTHORITY_SENTENCE.forced).toBe('An operator force pins this slot');
  });

  it('keeps the one-lexeme invariant the module exists for', () => {
    // `BINDING_STATE_LABEL.unbound` and the standalone label are the SAME words
    // by construction; the cell is the same words in a lower register. Two
    // getters that drifted apart would restore exactly the duplication this
    // module was written to remove.
    expect(BINDING_STATE_LABEL.unbound).toBe(notLinkedLabel());
    expect(notLinkedCell()).toContain(notLinkedLabel());
  });

  it('composes the long form from both halves in one language', async () => {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      const text = authorityExplanation('forced');
      expect(text, locale).toContain(AUTHORITY_SENTENCE.forced);
      expect(text, locale).toContain(AUTHORITY_CONSEQUENCE.forced);
    }
  });
});

describe('slot status tokens', () => {
  const row = (over: Record<string, unknown>) => ({
    componentPath: 'Cell/Drive', kind: 'signal', slot: 'Start',
    ...over,
  } as never);

  it('splice the shared sentence into a translated one', async () => {
    // `live · hold` is built as "<AUTHORITY_SENTENCE.bound> — the current value
    // is held". If only one half moved, this is where a half-Chinese tooltip
    // would show up, and nothing else in the suite renders it.
    const zh = resolveSlotStatusToken(row({ liveness: 'hold' }), true);
    expect(zh?.tooltip).toContain(AUTHORITY_SENTENCE.bound);
    expect(zh?.tooltip).toMatch(/[一-鿿]/);
    expect(zh?.label).toBe('实时 · 保持');

    await act(async () => { await setLocale('en-US'); });
    const en = resolveSlotStatusToken(row({ liveness: 'hold' }), true);
    expect(en?.label).toBe('live · hold');
    expect(en?.tooltip).toContain('the current value is held');
  });

  it('name CONNECT without translating it', async () => {
    const zh = resolveSlotStatusToken(row({ liveness: 'pending' }), true);
    expect(zh?.tooltip).toContain('CONNECT');
    expect(zh?.tooltip).toMatch(/[一-鿿]/);
  });
});

describe('script diagnostics', () => {
  it('translate the sentence and keep the keywords', async () => {
    // `import`/`export`/`setup(self)` are what the user must type. A diagnostic
    // that translated them would be actively wrong, not merely awkward.
    const zh = validateScriptForSave('export function setup(self) {}');
    const moduleMsg = zh.diagnostics.find((d) => d.rule === 'module-syntax')?.message ?? '';
    expect(moduleMsg).toContain('import/export/exports');
    expect(moduleMsg).toContain('setup(self)');
    expect(moduleMsg).toMatch(/[一-鿿]/);

    await act(async () => { await setLocale('en-US'); });
    const en = validateScriptForSave('export function setup(self) {}');
    expect(en.diagnostics.find((d) => d.rule === 'module-syntax')?.message)
      .toContain('Module syntax (import/export/exports) is not allowed');
  });

  it('keep ApiVersion as the field name it is', async () => {
    const zh = validateScriptForSave('function setup(self) {}', { apiVersion: 99 });
    const msg = zh.diagnostics.find((d) => d.rule === 'api-version')?.message ?? '';
    expect(msg).toContain('ApiVersion');
    expect(msg).toContain('99');
    expect(msg).toMatch(/[一-鿿]/);
  });
});

describe('the authoring catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.authoring as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(230);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('authoring', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('authoring:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });

  it('keeps the inspector reachable in English through the deferred chunk', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('authoring', 'inspector.runtimeStatus')).toBe('Runtime Status');
    expect(provenanceReferencedTitle()).toBe('Referenced by');
  });
});

function flatten(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}
