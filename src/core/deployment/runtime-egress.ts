// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { getAppConfig } from '../rv-app-config';
import { allowEgressUrl, decideEgress, isEgressAllowed } from './egress-policy';
import type { EgressPurpose } from './deployment-config';

export function decideRuntimeEgress(candidate: string | URL, purpose: EgressPurpose) {
  return decideEgress(candidate, purpose, getAppConfig().egress);
}

export function isRuntimeEgressAllowed(candidate: string | URL, purpose: EgressPurpose): boolean {
  return isEgressAllowed(candidate, purpose, getAppConfig().egress);
}

export function allowRuntimeEgressUrl(candidate: string | URL, purpose: EgressPurpose): URL | null {
  return allowEgressUrl(candidate, purpose, getAppConfig().egress);
}
