// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Browser evidence for the golden slice (ADR-0001 §9/§10/§12, PS-I18N-001 §7).
 *
 * The cases here are the ones a Node test cannot honestly make: a real React
 * render, two independent roots that must switch together, and a canvas whose
 * pixels are the state.
 *
 * ## Every test pins the locale
 *
 * `setLocale` is called explicitly at the start of each case rather than relying
 * on the default. A suite that inherits whatever the previous test left behind
 * passes for the wrong reason exactly once and then hides a real regression.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearI18nDiagnostics,
  getI18nDiagnostics,
  getLocale,
  initI18n,
  rvT,
  setLocale,
  useRvTranslation,
} from '../src/core/i18n';
import { LANGUAGE_PREFERENCE_KEY, clearAllRVStorage } from '../src/core/hmi/rv-storage-keys';
import { BADGE_FONT_STACK, buildBadgeTexture } from '../src/core/engine/rv-error-visual';
import { rvDarkTheme } from '../src/core/hmi/theme';

function Probe({ testId }: { testId: string }) {
  const { t, locale } = useRvTranslation('projects');
  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-title`}>{t('title')}</span>
      <span data-testid={`${testId}-locale`}>{locale}</span>
      <button type="button" aria-label={t('action.addLibrary')}>{t('action.open')}</button>
    </div>
  );
}

beforeEach(async () => {
  initI18n();
  clearI18nDiagnostics();
  await act(async () => { await setLocale('zh-CN'); });
});
afterEach(cleanup);

describe('language switching in React', () => {
  it('renders Chinese by default and English after a switch, with no reload', async () => {
    render(<Probe testId="a" />);
    expect(screen.getByTestId('a-title').textContent).toBe('项目');

    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByTestId('a-title').textContent).toBe('Projects');
    expect(screen.getByTestId('a-locale').textContent).toBe('en-US');

    await act(async () => { await setLocale('zh-CN'); });
    expect(screen.getByTestId('a-title').textContent).toBe('项目');
  });

  it('translates accessible names, not just visible text', async () => {
    render(<Probe testId="b" />);
    expect(screen.getByRole('button', { name: '添加库' })).toBeTruthy();
    await act(async () => { await setLocale('en-US'); });
    expect(screen.getByRole('button', { name: 'Add library' })).toBeTruthy();
  });

  it('keeps the imperative path in step with the React path', async () => {
    // ADR-0001 §1: plugins and managers call the SAME instance. If these two
    // ever disagree, half the UI is in one language and half in another.
    render(<Probe testId="c" />);
    await act(async () => { await setLocale('en-US'); });
    expect(rvT('projects', 'title')).toBe(screen.getByTestId('c-title').textContent);
    await act(async () => { await setLocale('zh-CN'); });
    expect(rvT('projects', 'title')).toBe(screen.getByTestId('c-title').textContent);
  });
});

describe('multiple independent React roots (ADR-0001 §10)', () => {
  it('switch together without any of them mounting a provider', async () => {
    // The main HMI and the consent/password/login gates each own a root. None of
    // them wraps an I18nextProvider, and none of them should have to.
    const hosts = [document.createElement('div'), document.createElement('div')];
    for (const host of hosts) document.body.appendChild(host);
    const roots = hosts.map((host) => createRoot(host));

    await act(async () => {
      roots[0].render(<Probe testId="root-1" />);
      roots[1].render(<Probe testId="root-2" />);
    });
    expect(hosts[0].textContent).toContain('项目');
    expect(hosts[1].textContent).toContain('项目');

    await act(async () => { await setLocale('en-US'); });
    expect(hosts[0].textContent).toContain('Projects');
    expect(hosts[1].textContent).toContain('Projects');

    await act(async () => { for (const root of roots) root.unmount(); });
    for (const host of hosts) host.remove();
  });
});

describe('preference persistence (PS-I18N-001 §7)', () => {
  it('survives a reload and is cleared by "Reset all"', async () => {
    await act(async () => { await setLocale('en-US'); });
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toContain('en-US');

    // A reload re-runs `initI18n()`, which resolves from storage — reproduced
    // here by asking the resolver the same question the boot path asks.
    const { resolveStartupLocale } = await import('../src/core/i18n');
    expect(resolveStartupLocale()).toBe('en-US');

    clearAllRVStorage();
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBeNull();
    expect(resolveStartupLocale()).toBe('zh-CN');
  });

  it('never writes the language into anything but its own key', async () => {
    // ADR-0001 §5: user/browser state, never project state.
    await act(async () => { await setLocale('en-US'); });
    const polluted = Object.keys(localStorage)
      .filter((key) => key !== LANGUAGE_PREFERENCE_KEY)
      .filter((key) => (localStorage.getItem(key) ?? '').includes('en-US'));
    expect(polluted).toEqual([]);
  });
});

describe('canvas-baked labels (ADR-0001 §9)', () => {
  it('repaints a catalog label when the language changes', async () => {
    await setLocale('zh-CN');
    const { texture } = buildBadgeTexture('');
    const canvas = texture.image as HTMLCanvasElement;
    const chinese = canvas.toDataURL();

    // `needsUpdate` is write-only on a three.js texture (it bumps `version`),
    // so the version counter is what actually proves the re-upload was queued.
    const versionBefore = texture.version;
    await act(async () => { await setLocale('en-US'); });

    // The texture OBJECT is the same — the sprite holds it and nobody told the
    // caller to swap — but its pixels changed and a re-upload was requested.
    expect(texture.image).toBe(canvas);
    expect(canvas.toDataURL()).not.toBe(chinese);
    expect(texture.version).toBeGreaterThan(versionBefore);
  });

  it('leaves a badge carrying model-authored text alone', async () => {
    // The counterexample that makes the rule above meaningful: a behaviour's own
    // `ErrorText` is content, and repainting it would lose what the model said.
    await setLocale('zh-CN');
    const { texture } = buildBadgeTexture('E-STOP 12');
    const canvas = texture.image as HTMLCanvasElement;
    const before = canvas.toDataURL();

    await act(async () => { await setLocale('en-US'); });
    expect(canvas.toDataURL()).toBe(before);
  });

  it('names CJK faces in every font stack that can render Chinese', () => {
    // ADR-0001 §12: no subset is bundled, so the fallback has to be declared.
    for (const family of ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC']) {
      expect(BADGE_FONT_STACK).toContain(family);
      expect(String(rvDarkTheme.typography.fontFamily)).toContain(family);
    }
  });

  it('draws Chinese without falling back to blank glyphs', async () => {
    // Tofu is not directly detectable, but "drew nothing" is: a canvas whose
    // label rendered as zero-width would be pixel-identical to an empty one.
    await setLocale('zh-CN');
    const { texture } = buildBadgeTexture('');
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let white = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240 && data[i + 3] > 200) white += 1;
    }
    expect(white, 'white glyph pixels drawn for 错误').toBeGreaterThan(20);
  });
});

describe('project data is untouched by the language (PS-I18N-001 §7)', () => {
  it('serialises a manifest identically in both languages', async () => {
    // Stable IDs and business content are not display text. If a language could
    // change what gets written, a project saved in Chinese and one saved in
    // English would stop being the same document.
    const { mergeManifest } = await import('../src/core/project/rv-project-storage');
    const original = {
      schemaVersion: 1,
      id: 'proj-7f3a',
      name: 'Welding Cell',
      documents: [{ id: 'doc-1', path: 'scenes/Cell.glb', name: 'Cell' }],
    } as never;

    // `modifiedAt` is pinned: `mergeManifest` stamps `new Date()` when it is
    // absent, and a millisecond of drift would make this test look like a
    // language difference that is not there.
    const update = { name: 'Welding Cell', modifiedAt: '2026-08-19T00:00:00.000Z' } as never;
    await act(async () => { await setLocale('zh-CN'); });
    const inChinese = JSON.stringify(mergeManifest(original, update));
    await act(async () => { await setLocale('en-US'); });
    const inEnglish = JSON.stringify(mergeManifest(original, update));

    expect(inEnglish).toBe(inChinese);
    expect(inEnglish).toContain('proj-7f3a');
    expect(inEnglish).not.toMatch(/zh-CN|en-US/);
  });
});

describe('layout survives both languages (PS-I18N-001 §4.6)', () => {
  /** The header buttons are `whiteSpace: 'nowrap'`, so a long label clips rather than wraps. */
  function Header() {
    const { t } = useRvTranslation('projects');
    return (
      <div style={{ width: 260, display: 'flex', gap: 8 }} data-testid="header">
        <button type="button" data-testid="btn-open" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
          {t('nav.openEllipsis')}
        </button>
        <button type="button" data-testid="btn-new" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
          {t('nav.newProject')}
        </button>
        <button type="button" data-testid="btn-actions" aria-label={t('action.projectActions')} style={{ fontSize: 11 }}>
          ⋯
        </button>
      </div>
    );
  }

  it('keeps the header actions readable and un-clipped in both languages', async () => {
    render(<Header />);
    for (const locale of ['zh-CN', 'en-US'] as const) {
      await act(async () => { await setLocale(locale); });
      for (const id of ['btn-open', 'btn-new']) {
        const el = screen.getByTestId(id);
        expect(el.textContent?.trim(), `${id} @ ${locale}`).not.toBe('');
        // A nowrap button whose content is wider than its box is a clipped label.
        expect(el.scrollWidth, `${id} clipped @ ${locale}`).toBeLessThanOrEqual(el.clientWidth + 1);
        expect(el.getBoundingClientRect().height, `${id} collapsed @ ${locale}`).toBeGreaterThan(0);
      }
      // The row itself must not overflow its 260px container in either language.
      const header = screen.getByTestId('header');
      expect(header.scrollWidth, `row overflows @ ${locale}`).toBeLessThanOrEqual(header.clientWidth + 1);
      // Icon-only controls stay reachable by name in both languages.
      expect(screen.getByTestId('btn-actions').getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('missing translations (PS-I18N-001 §7)', () => {
  it('falls back to Chinese and records locatable evidence', async () => {
    await act(async () => { await setLocale('en-US'); });
    const { getI18n } = await import('../src/core/i18n');
    // An empty bundle does not erase keys — the namespace has to go first.
    getI18n().removeResourceBundle('en-US', 'viewer');
    getI18n().addResourceBundle('en-US', 'viewer', {}, true, true);
    clearI18nDiagnostics();

    expect(rvT('viewer', 'badgeError')).toBe('错误');
    expect(getI18nDiagnostics()).toContainEqual({ kind: 'fallback', key: 'viewer:badgeError', locale: 'en-US' });

    getI18n().addResourceBundle('en-US', 'viewer', { badgeError: 'Error' }, true, true);
    expect(getLocale()).toBe('en-US');
  });
});
