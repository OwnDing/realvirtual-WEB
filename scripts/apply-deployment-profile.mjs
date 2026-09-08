// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Build-time identity and CSP projection from dist/settings.json into dist/index.html. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildDeploymentCsp } from '../src/core/deployment/deployment-csp.mjs';
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

function safeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function validAsset(value) {
  return typeof value === 'string'
    && value.trim()
    && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim());
}

function replaceMarkedText(html, marker, value) {
  const pattern = new RegExp(`(<[^>]+\\b${marker}\\b[^>]*>)([^<]*)(<\\/[^>]+>)`, 'g');
  return html.replace(pattern, `$1${escapeHtml(value)}$3`);
}

function replaceMarkedAttribute(html, marker, attribute, value) {
  const pattern = new RegExp(`(<[^>]+\\b${marker}\\b[^>]*\\b${attribute}=")[^"]*(")`, 'g');
  return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

export function projectDeploymentProfile(html, config) {
  const identity = config?.identity && typeof config.identity === 'object' ? config.identity : {};
  const productName = safeText(identity.productName, 'XYvirtual WEB');
  const shortName = safeText(identity.shortName, productName);
  const description = safeText(
    identity.description,
    'Open, browser-based 3D HMI and digital twin viewer for industrial automation.',
  );
  const title = `${productName} — Browser-based 3D HMI & Digital Twin Viewer`;
  const defaultLocale = config?.defaults?.locale === 'en-US' ? 'en-US' : 'zh-CN';

  let projected = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  projected = projected.replace(
    /<html\s+lang="[^"]*"\s+data-rv-default-locale="[^"]*">/,
    `<html lang="${defaultLocale}" data-rv-default-locale="${defaultLocale}">`,
  );
  projected = replaceMarkedText(projected, 'data-rv-product-name', productName);
  projected = replaceMarkedText(projected, 'data-rv-product-short-name', shortName);
  projected = replaceMarkedAttribute(projected, 'data-rv-description', 'content', description);
  projected = replaceMarkedAttribute(projected, 'data-rv-site-name', 'content', productName);
  projected = replaceMarkedAttribute(projected, 'data-rv-title', 'content', title);
  projected = replaceMarkedAttribute(projected, 'data-rv-csp', 'content', buildDeploymentCsp(config));
  if (validAsset(identity.logoUrl)) projected = replaceMarkedAttribute(projected, 'data-rv-logo', 'src', identity.logoUrl.trim());
  if (validAsset(identity.faviconUrl)) projected = replaceMarkedAttribute(projected, 'data-rv-favicon', 'href', identity.faviconUrl.trim());
  if (typeof identity.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(identity.primaryColor)) {
    projected = projected.replace(/(<meta name="theme-color" content=")[^"]*(")/, `$1${identity.primaryColor}$2`);
  }
  projected = projected.replace(
    /(<script type="application\/ld\+json" data-rv-json-ld>)([\s\S]*?)(<\/script>)/,
    (whole, open, json, close) => {
      try {
        const value = JSON.parse(json);
        value.name = productName;
        value.alternateName = shortName;
        value.description = description;
        if (safeText(identity.companyName, '')) {
          value.publisher = { '@type': 'Organization', name: identity.companyName.trim() };
        }
        return `${open}\n  ${JSON.stringify(value, null, 2).replaceAll('\n', '\n  ')}\n  ${close}`;
      } catch {
        return whole;
      }
    },
  );
  return projected;
}

export function applyDeploymentProfile(distDir = join(root, 'dist'), { dryRun = false, profile = process.env.RV_DEPLOYMENT_PROFILE } = {}) {
  const settingsPath = join(distDir, 'settings.json');
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(settingsPath) || !existsSync(indexPath)) return false;
  if (profile !== undefined && profile !== '' && profile !== 'offline') throw new Error('Unknown deployment profile');
  const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const config = profile === 'offline' ? offlineProfile(raw) : raw;
  const projected = projectDeploymentProfile(readFileSync(indexPath, 'utf8'), config);
  if (!dryRun) {
    if (profile === 'offline') writeFileSync(settingsPath, JSON.stringify(config, null, 2) + '\n');
    writeFileSync(indexPath, projected);
    const teamsPath = join(distDir, 'teams-config.html');
    if (existsSync(teamsPath)) {
      writeFileSync(teamsPath, replaceMarkedAttribute(readFileSync(teamsPath, 'utf8'), 'data-rv-csp', 'content', buildDeploymentCsp(config)));
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
