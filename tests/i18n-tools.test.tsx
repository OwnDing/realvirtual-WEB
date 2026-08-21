// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the AI agent manager and the layout planner
 * (EP-I18N-001 batch 10).
 *
 * Two engineer-facing tool surfaces, and three things specific to them:
 *
 *  - **A THIRD German leftover.** The planner's pending-load message and its
 *    thumbnail error shipped German in an otherwise English product. As with
 *    `NewsDialog` in batch 3, there is no English original to move, so the
 *    English here is newly written — and the point of the case below is that
 *    the German is gone from BOTH catalogs, not merely translated in one.
 *  - **Two registries hand text to code that runs later.** `TOOL_LABEL_KEYS`
 *    names the agent's server tools; the planner's quick-action `tooltip` is
 *    registered in a plugin constructor. The tooltip contract was WIDENED to
 *    `string | ((ctx) => string)` rather than replaced (ADR-0001 §9).
 *  - **Agent field values are wire values, not copy.** `read-only`, `manual`,
 *    `report`, `chat` and the agent `name` slug travel to CONNECT; the labels
 *    beside them are prose.
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
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUSFull as enUS } from './helpers/en-catalog';
import { analyzeGPU } from '../src/core/engine/rv-gpu-info';
import { lintDesSafety } from '../src/core/sdk/rv-des-lint';

/** Words that would still be on screen if the German had merely been copied. */
const GERMAN = /Assets werden|konnte nicht|Wiederholen|Entfernen|Lade /;

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('the German leftover in the planner', () => {
  it('is gone from BOTH catalogs, not translated in one', () => {
    // Translating zh-CN and leaving the English column German would look fixed
    // in the only language anyone checked, and ship German to English users.
    for (const [name, cat] of [['zh-CN', zhCN], ['en-US', enUS]] as const) {
      const flat = flatten((cat as never as Record<string, unknown>).tools as Record<string, unknown>);
      const leaked = Object.entries(flat).filter(([, v]) => GERMAN.test(v));
      expect(leaked, name).toEqual([]);
    }
  });

  it('reads as real English, not as a placeholder', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('tools', 'planner.loadingAssets')).toBe('Loading assets');
    expect(rvT('tools', 'planner.retry')).toBe('Retry');
    expect(rvT('tools', 'planner.previewFailed')).toContain('GLB');
  });
});

describe('agent wire values', () => {
  it('stay out of the catalog — the labels beside them do not', () => {
    // `read-only`, `manual`, `report`, `chat` are sent to CONNECT and stored in
    // the agent definition. A locale-dependent value would write a definition
    // the server cannot parse.
    const flat = flatten(zhCN.tools as unknown as Record<string, unknown>);
    for (const wire of ['read-only', 'manual']) {
      expect(Object.values(flat), wire).not.toContain(wire);
    }
    expect(rvT('tools', 'agent.permissionTier')).toMatch(/[一-鿿]/);
    expect(rvT('tools', 'agent.trigger')).toMatch(/[一-鿿]/);
  });

  it('keeps CONNECT and the phase markers as the terms they are', () => {
    expect(rvT('tools', 'agent.deleteBody', { name: 'x' })).toContain('CONNECT');
    expect(rvT('tools', 'agent.permissionHelp')).toContain('Phase 3');
    expect(rvT('tools', 'agent.waitingApproval')).toContain('Phase 5');
    expect(rvT('tools', 'agent.waitingApproval')).toMatch(/[一-鿿]/);
  });
});

describe('the planner quick-action tooltip contract', () => {
  it('was widened, not replaced — a plugin may still pass a plain string', async () => {
    // The CONTRACT itself is guarded by the type-check gate, not by this case:
    // narrowing `tooltip` back to `string` is a compile error in three places
    // (`rv-component-section.tsx` and the planner's three mirror actions), and
    // vitest strips types so it could never see that. What this case adds is the
    // runtime half — that both forms survive registration and the lazy one is
    // still unresolved when it is stored.
    const { componentActionRegistry } =
      await import('../src/core/hmi/rv-component-action-registry');
    componentActionRegistry.register('RVI18nWidenProbe', [
      { id: 'plain', tooltip: 'still a string', onClick: () => {} },
      { id: 'lazy', tooltip: () => rvT('tools', 'planner.mirrorX'), onClick: () => {} },
    ]);
    const actions = componentActionRegistry.get('RVI18nWidenProbe');
    expect(actions.find((a) => a.id === 'plain')?.tooltip).toBe('still a string');
    const lazy = actions.find((a) => a.id === 'lazy')?.tooltip;
    expect(typeof lazy).toBe('function');
    expect((lazy as () => string)()).toMatch(/[一-鿿]/);
  });

  it('keeps the axis names the 3D view actually shows', () => {
    // `Three.js`, `Position X`, `Rotation X` are what the inspector rows are
    // called — the sentence moves, the field names do not.
    for (const key of ['planner.mirrorX', 'planner.mirrorY', 'planner.mirrorZ'] as const) {
      expect(rvT('tools', key), key).toContain('Three.js');
      expect(rvT('tools', key), key).toMatch(/[一-鿿]/);
    }
  });
});

describe('the tools catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    const keys = Object.keys(flatten(zhCN.tools as unknown as Record<string, unknown>));
    expect(keys.length).toBeGreaterThan(125);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        const base = key.replace(/_(one|other)$/, '');
        expect(rvT('tools', base as never, { count: 2 }), `${locale} ${base}`).not.toContain('tools:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });
});

describe('the final non-React sweep', () => {
  it('re-resolves GPU diagnostics without changing the stable tier', async () => {
    const info = {
      backend: 'webgl' as const,
      active: { vendor: 'Google', renderer: 'SwiftShader software renderer' },
    };

    const zh = analyzeGPU(info);
    expect(zh.tier).toBe('software');
    expect(zh.message).toMatch(/[一-鿿]/);

    await act(async () => { await setLocale('en-US'); });
    const en = analyzeGPU(info);
    expect(en.tier).toBe(zh.tier);
    expect(en.severity).toBe(zh.severity);
    expect(en.message).toBe('Hardware acceleration is disabled — rendering on the CPU.');
  });

  it('translates DES lint prose while preserving machine-readable diagnostics', async () => {
    const source = 'function setup() { return { continuous: { fixedUpdate(dt) { x += dt; } } }; }';
    const zh = lintDesSafety(source, { desSafe: true });
    expect(zh.map((d) => d.rule)).toEqual(['fixed-update', 'dt-accumulation']);
    expect(zh.every((d) => /[一-鿿]/.test(d.message))).toBe(true);

    await act(async () => { await setLocale('en-US'); });
    const en = lintDesSafety(source, { desSafe: true });
    expect(en.map(({ line, col, rule, severity }) => ({ line, col, rule, severity })))
      .toEqual(zh.map(({ line, col, rule, severity }) => ({ line, col, rule, severity })));
    expect(en[0]?.message).toContain('continuous.fixedUpdate');
    expect(en[1]?.message).toContain('self.in(delaySec, hook)');
  });

  it('keeps stable action IDs out of translated display text', async () => {
    expect(rvT('tools', 'finalSweep.action.run')).toBe('运行');
    expect(rvT('tools', 'finalSweep.action.emergencyStop')).toBe('急停');

    await act(async () => { await setLocale('en-US'); });
    expect(rvT('tools', 'finalSweep.action.run')).toBe('Run');
    expect(rvT('tools', 'finalSweep.action.emergencyStop')).toBe('Emergency Stop');
    // IDs are still authored in the behavior definitions (`run`, `stop`,
    // `estop`); catalog values are display copy and never become identifiers.
    expect(Object.values(enUS.tools.finalSweep.action)).not.toContain('estop');
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
