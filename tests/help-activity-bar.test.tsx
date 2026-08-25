// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * plan-370 §9.6 — the help button: click target, accessible name, kiosk,
 * mobile overflow menu and the configured base URL (F1, F6, F8, F9).
 *
 * Harness follows tests/ai-consent-gate.test.tsx — ActivityBar uses
 * `useViewer()`, so it needs the provider.
 */

import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { ActivityBar } from '../src/core/hmi/ActivityBar';
import { rvDarkTheme } from '../src/core/hmi/theme';
import { LeftPanelManager } from '../src/core/hmi/left-panel-manager';
import { UIPluginRegistry } from '../src/core/rv-ui-registry';
import { RVViewerProvider } from '../src/hooks/use-viewer';
import { setAppConfig } from '../src/core/rv-app-config';
import { activateContext, deactivateContext } from '../src/core/hmi/ui-context-store';
import { _resetHelpTopicRegistryForTests, registerHelpTopic } from '../src/core/hmi/help-topic-registry';
import { setLocale } from '../src/core/i18n';

/**
 * English is pinned rather than inherited (ADR-0001 Validation).
 *
 * The shell copy asserted below comes from the catalog and the product default
 * is `zh-CN`, so without the pin these locators would be matching whatever the
 * default happens to be rather than the behaviour under test.
 */
beforeAll(async () => { await setLocale('en-US'); });

const layout = vi.hoisted(() => ({ mobile: false }));

vi.mock('../src/hooks/use-mobile-layout', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/hooks/use-mobile-layout')>(),
  useMobileLayout: () => layout.mobile,
}));

vi.mock('../src/core/hmi/scene/scene-store-singleton', () => ({
  getSceneStore: () => ({}),
}));

vi.mock('../src/core/hmi/ButtonPanel', () => ({
  ButtonPanel: () => <div />,
  LogoBadge: () => <button type="button" title="About" aria-label="About">realvirtual</button>,
}));

function createViewer(setup?: (lpm: LeftPanelManager) => void) {
  const leftPanelManager = new LeftPanelManager();
  setup?.(leftPanelManager);
  const editorSnapshot = { panelOpen: false, settingsOpen: false };
  const editorPlugin = {
    subscribe: () => () => undefined,
    getSnapshot: () => editorSnapshot,
    togglePanel: vi.fn(),
    setSettingsOpen: vi.fn(),
  };
  let activeMode: string | null = null;
  return {
    leftPanelManager,
    uiRegistry: new UIPluginRegistry(),
    modes: {
      get activeMode() { return activeMode; },
      setActive(id: string | null) { activeMode = id; },
      subscribe: () => () => undefined,
      getSnapshot: () => 0,
    },
    applyVisualSettings: vi.fn(),
    clearModel: vi.fn(),
    renderBackend: 'three',
    hasRenderBackend: () => false,
    onRenderBackendChange: () => () => undefined,
    setRenderBackend: vi.fn(),
    getPlugin: (id: string) => (id === 'rv-extras-editor' ? editorPlugin : null),
    on: () => () => undefined,
  };
}

function renderWithViewer(node: ReactNode, viewer: ReturnType<typeof createViewer>) {
  return render(
    <ThemeProvider theme={rvDarkTheme}>
      <RVViewerProvider value={viewer as never}>{node}</RVViewerProvider>
    </ThemeProvider>,
  );
}

const helpButton = () => screen.getByRole('button', { name: /help/i });

beforeEach(() => {
  layout.mobile = false;
  _resetHelpTopicRegistryForTests();
  setAppConfig({ services: { documentation: { baseUrl: 'http://localhost:5177/docs/' } } });
  localStorage.removeItem('rv-left-panel-active');
});

afterEach(() => {
  cleanup();
  deactivateContext('kiosk');
  _resetHelpTopicRegistryForTests();
  setAppConfig({});
  vi.restoreAllMocks();
});

describe('help entry in the activity bar', () => {
  it('opens the derived topic in a new tab', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithViewer(<ActivityBar />, createViewer((lpm) => lpm.open('layout-planner', 300, 'left')));
    fireEvent.click(helpButton());
    expect(spy).toHaveBeenCalledWith(
      'http://localhost:5177/docs/planner/overview/', '_blank', 'noopener,noreferrer',
    );
  });

  it('opens the documentation root when nothing is open', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithViewer(<ActivityBar />, createViewer());
    fireEvent.click(helpButton());
    expect(spy).toHaveBeenCalledWith(
      'http://localhost:5177/docs/', '_blank', 'noopener,noreferrer',
    );
  });

  it('announces target and new tab in the accessible name', () => {
    renderWithViewer(<ActivityBar />, createViewer((lpm) => lpm.open('connect', 280, 'right')));
    expect(screen.getByRole('button', { name: /help for CONNECT \(new tab\)/i })).toBeTruthy();
  });

  it('updates the accessible name when a plugin contributes a topic', () => {
    const viewer = createViewer();
    renderWithViewer(<ActivityBar />, viewer);
    expect(screen.getByRole('button', { name: /help for XYvirtual WEB/i })).toBeTruthy();
    act(() => { registerHelpTopic('plugin:test', { slug: 'des/overview' }); });
    expect(screen.getByRole('button', { name: /help for DES/i })).toBeTruthy();
  });

  it('hides the button in kiosk context', () => {
    activateContext('kiosk');
    renderWithViewer(<ActivityBar />, createViewer());
    expect(screen.queryByRole('button', { name: /help/i })).toBeNull();
  });

  it('offers help in the mobile overflow menu', () => {
    layout.mobile = true;
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithViewer(<ActivityBar />, createViewer());
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const item = screen.getByRole('menuitem', { name: 'Help' });
    fireEvent.click(item);
    expect(spy).toHaveBeenCalledWith(
      'http://localhost:5177/docs/', '_blank', 'noopener,noreferrer',
    );
  });

  it('drops the mobile entry in kiosk context too', () => {
    layout.mobile = true;
    activateContext('kiosk');
    renderWithViewer(<ActivityBar />, createViewer());
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Help' })).toBeNull();
  });

  // F6 on the click path — the shared helper alone is not proof.
  it('honours a configured base URL', () => {
    setAppConfig({
      services: { documentation: { baseUrl: 'https://kunde.example/hilfe/' } },
      egress: { mode: 'allow-listed', allow: [{ origin: 'https://kunde.example', purposes: ['documentation'] }] },
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithViewer(<ActivityBar />, createViewer((lpm) => lpm.open('connect', 280, 'right')));
    fireEvent.click(helpButton());
    expect(spy).toHaveBeenCalledWith(
      'https://kunde.example/hilfe/connect/overview/', '_blank', 'noopener,noreferrer',
    );
  });

  it('stays out of the way of a shell whose allowlist omits it', () => {
    renderWithViewer(<ActivityBar entryAllowlist={['about']} />, createViewer());
    expect(screen.queryByRole('button', { name: /help/i })).toBeNull();
  });
});
