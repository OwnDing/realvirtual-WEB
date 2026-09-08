// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { describe, expect, it, vi } from 'vitest';
import { fetchWithEgress, EgressBlockedError } from '../src/core/deployment/egress-io';
import { buildDeploymentCsp } from '../src/core/deployment/deployment-csp.mjs';
import { validateDeploymentConfig } from '../src/core/deployment/deployment-config';

const base = 'https://app.example.test/';
const deny = { mode: 'deny-external' as const, allow: [] };

describe('offline I/O boundary', () => {
  it('rejects a dynamic cross-origin URL before invoking the transport', async () => {
    const transport = vi.fn();
    await expect(fetchWithEgress('https://other.example.test/data', 'industrial-interface', deny, {}, base, transport))
      .rejects.toBeInstanceOf(EgressBlockedError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('allows local resources but prevents automatic redirects and write retries', async () => {
    const transport = vi.fn().mockRejectedValue(new TypeError('redirect rejected'));
    await expect(fetchWithEgress('/redirect', 'remote-model', deny, { method: 'POST', redirect: 'follow' }, base, transport))
      .rejects.toThrow('redirect rejected');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error' });
  });

  it('requires the exact purpose for an explicitly allowed origin', async () => {
    const policy = { mode: 'allow-listed' as const, allow: [{ origin: 'https://gateway.example.test', purposes: ['industrial-interface' as const] }] };
    const transport = vi.fn().mockResolvedValue(new Response('ok'));
    await fetchWithEgress('https://gateway.example.test/status', 'industrial-interface', policy, {}, base, transport);
    await expect(fetchWithEgress('https://gateway.example.test/status', 'news', policy, {}, base, transport)).rejects.toThrow(EgressBlockedError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('does not reveal URL credentials or query data in rejection errors', async () => {
    await expect(fetchWithEgress('https://secret:token@other.example.test/private?key=sensitive', 'share', deny, {}, base))
      .rejects.toThrow(/^External access blocked by deployment policy \(share\)$/);
  });
});

describe('build and runtime CSP agreement', () => {
  it.each([{}, { schemaVersion: 99, egress: { mode: 'allow-listed', allow: [{ origin: 'https://other.example.test', purposes: ['news'] }] } },
    { schemaVersion: 2, egress: { mode: 'allow-listed', allow: [{ origin: 'https://other.example.test/path', purposes: ['news'] }] } }])('fails closed for invalid deployment %j', (raw) => {
    expect(buildDeploymentCsp(raw)).toBe(buildDeploymentCsp(validateDeploymentConfig(raw).config as Record<string, unknown>));
    expect(buildDeploymentCsp(raw)).not.toContain('other.example.test');
  });

  it('permits local blobs, data fetches and Wasm without JavaScript eval', () => {
    const csp = buildDeploymentCsp({ egress: deny });
    expect(csp).toContain("connect-src 'self' blob: data:");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/https?:/);
  });
});
