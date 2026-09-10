// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import type { DeploymentEgressConfig, EgressPurpose } from './deployment-config';
import { decideEgress } from './egress-policy';

/** Deliberately excludes URLs: they may contain credentials or customer data. */
export class EgressBlockedError extends Error {
  readonly code = 'EGRESS_BLOCKED';
  constructor(readonly purpose: EgressPurpose) {
    super(`External access blocked by deployment policy (${purpose})`);
    this.name = 'EgressBlockedError';
  }
}

export function requireEgressUrl(
  candidate: string | URL,
  purpose: EgressPurpose,
  policy: DeploymentEgressConfig | undefined,
  baseUrl?: string,
): URL {
  const decision = decideEgress(candidate, purpose, policy, baseUrl);
  if (!decision.allowed || !decision.url) throw new EgressBlockedError(purpose);
  return decision.url;
}

/** One attempt only. Redirects must never carry a request outside its authorization. */
export async function fetchWithEgress(
  input: RequestInfo | URL,
  purpose: EgressPurpose,
  policy: DeploymentEgressConfig | undefined,
  init: RequestInit = {},
  baseUrl?: string,
  transport: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const candidate = input instanceof Request ? input.url : input;
  requireEgressUrl(candidate, purpose, policy, baseUrl);
  // Keep the original input so request bodies, relative URLs and caller mocks
  // retain their existing semantics. The URL above is only an authorization.
  return transport(input, { ...init, redirect: 'error' });
}
