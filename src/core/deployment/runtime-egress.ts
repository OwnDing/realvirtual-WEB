// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { getAppConfig } from '../rv-app-config';
import { allowEgressUrl, decideEgress, isEgressAllowed } from './egress-policy';
import type { EgressPurpose } from './deployment-config';
import { fetchWithEgress, requireEgressUrl } from './egress-io';

export function decideRuntimeEgress(candidate: string | URL, purpose: EgressPurpose) {
  return decideEgress(candidate, purpose, getAppConfig().egress);
}

export function isRuntimeEgressAllowed(candidate: string | URL, purpose: EgressPurpose): boolean {
  return isEgressAllowed(candidate, purpose, getAppConfig().egress);
}

export function allowRuntimeEgressUrl(candidate: string | URL, purpose: EgressPurpose): URL | null {
  return allowEgressUrl(candidate, purpose, getAppConfig().egress);
}

export function requireRuntimeEgressUrl(candidate: string | URL, purpose: EgressPurpose): URL {
  return requireEgressUrl(candidate, purpose, getAppConfig().egress);
}

export function runtimeFetch(input: RequestInfo | URL, purpose: EgressPurpose, init?: RequestInit): Promise<Response> {
  return fetchWithEgress(input, purpose, getAppConfig().egress, init);
}

export function openRuntimeUrl(candidate: string, purpose: EgressPurpose): void {
  const url = requireRuntimeEgressUrl(candidate, purpose);
  window.open(url.href, '_blank', 'noopener,noreferrer');
}
