// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the realvirtual CONNECT flow (EP-I18N-001 batch 4).
 *
 * This surface has one rule the other batches did not, and it is the reason
 * these cases exist: **industrial identifiers are not copy.** `Siemens S7`,
 * `Modbus TCP`, `AMS NetId`, `DiscardOldest` and `Micro800` are the words a
 * vendor manual uses, and an engineer matching this form against that manual
 * needs the same token on both sides (PS-I18N-001 §2, ADR-0001 §6 — confirmed
 * by the product owner on 2026-08-20).
 *
 * That rule is invisible in a diff and easy to "fix" a year from now, so it is
 * pinned three ways here: the names stay identical across languages, the field
 * that holds them is not called `label`, and the sentences AROUND them do move.
 *
 * The other thing worth a test is the type registry's split source: our static
 * entries carry a catalog key, a connected gateway's entries carry its own
 * prose. Only one of the two is ours to translate.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { CONNECT_INTERFACE_TYPES } from '../src/core/hmi/connect-store';
import { ConnectOpener } from '../src/core/hmi/ConnectPanel';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUS } from '../src/core/i18n/catalogs/en-US';

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('industrial identifiers', () => {
  it('are identical in both languages', async () => {
    // A sweep over the whole `spec` group rather than a sample: the failure this
    // guards against is somebody translating ONE of them, and the one they pick
    // is exactly the one nobody wrote a case for.
    const en = flatten((enUS.connect as Record<string, unknown>).spec as Record<string, unknown>);
    const zh = flatten((zhCN.connect as Record<string, unknown>).spec as Record<string, unknown>);
    expect(Object.keys(en).length).toBeGreaterThan(15);
    expect(zh).toEqual(en);
  });

  it('are not stored in a field called `label`', () => {
    // `productName` is the whole point: a field called `label` reads like copy
    // somebody forgot, and the next person "fixes" it.
    for (const def of CONNECT_INTERFACE_TYPES) {
      expect(def.productName, def.type).toBeTruthy();
      expect(def).not.toHaveProperty('label');
    }
  });

  it('keep their names while their descriptions move', async () => {
    const s7 = CONNECT_INTERFACE_TYPES.find((d) => d.type === 'S7');
    expect(s7?.productName).toBe('Siemens S7');
    expect(s7?.descriptionKey).toBe('type.s7');

    // The description is ours, so it moves.
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('connect', s7!.descriptionKey!)).toContain('S7comm');
    await act(async () => { await setLocale('zh-CN'); });
    expect(rvT('connect', s7!.descriptionKey!)).toContain('S7comm');
    expect(rvT('connect', s7!.descriptionKey!)).not.toContain('and PLCSIM Advanced');
  });

  it('carry a key on our entries and raw prose on the gateway\'s', () => {
    // Exactly one of the two is set. A gateway-supplied catalog is the server's
    // text, and translating it would be inventing wording for a system we do
    // not ship.
    for (const def of CONNECT_INTERFACE_TYPES) {
      expect(def.descriptionKey, def.type).toBeTruthy();
      expect(def.description, def.type).toBeUndefined();
    }
  });
});

describe('the CONNECT opener', () => {
  it('renders Chinese by default and English after a switch', async () => {
    render(<ConnectOpener failedUrl={null} />);
    expect(screen.getByText('在本查看器中获取实时 PLC 数据')).toBeTruthy();

    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByText('Live PLC data in this viewer')).toBeTruthy();
  });

  it('keeps the protocol list English inside the translated sentence', async () => {
    // The capability line names ten protocols. Translating the connective words
    // while leaving the names alone is the rule this batch runs on, and this is
    // the one place it is visible in rendered output.
    render(<ConnectOpener failedUrl={null} />);
    const zh = screen.getByText(/TwinCAT ADS/);
    expect(zh.textContent).toContain('OPC UA');
    expect(zh.textContent).toContain('EtherNet/IP');
    expect(zh.textContent).toContain('FANUC');
    // …and the words between them are Chinese.
    expect(zh.textContent).toContain('机器人接口');
  });
});

describe('the connect catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.connect as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(300);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('connect', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('connect:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
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
