// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { parseEgress } from './egress-config.mjs';

const CONNECT_PURPOSES = new Set([
  'analytics', 'news', 'documentation', 'connect-updates', 'firebase-demo',
  'github-library', 'remote-model', 'industrial-interface', 'multiuser', 'share', 'debug-tool',
]);
const SCRIPT_PURPOSES = new Set(['analytics', 'debug-tool']);
const IMAGE_PURPOSES = new Set(['analytics', 'github-library', 'remote-model']);

function allowedOrigins(config) {
  if (config?.schemaVersion !== undefined && config.schemaVersion !== 1 && config.schemaVersion !== 2) return [];
  const policy = parseEgress(config?.egress, []);
  return policy.mode === 'allow-listed' ? policy.allow : [];
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
    directive('connect-src', ["'self'", 'blob:', 'data:'], forPurposes(CONNECT_PURPOSES)),
    directive('script-src', ["'self'", "'unsafe-inline'"], [...forPurposes(SCRIPT_PURPOSES), 'blob:', "'wasm-unsafe-eval'"]),
    "style-src 'self' 'unsafe-inline'",
    directive('img-src', ["'self'", 'data:', 'blob:'], forPurposes(IMAGE_PURPOSES)),
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "frame-src 'self'",
    "form-action 'self'",
  ].join('; ');
}
