// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import type { DeploymentEgressConfig, EgressPurpose } from './deployment-config';

export interface EgressDecision {
  allowed: boolean;
  external: boolean;
  url: URL | null;
  reason: 'same-origin' | 'local-resource' | 'allow-listed' | 'invalid-url' | 'external-denied';
}

function runtimeBaseUrl(): string {
  return typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'http://localhost/';
}

function networkOrigin(url: URL): string {
  if (url.protocol === 'ws:') return `http://${url.host}`;
  if (url.protocol === 'wss:') return `https://${url.host}`;
  return url.origin;
}

function configuredOriginMatches(configured: string, actual: URL): boolean {
  try {
    return new URL(configured).origin === actual.origin;
  } catch {
    return false;
  }
}

/** Pure policy decision used by fetch, loaders, scripts, sockets and navigation. */
export function decideEgress(
  candidate: string | URL,
  purpose: EgressPurpose,
  policy: DeploymentEgressConfig | undefined,
  baseUrl = runtimeBaseUrl(),
): EgressDecision {
  let url: URL;
  try {
    url = candidate instanceof URL ? candidate : new URL(candidate, baseUrl);
  } catch {
    return { allowed: false, external: false, url: null, reason: 'invalid-url' };
  }

  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return { allowed: true, external: false, url, reason: 'local-resource' };
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    return { allowed: false, external: false, url, reason: 'invalid-url' };
  }

  const base = new URL(baseUrl);
  if (networkOrigin(url) === networkOrigin(base)) {
    return { allowed: true, external: false, url, reason: 'same-origin' };
  }

  if (policy?.mode === 'allow-listed') {
    const matched = policy.allow?.some((rule) => (
      rule.purposes.includes(purpose) && configuredOriginMatches(rule.origin, url)
    ));
    if (matched) return { allowed: true, external: true, url, reason: 'allow-listed' };
  }
  return { allowed: false, external: true, url, reason: 'external-denied' };
}

export function isEgressAllowed(
  candidate: string | URL,
  purpose: EgressPurpose,
  policy: DeploymentEgressConfig | undefined,
): boolean {
  return decideEgress(candidate, purpose, policy).allowed;
}

/** Return a normalized URL or null. Callers must not issue I/O for null. */
export function allowEgressUrl(
  candidate: string | URL,
  purpose: EgressPurpose,
  policy: DeploymentEgressConfig | undefined,
): URL | null {
  const decision = decideEgress(candidate, purpose, policy);
  return decision.allowed ? decision.url : null;
}
