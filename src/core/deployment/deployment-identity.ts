// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import type { RVAppConfig } from '../rv-app-config';
import {
  DEFAULT_PRODUCT_NAME,
  DEFAULT_PRODUCT_SHORT_NAME,
} from './deployment-config';

import { resolveDeploymentBrand } from './brand-config.mjs';
import { applyBrandDocument } from './brand-document';

/** Apply the validated deployment identity before React mounts. */
export function applyDeploymentIdentityToDocument(config: RVAppConfig): void {
  if (typeof document !== 'undefined') applyBrandDocument(resolveDeploymentBrand(config));
}

export function currentProductName(config: RVAppConfig): string {
  return config.identity?.productName ?? DEFAULT_PRODUCT_NAME;
}

export function currentProductShortName(config: RVAppConfig): string {
  return config.identity?.shortName ?? config.identity?.productName ?? DEFAULT_PRODUCT_SHORT_NAME;
}
