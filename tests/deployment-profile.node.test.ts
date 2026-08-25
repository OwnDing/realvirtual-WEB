// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import { buildDeploymentCsp, projectDeploymentProfile } from '../scripts/apply-deployment-profile.mjs';

describe('deployment profile projection', () => {
  it('projects identity into marked static content', () => {
    const html = '<title>Old</title><meta data-rv-title content="Old"><h1 data-rv-product-name>Old</h1><img data-rv-logo src="/old.png">';
    const projected = projectDeploymentProfile(html, {
      identity: { productName: 'Plant Twin', logoUrl: '/brand/logo.png' },
      egress: { mode: 'deny-external', allow: [] },
    });
    expect(projected).toContain('<title>Plant Twin — Browser-based 3D HMI &amp; Digital Twin Viewer</title>');
    expect(projected).toContain('<h1 data-rv-product-name>Plant Twin</h1>');
    expect(projected).toContain('data-rv-logo src="/brand/logo.png"');
  });

  it('keeps CSP external-free by default and scopes allowed origins', () => {
    expect(buildDeploymentCsp({ egress: { mode: 'deny-external', allow: [] } }))
      .toContain("connect-src 'self';");
    const csp = buildDeploymentCsp({
      egress: {
        mode: 'allow-listed',
        allow: [
          { origin: 'https://news.example.test', purposes: ['news'] },
          { origin: 'https://script.example.test', purposes: ['analytics'] },
        ],
      },
    });
    expect(csp).toContain("connect-src 'self' https://news.example.test https://script.example.test");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://script.example.test");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline' https://news.example.test");
  });
});
