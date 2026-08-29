// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Build-time identity and CSP projection from dist/settings.json into dist/index.html. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONNECT_PURPOSES = new Set([
  'analytics', 'news', 'documentation', 'connect-updates', 'firebase-demo',
  'github-library', 'remote-model', 'industrial-interface', 'multiuser', 'share', 'debug-tool',
]);
const SCRIPT_PURPOSES = new Set(['analytics', 'debug-tool']);
const IMAGE_PURPOSES = new Set(['analytics', 'github-library', 'remote-model']);

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

function allowedOrigins(config) {
  if (config?.egress?.mode !== 'allow-listed' || !Array.isArray(config.egress.allow)) return [];
  return config.egress.allow.flatMap((rule) => {
    if (!rule || !Array.isArray(rule.purposes)) return [];
    try {
      const parsed = new URL(rule.origin);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return [];
      if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return [];
      return [{ origin: parsed.origin, purposes: rule.purposes.filter((p) => typeof p === 'string') }];
    } catch {
      return [];
    }
  });
}

export function buildDeploymentCsp(config) {
  const origins = allowedOrigins(config);
  const forPurposes = (purposes) => [...new Set(origins
    .filter((rule) => rule.purposes.some((purpose) => purposes.has(purpose)))
    .map((rule) => rule.origin))];
  const directive = (name, base, extra) => `${name} ${[...base, ...extra].join(' ')}`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    directive('connect-src', ["'self'"], forPurposes(CONNECT_PURPOSES)),
    directive('script-src', ["'self'", "'unsafe-inline'"], forPurposes(SCRIPT_PURPOSES)),
    "style-src 'self' 'unsafe-inline'",
    directive('img-src', ["'self'", 'data:', 'blob:'], forPurposes(IMAGE_PURPOSES)),
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "frame-src 'self'",
    "form-action 'self'",
  ].join('; ');
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

export function applyDeploymentProfile(distDir = join(root, 'dist'), { dryRun = false } = {}) {
  const settingsPath = join(distDir, 'settings.json');
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(settingsPath) || !existsSync(indexPath)) return false;
  const config = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const projected = projectDeploymentProfile(readFileSync(indexPath, 'utf8'), config);
  if (!dryRun) writeFileSync(indexPath, projected);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (applyDeploymentProfile()) console.log('[deployment-profile] Applied identity and CSP to dist/index.html.');
  else console.log('[deployment-profile] dist settings/index not found — skipping.');
}
