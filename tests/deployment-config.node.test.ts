// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import { validateDeploymentConfig } from '../src/core/deployment/deployment-config';
import { decideEgress } from '../src/core/deployment/egress-policy';

describe('Deployment Config v1', () => {
  it('fails closed when the deployment omits policy', () => {
    const result = validateDeploymentConfig({ defaultModel: 'demo.glb' });
    expect(result.config.egress).toEqual({ mode: 'deny-external', allow: [] });
    expect(result.config.defaultModel).toBe('demo.glb');
  });

  it('drops deployment fields from an unsupported schema version', () => {
    const result = validateDeploymentConfig({
      schemaVersion: 2,
      identity: { productName: 'Unsafe' },
      egress: { mode: 'allow-listed', allow: [{ origin: 'https://example.test', purposes: ['news'] }] },
    });
    expect(result.config.identity).toBeUndefined();
    expect(result.config.egress).toEqual({ mode: 'deny-external', allow: [] });
    expect(result.issues).toContain('schemaVersion is unsupported; deployment-owned fields were ignored');
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
