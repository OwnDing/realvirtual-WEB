// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { offlineProfile } from '../scripts/offline-profile.mjs';
import { buildDeploymentCsp, applyDeploymentProfile } from '../scripts/apply-deployment-profile.mjs';

describe('offline deployment preset', () => {
  it('closes services and allowlists without altering identity, license, version or unknown data', () => {
    const original = { schemaVersion: 2, identity: { productName: 'Local' }, license: { required: true }, extension: { keep: true },
      egress: { mode: 'allow-listed', allow: [{ origin: 'https://tracking.example.test', purposes: ['analytics'] }] },
      services: { analytics: { provider: 'google-analytics', measurementId: 'fixture', scriptUrl: 'https://tracking.example.test/script' } } };
    const copy = structuredClone(original);
    const result = offlineProfile(original);
    expect(result).toMatchObject({ schemaVersion: 2, identity: original.identity, license: original.license, extension: original.extension,
      egress: { mode: 'deny-external', allow: [] }, services: { analytics: null, news: null, qr: { mode: 'local' } } });
    expect(original).toEqual(copy);
    expect(offlineProfile(result)).toEqual(result);
    expect(buildDeploymentCsp(result)).not.toContain('tracking.example.test');
  });
  it('rejects unknown future schema instead of silently downgrading', () => {
    expect(() => offlineProfile({ schemaVersion: 99 })).toThrow('unsupported');
  });
  it('ignores online analytics environment values and emits matching HTML and Worker headers', () => {
    const root = mkdtempSync(join(tmpdir(), 'rv-offline-profile-'));
    try {
      const dist = join(root, 'dist');
      mkdirSync(dist); mkdirSync(join(root, 'scripts'));
      copyFileSync('scripts/inject-ga-settings.mjs', join(root, 'scripts/inject-ga-settings.mjs'));
      const settings = { schemaVersion: 2, identity: { productName: 'Offline fixture' },
        egress: { mode: 'allow-listed', allow: [{ origin: 'https://old.example.test', purposes: ['news'] }] } };
      const original = JSON.stringify(settings);
      writeFileSync(join(dist, 'settings.json'), original);
      for (const entry of ['index.html', 'teams-config.html']) writeFileSync(join(dist, entry), '<meta data-rv-csp content="old">');
      const injection = spawnSync(process.execPath, [join(root, 'scripts/inject-ga-settings.mjs')], { encoding: 'utf8',
        env: { ...process.env, RV_DEPLOYMENT_PROFILE: 'offline', GA_MEASUREMENT_ID: 'G-FIXTURE', GA_SCRIPT_URL: 'https://tracking.example.test/script.js' } });
      expect(injection.status).toBe(0);
      expect(readFileSync(join(dist, 'settings.json'), 'utf8')).toBe(original);
      expect(applyDeploymentProfile(dist, { profile: 'offline' })).toBe(true);
      const config = JSON.parse(readFileSync(join(dist, 'settings.json'), 'utf8'));
      expect(config).toMatchObject({ schemaVersion: 2, identity: settings.identity, egress: { mode: 'deny-external', allow: [] }, services: { analytics: null } });
      const headers = JSON.parse(readFileSync(join(dist, 'deployment-headers.json'), 'utf8'));
      expect(headers['Content-Security-Policy']).toBe(buildDeploymentCsp(config));
      expect(headers['X-DNS-Prefetch-Control']).toBe('off');
      for (const entry of ['index.html', 'teams-config.html']) expect(readFileSync(join(dist, entry), 'utf8')).toContain(buildDeploymentCsp(config));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
