// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import {
  migrateDeploymentConfigV1ToV2,
  validateDeploymentConfig,
} from '../src/core/deployment/deployment-config';
import { decideEgress } from '../src/core/deployment/egress-policy';

describe('Deployment Config v1/v2', () => {
  it('fails closed when the deployment omits policy', () => {
    const result = validateDeploymentConfig({ defaultModel: 'demo.glb' });
    expect(result.config.egress).toEqual({ mode: 'deny-external', allow: [] });
    expect(result.config.defaultModel).toBe('demo.glb');
  });

  it('drops deployment fields from an unsupported schema version', () => {
    const result = validateDeploymentConfig({
      schemaVersion: 99,
      identity: { productName: 'Unsafe' },
      egress: { mode: 'allow-listed', allow: [{ origin: 'https://example.test', purposes: ['news'] }] },
    });
    expect(result.config.identity).toBeUndefined();
    expect(result.config.egress).toEqual({ mode: 'deny-external', allow: [] });
    expect(result.issues).toContain('schemaVersion is unsupported; deployment-owned fields were ignored');
  });

  it('accepts and independently validates v2 defaults and policy', () => {
    const result = validateDeploymentConfig({
      schemaVersion: 2,
      defaults: {
        locale: 'en-US',
        workspace: { default: 'planner', allowed: ['viewer', 'planner', 'Planner'] },
        features: { measurements: false, INVALID: true },
      },
      policy: {
        lockedPaths: ['locale', 'egress.mode'],
        workspace: { allowed: ['viewer'] },
        features: { measurements: 'deny', annotations: 'unexpected' },
      },
    });
    expect(result.config.defaults).toEqual({
      locale: 'en-US',
      workspace: { default: 'planner', allowed: ['viewer', 'planner'] },
      features: { measurements: false },
    });
    expect(result.config.policy).toEqual({
      lockedPaths: ['locale'],
      workspace: { allowed: ['viewer'] },
      features: { measurements: 'deny' },
    });
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('migrates v1 to v2 without mutation and is idempotent', () => {
    const v1 = {
      schemaVersion: 1 as const,
      defaultModel: 'demo.glb',
      unknown: { keep: true },
      // Reserved v2 fields are inert in v1 and must not become active merely
      // because a delivery tool updates the version marker.
      defaults: { locale: 'en-US' },
      policy: { lockedPaths: ['locale'] },
    };
    const migrated = migrateDeploymentConfigV1ToV2(v1)!;
    expect(migrated).toEqual({
      schemaVersion: 2, defaultModel: 'demo.glb', unknown: { keep: true },
    });
    expect(v1.schemaVersion).toBe(1);
    expect(migrateDeploymentConfigV1ToV2(migrated)).toEqual(migrated);
  });

  it('rejects remote identity assets', () => {
    const result = validateDeploymentConfig({
      schemaVersion: 1,
      identity: { productName: 'Plant Twin', logoUrl: 'https://assets.example/logo.png' },
    });
    expect(result.config.identity).toEqual({ productName: 'Plant Twin' });
    expect(result.issues).toContain('identity.logoUrl is invalid and was ignored');
  });

  it('allows only the exact origin and purpose', () => {
    const policy = {
      mode: 'allow-listed' as const,
      allow: [{ origin: 'https://api.example.test', purposes: ['news' as const] }],
    };
    expect(decideEgress('https://api.example.test/v1', 'news', policy, 'https://app.example.test/').allowed).toBe(true);
    expect(decideEgress('https://api.example.test/v1', 'analytics', policy, 'https://app.example.test/').allowed).toBe(false);
    expect(decideEgress('wss://api.example.test/v1', 'news', policy, 'https://app.example.test/').allowed).toBe(false);
    expect(decideEgress('/models/local.glb', 'remote-model', policy, 'https://app.example.test/').reason).toBe('same-origin');
  });
});
