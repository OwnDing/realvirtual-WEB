// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import { parseProjectConfiguration } from '../src/core/config/project-config';
import { parseSessionConfig } from '../src/core/config/session-config';
import { resolveUnifiedConfig } from '../src/core/config/unified-config';

describe('unified configuration resolver', () => {
  it('uses deployment < project < user < session and reports provenance', () => {
    const result = resolveUnifiedConfig({
      deployment: { locale: 'en-US', workspace: { default: 'viewer' }, features: { measurements: false } },
      project: { workspace: { default: 'planner' } },
      user: { locale: 'zh-CN', features: { measurements: true } },
      session: { locale: 'en-US', workspace: { default: 'des' } },
    });
    expect(result.effective.locale).toBe('en-US');
    expect(result.effective.workspace.default).toBe('des');
    expect(result.effective.features.measurements).toBe(true);
    expect(result.provenance.locale.source).toBe('session');
    expect(result.provenance['workspace.default'].source).toBe('session');
    expect(result.provenance['features.measurements'].source).toBe('user');
  });

  it('applies deployment locks after ordinary precedence', () => {
    const result = resolveUnifiedConfig({
      deployment: { locale: 'en-US', features: { measurements: false } },
      project: { locale: 'zh-CN' },
      session: { features: { measurements: true } },
      policy: { lockedPaths: ['locale', 'features.measurements'] },
    });
    expect(result.effective.locale).toBe('en-US');
    expect(result.effective.features.measurements).toBe(false);
    expect(result.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'locale', reason: 'locked' }),
      expect.objectContaining({ path: 'features.measurements', reason: 'locked' }),
    ]));
  });

  it('intersects workspace capabilities and policy and clamps an invalid default', () => {
    const result = resolveUnifiedConfig({
      deployment: { workspace: { default: 'planner', allowed: ['viewer', 'hmi', 'planner'] } },
      project: { workspace: { allowed: ['viewer', 'planner'] } },
      policy: { workspace: { allowed: ['viewer', 'hmi'] } },
      capabilities: { workspaces: ['viewer', 'hmi', 'planner', 'editor'] },
    });
    expect(result.effective.workspace).toEqual({ default: 'viewer', allowed: ['viewer'] });
    expect(result.rejected).toContainEqual(expect.objectContaining({
      path: 'workspace.default', reason: 'outside-allowed-set', value: 'planner',
    }));
  });

  it('cannot enable an absent or deployment-denied feature', () => {
    const result = resolveUnifiedConfig({
      session: { features: { measurements: true, 'mcp-bridge': true } },
      policy: { features: { measurements: 'deny' } },
      capabilities: { features: ['measurements'] },
    });
    expect(result.effective.features).toEqual({ measurements: false, 'mcp-bridge': false });
    expect(result.provenance['features.measurements'].source).toBe('policy');
    expect(result.provenance['features.mcp-bridge'].source).toBe('capability');
  });

  it('keeps an ordinary disabled source when an absent capability did not clamp it', () => {
    const result = resolveUnifiedConfig({
      project: { features: { measurements: false } },
      capabilities: { features: [] },
    });
    expect(result.effective.features.measurements).toBe(false);
    expect(result.provenance['features.measurements'].source).toBe('project');
  });
});

describe('project and session inputs', () => {
  it('merges a stable model profile inside the project layer', () => {
    const parsed = parseProjectConfiguration({
      $schema: 'rv-project-config/1.0',
      defaults: { locale: 'en-US', features: { measurements: true } },
      modelProfiles: { doc_a: { defaults: { workspace: { default: 'planner' }, features: { measurements: false } } } },
    }, 'doc_a');
    expect(parsed.kind).toBe('unified');
    expect(parsed.values).toEqual({
      locale: 'en-US',
      workspace: { default: 'planner' },
      features: { measurements: false },
    });
  });

  it('diagnoses and ignores project/profile fields outside the ordinary plane', () => {
    const parsed = parseProjectConfiguration({
      $schema: 'rv-project-config/1.0',
      policy: { lockedPaths: ['locale'] },
      defaults: { locale: 'en-US', egress: { mode: 'allow-listed' } },
      modelProfiles: { doc_a: { defaults: { locale: 'zh-CN' }, services: { news: {} } } },
    }, 'doc_a');
    expect(parsed.values).toEqual({ locale: 'zh-CN' });
    expect(parsed.issues).toEqual(expect.arrayContaining([
      'project.policy is unknown and was ignored',
      'project.defaults.egress is unknown and was ignored',
      'project.modelProfiles.doc_a.services is unknown and was ignored',
    ]));
  });

  it('recognises a legacy bundle without applying it', () => {
    const parsed = parseProjectConfiguration({
      $schema: 'rv-settings-bundle/1.0', settings: { visual: { maxDpr: 1 } },
    });
    expect(parsed.kind).toBe('legacy-bundle');
    expect(parsed.legacySettings).toEqual({ visual: { maxDpr: 1 } });
    expect(parsed.values).toBeUndefined();
  });

  it('allowlists session locale, mode and feature booleans only', () => {
    const parsed = parseSessionConfig(new URLSearchParams(
      'locale=en-US&mode=planner&feature.measurements=off&feature.bad=maybe&egress.mode=allow-listed',
    ));
    expect(parsed).toEqual({
      locale: 'en-US', workspace: { default: 'planner' }, features: { measurements: false },
    });
  });
});
