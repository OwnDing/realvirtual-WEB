// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the Settings panel migration (EP-I18N-001 Milestone 4b,
 * batch 2).
 *
 * The golden slice already proved the runtime works. What is new here, and what
 * these cases actually defend, is everything the Settings surface added on top:
 *
 *  - **Plural keys.** `_one`/`_other` do not exist under their own name, so a
 *    lookup that forgets to forward `count` reports the key as missing and
 *    renders it as text. That is a whole-category failure, not one string.
 *  - **A registry label that is a getter** (ADR-0001 §9). A plugin's settings
 *    tab is registered in a constructor — before any language exists — so the
 *    only thing that can follow a switch is a function resolved at render.
 *  - **Two tables that must agree**: `RENDER_MODES` still carries the English
 *    labels for non-UI consumers, and the catalog carries them for the dropdown.
 *    Nothing but a test stops those two from drifting.
 *  - **A raw key leaking to screen.** A missing key renders as `settings:a.b`,
 *    which looks enough like a label to survive review. The sweep below reads
 *    the rendered panel and refuses anything shaped like a key.
 *
 * Every case pins its locale — inheriting the default passes for the wrong
 * reason exactly once, and then hides a regression.
 */

import { type ReactNode } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { SettingsPanel } from '../src/core/hmi/SettingsPanel';
import { GroupsTab } from '../src/core/hmi/settings/GroupsTab';
import { TestsTab } from '../src/core/hmi/settings/TestsTab';
import { rvDarkTheme } from '../src/core/hmi/theme';
import { LeftPanelManager } from '../src/core/hmi/left-panel-manager';
import { UIPluginRegistry } from '../src/core/rv-ui-registry';
import { RVViewerProvider } from '../src/hooks/use-viewer';
import { RENDER_MODES } from '../src/core/rv-render-modes';
import { enUS } from '../src/core/i18n/catalogs/en-US';
import { ragState } from '../src/core/hmi/settings/rag-status';
import type { ConnectSnapshot } from '../src/core/hmi/connect-store';
import type { UISlotEntry } from '../src/core/rv-ui-plugin';

// Tab 0 mounts on open; stubbing it keeps this file about the shell and the
// catalog rather than about the Backup tab's storage probing.
vi.mock('../src/core/hmi/settings/ModelTab', () => ({
  BackupTab: () => <div data-testid="backup-tab" />,
}));

/** Flatten a catalog subtree to `a.b.c` keys — the shape i18next addresses. */
function flatten(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}

function createViewer(slots: UISlotEntry[] = []) {
  const uiRegistry = new UIPluginRegistry();
  if (slots.length > 0) uiRegistry.register({ id: 'test-plugin', slots });
  return {
    leftPanelManager: new LeftPanelManager(),
    uiRegistry,
    getPlugin: () => null,
    on: () => () => undefined,
  };
}

function renderPanel(viewer: ReturnType<typeof createViewer>): ReactNode {
  return render(
    <ThemeProvider theme={rvDarkTheme}>
      <RVViewerProvider value={viewer as never}>
        <SettingsPanel onClose={vi.fn()} />
      </RVViewerProvider>
    </ThemeProvider>,
  ) as unknown as ReactNode;
}

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('Settings panel language', () => {
  it('renders Chinese by default and switches in place, with no remount', async () => {
    renderPanel(createViewer());

    const strip = screen.getByRole('tablist');
    expect(within(strip).getByRole('tab', { name: '备份' })).toBeTruthy();
    expect(within(strip).getByRole('tab', { name: '视觉' })).toBeTruthy();
    // The mounted tab body is the proof that nothing was torn down and rebuilt:
    // a remount would recreate this node, and the settings tabs hold their
    // expand/collapse state in local state. `find`, not `get`: the tab bodies
    // are code-split, so the first one arrives a microtask after the strip.
    const bodyBefore = await screen.findByTestId('backup-tab');

    await act(async () => { await setLocale('en-US'); });

    expect(within(strip).getByRole('tab', { name: 'Backup' })).toBeTruthy();
    expect(within(strip).getByRole('tab', { name: 'Visual' })).toBeTruthy();
    expect(screen.getByTestId('backup-tab')).toBe(bodyBefore);
  });

  it('leaves no lookup unresolved in the shell or in a real tab body', async () => {
    // The shell alone would be a thin test — its tab bodies are code-split and
    // one of them is stubbed here. `GroupsTab` and `TestsTab` are the two that
    // render fully without a viewer worth mocking, and `GroupsTab` is the one
    // that exercises a plural key from inside real JSX.
    const groups = {
      groups: { getAll: () => [{ name: 'Frames', nodes: [{}, {}] }], setDefaultHiddenGroups: vi.fn() },
      on: () => () => undefined,
    };
    for (const locale of ['zh-CN', 'en-US'] as const) {
      cleanup();
      clearI18nDiagnostics();
      await act(async () => { await setLocale(locale); });
      renderPanel(createViewer());
      render(
        <RVViewerProvider value={groups as never}>
          <><GroupsTab /><TestsTab /></>
        </RVViewerProvider>,
      );

      // A missing key renders as `settings:tab.backup` — close enough to a
      // label to pass a glance, which is exactly why it needs a machine.
      expect(document.body.textContent ?? '').not.toMatch(/\b(settings|common|projects|viewer):[\w.]+/);
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing')).toEqual([]);
    }
  });
});

describe('plural keys', () => {
  // English inflects, Chinese does not — which is the whole reason these are
  // `_one`/`_other` in the catalog instead of a suffix spliced in JSX.
  it('picks the English form by count and keeps one Chinese form', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('settings', 'groups.objectCount', { count: 1 })).toBe('(1 object)');
    expect(rvT('settings', 'groups.objectCount', { count: 4 })).toBe('(4 objects)');
    expect(rvT('settings', 'simulation.zones', { count: 1 })).toBe('1 zone');
    expect(rvT('settings', 'simulation.bodies', { count: 2 })).toBe('2 bodies');

    await act(async () => { await setLocale('zh-CN'); });
    expect(rvT('settings', 'groups.objectCount', { count: 1 })).toBe('（1 个对象）');
    expect(rvT('settings', 'groups.objectCount', { count: 4 })).toBe('（4 个对象）');
  });

  it('resolves EVERY plural key in both locales, not just the ones with a test', async () => {
    // Written as a sweep over the catalog rather than a list: a plural key added
    // later gets this guarantee without anyone remembering to extend a fixture,
    // and forgetting `count` at one call site is the failure this whole shape
    // exists to make loud.
    const bases = new Set(
      Object.keys(flatten(enUS.settings as unknown as Record<string, unknown>))
        .filter((key) => /_(one|other)$/.test(key))
        .map((key) => key.replace(/_(one|other)$/, '')),
    );
    expect(bases.size).toBeGreaterThan(0);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      for (const base of bases) {
        for (const count of [0, 1, 2]) {
          clearI18nDiagnostics();
          const text = rvT('settings', base as never, { count });
          expect(text, `${locale} ${base} count=${count}`).not.toContain(base);
          expect(getI18nDiagnostics(), `${locale} ${base} count=${count}`).toEqual([]);
        }
      }
    }
  });

  it('resolves without reporting the key as missing', async () => {
    // The counterexample this pins: `exists()` without the count answers false
    // for a plural key, so a probe that drops the options renders the key and
    // logs a phantom miss. Both halves have to be checked — the text AND the
    // diagnostic — because either one alone still passes with the bug.
    clearI18nDiagnostics();
    const text = rvT('settings', 'simulation.zones', { count: 3 });
    expect(text).not.toContain('settings:');
    expect(getI18nDiagnostics()).toEqual([]);
  });
});

describe('plugin settings-tab labels (ADR-0001 §9)', () => {
  it('re-resolves a getter label on a language change and still accepts a string', async () => {
    const viewer = createViewer([
      { slot: 'settings-tab', component: () => <div />, label: () => rvT('settings', 'cameraStart.tab'), order: 1 },
      { slot: 'settings-tab', component: () => <div />, label: 'Legacy Plugin', order: 2 },
    ]);
    renderPanel(viewer);
    const strip = screen.getByRole('tablist');

    expect(within(strip).getByRole('tab', { name: '起始视图' })).toBeTruthy();
    // Backward compatibility is the point of the union: an unmigrated plugin
    // that still hands over a plain string must keep working untouched.
    expect(within(strip).getByRole('tab', { name: 'Legacy Plugin' })).toBeTruthy();

    await act(async () => { await setLocale('en-US'); });
    expect(within(strip).getByRole('tab', { name: 'Start View' })).toBeTruthy();
    expect(within(strip).getByRole('tab', { name: 'Legacy Plugin' })).toBeTruthy();
  });
});

describe('render-mode labels', () => {
  it('match the descriptor table they were moved out of', () => {
    // `rv-render-modes.ts` keeps its English `label`/`description` for callers
    // that are not the Visual tab. Two copies of one string drift silently;
    // this is the only thing that notices.
    for (const mode of RENDER_MODES) {
      const keys = { simple: ['simple', 'simpleDesc'], default: ['default', 'defaultDesc'], toon: ['toon', 'toonDesc'] }[mode.id];
      const catalog = enUS.settings.visual.renderMode as Record<string, string>;
      expect(catalog[keys[0]]).toBe(mode.label);
      expect(catalog[keys[1]]).toBe(mode.description);
    }
  });
});

describe('CONNECT RAG status', () => {
  it('keeps the level stable while the label follows the language', async () => {
    const snapshot = { state: 'disconnected', gatewayUnreachable: false } as unknown as ConnectSnapshot;

    await act(async () => { await setLocale('zh-CN'); });
    expect(ragState(snapshot).level).toBe('offline');
    expect(ragState(snapshot).label).toBe('CONNECT 未连接');

    await act(async () => { await setLocale('en-US'); });
    // `level` is what callers and tests branch on; only the wording moves.
    expect(ragState(snapshot).level).toBe('offline');
    expect(ragState(snapshot).label).toBe('CONNECT not connected');
  });
});
