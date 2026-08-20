// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the always-visible HMI shell (EP-I18N-001 batch 3).
 *
 * What is specific to this surface, and what these cases defend:
 *
 *  - **It is on screen from the first frame.** The bars and gates render before
 *    any panel is opened, several of them from their OWN React root and one of
 *    them (`consent-gate`) before `main.ts` has mounted the app at all. A root
 *    that resolves against an uninitialised instance renders every label as its
 *    own key, and nothing else in the suite would notice.
 *  - **A class component and two module-level tables.** `LazyPanelBoundary` has
 *    no hooks, and `USE_CASES` / `license-store` build their text outside React.
 *    Each needs the imperative `rvT`, and each is a place where a string can be
 *    frozen at import time — before a language exists.
 *  - **Accessible names.** 25 of this batch's strings are `aria-label`s. They
 *    are invisible to a screenshot and to anyone reading the diff, so a
 *    regression here is silent by construction.
 *
 * Every case pins its locale — inheriting the default passes for the wrong
 * reason exactly once, and then hides a regression.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  initI18n,
  rvT,
  setLocale,
} from '../src/core/i18n';
import { LazyPanelBoundary } from '../src/core/hmi/LazyPanelBoundary';
import { SharedViewBanner } from '../src/core/hmi/SharedViewBanner';
import { deriveLicensePresentation } from '../src/core/hmi/license-store';
import type { LicenseStatus } from '../src/core/hmi/license-store';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { LoginGatePlugin } from '../src/plugins/login-gate-plugin';
import type { ComponentType } from 'react';
import type { UISlotProps } from '../src/core/rv-ui-plugin';

const shared = vi.hoisted(() => ({
  snap: { following: false, operatorName: '', onUnfollow: () => {} } as {
    following: boolean; operatorName: string; onUnfollow: () => void;
  },
}));

vi.mock('../src/plugins/multiuser-plugin', () => ({
  subscribeSharedView: () => () => {},
  getSharedViewSnapshot: () => shared.snap,
}));

function licenseStatus(state: string, extra: Partial<LicenseStatus> = {}): LicenseStatus {
  return {
    state, maxSignals: 20, admittedSignals: 3, effectiveNow: '', licenseType: null,
    licenseId: null, error: null, overLimitSignals: [], registration: null,
    licenseKeyMasked: null, ...extra,
  } as unknown as LicenseStatus;
}

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('shell chrome', () => {
  it('translates an accessible name and follows a language switch', async () => {
    shared.snap = { following: true, operatorName: 'Lin', onUnfollow: () => {} };
    render(<SharedViewBanner />);

    // The name carries an interpolated operator, so this also pins that the
    // possessive frame is one key rather than two fragments around a value.
    expect(screen.getByText('正在跟随 Lin 的视角')).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消跟随' })).toBeTruthy();

    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByText("Following Lin's view")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unfollow' })).toBeTruthy();
  });

  it('resolves inside a class component, which has no hook to use', async () => {
    // `LazyPanelBoundary` is a class: `useRvTranslation` is not available to it,
    // so it goes through the imperative `rvT` — the same seam plugins use.
    function Boom(): never { throw new Error('chunk failed'); }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => { await setLocale('en-US'); });
      const { container } = render(<LazyPanelBoundary label="Settings tab"><Boom /></LazyPanelBoundary>);
      expect(screen.getByText('Settings tab could not be loaded. Reload the page to try again.')).toBeTruthy();
      // Queried by attribute rather than by role: MUI marks its icons
      // `aria-hidden`, so the accessible NAME is not exposed to the a11y tree —
      // but the label is still the string this batch had to translate.
      expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe('Warning');
    } finally {
      quiet.mockRestore();
    }
  });
});

describe('module-level tables', () => {
  it('resolve license labels at call time, not at import time', async () => {
    // `deriveLicensePresentation` is a pure mapper that runs during render. If
    // its labels were resolved when the module loaded, they would be stuck in
    // whatever language the first import happened to see.
    await act(async () => { await setLocale('zh-CN'); });
    expect(deriveLicensePresentation(licenseStatus('Unlicensed')).label).toBe('需要许可');

    await act(async () => { await setLocale('en-US'); });
    expect(deriveLicensePresentation(licenseStatus('Unlicensed')).label).toBe('License required');
    expect(deriveLicensePresentation(licenseStatus('LicensedCommunity')).label)
      .toBe('Free - 3 / 20 signals');
  });
});

describe('an independent React root', () => {
  it('renders the shell language without an I18nextProvider', async () => {
    // The consent gate, the password gate and the welcome overlay each mount
    // their own root (ADR-0001 §10). None of them wraps a provider, so this is
    // the case that proves `initReactI18next` is what makes them work.
    await act(async () => { await setLocale('zh-CN'); });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    function Probe() {
      return <span data-testid="probe">{rvT('shell', 'consent.decline')}</span>;
    }
    await act(async () => { root.render(<Probe />); });
    expect(host.textContent).toBe('拒绝');

    await act(async () => { root.unmount(); });
    host.remove();
  });

  it('keeps the pre-load login gate reactive without translating deployment data', async () => {
    const sessionKey = 'rv-i18n-login-gate-test';
    localStorage.removeItem(sessionKey);
    const plugin = new LoginGatePlugin({
      title: 'ACME Line 7',
      subtitle: 'Customer Preview',
      userB64: btoa('operator'),
      passB64: btoa('secret'),
      sessionKey,
      footer: 'ACME Confidential',
      showModelPicker: false,
    });
    const Gate = plugin.slots[0].component as ComponentType<UISlotProps>;
    const viewer = { availableModels: [], currentModelUrl: null, pendingModelUrl: null };

    render(<Gate viewer={viewer as never} />);
    expect(screen.getByLabelText('用户名')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    expect(screen.getByText('ACME Line 7')).toBeTruthy();
    expect(screen.getByText('ACME Confidential')).toBeTruthy();

    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByLabelText('Username')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
    expect(screen.getByText('ACME Line 7')).toBeTruthy();
    expect(screen.getByText('ACME Confidential')).toBeTruthy();
    localStorage.removeItem(sessionKey);
  });
});

describe('the shell catalog', () => {
  it('resolves every key in both languages without reporting a miss', async () => {
    // A sweep, not a sample: the shell is 235 keys across 32 files, and the ones
    // most likely to break are the ones nobody writes a case for.
    const keys = Object.keys(flatten(rvShell()));
    expect(keys.length).toBeGreaterThan(200);

    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      clearI18nDiagnostics();
      for (const key of keys) {
        // Plural keys only exist as `_one`/`_other`; address them by their base
        // with a count, the way every call site does.
        const base = key.replace(/_(one|other)$/, '');
        const text = rvT('shell', base as never, { count: 2 });
        expect(text, `${locale} ${base}`).not.toContain('shell:');
      }
      expect(getI18nDiagnostics().filter((d) => d.kind === 'missing'), locale).toEqual([]);
    }
  });
});

/** The `shell` namespace of the source catalog — the list the runtime was built from. */
function rvShell(): Record<string, unknown> {
  return (zhCN as unknown as Record<string, Record<string, unknown>>).shell;
}

function flatten(node: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value as Record<string, unknown>, path));
    else out[path] = String(value);
  }
  return out;
}
