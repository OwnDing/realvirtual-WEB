// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Build-time identity and CSP projection from dist/settings.json into dist/index.html. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildDeploymentCsp } from '../src/core/deployment/deployment-csp.mjs';
import { projectBrandHtml, brandManifest } from './project-brand-html.mjs';
import { offlineProfile } from './offline-profile.mjs';
export { buildDeploymentCsp } from '../src/core/deployment/deployment-csp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function projectDeploymentProfile(html, config, options = {}) {
  return projectBrandHtml(html, config, options).replace(/(<meta[^>]+data-rv-csp[^>]+content=")[^"]*(")/g,
    (_, a, b) => a + escapeHtml(buildDeploymentCsp(config)) + b);
}

export function applyDeploymentProfile(distDir = join(root, 'dist'), { dryRun = false, profile = process.env.RV_DEPLOYMENT_PROFILE, base = process.env.VITE_BASE || "./", pageUrl } = {}) {
  const settingsPath = join(distDir, 'settings.json');
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(settingsPath) || !existsSync(indexPath)) return false;
  if (profile !== undefined && profile !== '' && profile !== 'offline') throw new Error('Unknown deployment profile');
  const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const config = profile === 'offline' ? offlineProfile(raw) : raw;
  const projected = projectDeploymentProfile(readFileSync(indexPath, 'utf8'), config, { base, pageUrl });
  if (!dryRun) {
    if (profile === 'offline') writeFileSync(settingsPath, JSON.stringify(config, null, 2) + '\n');
    writeFileSync(indexPath, projected);
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(brandManifest(config, base), null, 2) + '\n');
    const teamsPath = join(distDir, 'teams-config.html');
    if (existsSync(teamsPath)) {
      writeFileSync(teamsPath, projectDeploymentProfile(readFileSync(teamsPath, 'utf8'), config, { base }));
    }
    // Static hosts should apply this policy to documents AND worker scripts.
    writeFileSync(join(distDir, 'deployment-headers.json'), JSON.stringify({
      'Content-Security-Policy': buildDeploymentCsp(config),
      'X-DNS-Prefetch-Control': 'off',
    }, null, 2) + '\n');
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (applyDeploymentProfile()) console.log('[deployment-profile] Applied identity and CSP to dist/index.html.');
  else console.log('[deployment-profile] dist settings/index not found — skipping.');
}
