// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { beforeEach, describe, expect, it } from 'vitest';
import {
  USER_CONFIG_GLOBAL_KEY,
  USER_CONFIG_SCOPE_PREFIX,
  readUserConfig,
  resetUserConfigMemoryForTests,
  writeUserConfigPatch,
} from '../src/core/config/user-config-store';
import {
  loadFeaturePreferences,
  saveFeaturePreferences,
} from '../src/core/plugin-overrides/rv-plugin-override-store';

beforeEach(() => {
  localStorage.clear();
  resetUserConfigMemoryForTests();
});

describe('versioned user configuration migration', () => {
  it('projects legacy locale and mode without writing during read', () => {
    localStorage.setItem('rv-language', JSON.stringify({ v: 1, locale: 'en-US' }));
    localStorage.setItem('rv-active-mode', 'planner');
    expect(readUserConfig()).toEqual({ locale: 'en-US', workspace: { default: 'planner' } });
    expect(localStorage.getItem(USER_CONFIG_GLOBAL_KEY)).toBeNull();
  });

  it('writes v1 and lets the new record win over legacy values', () => {
    localStorage.setItem('rv-active-mode', 'hmi');
    writeUserConfigPatch(null, { locale: 'zh-CN', workspace: { default: 'viewer' } });
    expect(readUserConfig()).toEqual({ locale: 'zh-CN', workspace: { default: 'viewer' } });
    expect(JSON.parse(localStorage.getItem(USER_CONFIG_GLOBAL_KEY)!)).toEqual({
      v: 1, preferences: { locale: 'zh-CN', workspace: { default: 'viewer' } },
    });
  });

  it('carries untouched legacy fields into the first new-format write', () => {
    localStorage.setItem('rv-language', JSON.stringify({ v: 1, locale: 'en-US' }));
    localStorage.setItem('rv-active-mode', 'hmi');
    writeUserConfigPatch(null, { workspace: { default: 'planner' } });
    expect(readUserConfig()).toEqual({ locale: 'en-US', workspace: { default: 'planner' } });
    expect(JSON.parse(localStorage.getItem(USER_CONFIG_GLOBAL_KEY)!)).toEqual({
      v: 1, preferences: { locale: 'en-US', workspace: { default: 'planner' } },
    });
  });

  it('migrates scoped plugin disables and preserves explicit enables in v1', () => {
    localStorage.setItem('rv-plugin-overrides/prj_a', JSON.stringify({ v: 1, disabled: ['measurements'] }));
    expect(loadFeaturePreferences('prj_a')).toEqual({ measurements: false });

    saveFeaturePreferences('prj_a', { measurements: true, annotations: false });
    expect(loadFeaturePreferences('prj_a')).toEqual({ measurements: true, annotations: false });
    const key = `${USER_CONFIG_SCOPE_PREFIX}${encodeURIComponent('prj_a')}`;
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      v: 1, preferences: { features: { measurements: true, annotations: false } },
    });
    // Compatibility writer carries only the information an old client knows.
    expect(JSON.parse(localStorage.getItem('rv-plugin-overrides/prj_a')!)).toEqual({
      v: 1, disabled: ['annotations'],
    });
  });
});
