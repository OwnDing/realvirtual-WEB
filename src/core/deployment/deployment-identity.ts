// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import type { RVAppConfig } from '../rv-app-config';
import {
  DEFAULT_PRODUCT_NAME,
  DEFAULT_PRODUCT_SHORT_NAME,
  deploymentProductName,
  deploymentShortName,
} from './deployment-config';

const DEFAULT_DESCRIPTION = 'Open, browser-based 3D HMI and digital twin viewer for industrial automation.';

/** Apply the already-validated deployment identity before React mounts. */
export function applyDeploymentIdentityToDocument(config: RVAppConfig): void {
  if (typeof document === 'undefined') return;
  const productName = deploymentProductName(config);
  const shortName = deploymentShortName(config);
  const description = config.identity?.description ?? DEFAULT_DESCRIPTION;

  document.title = document.title.replace(DEFAULT_PRODUCT_NAME, productName);
  for (const element of document.querySelectorAll<HTMLElement>('[data-rv-product-name]')) {
    element.textContent = productName;
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-rv-product-short-name]')) {
    element.textContent = shortName;
  }
  for (const element of document.querySelectorAll<HTMLMetaElement>('meta[data-rv-description]')) {
    element.content = description;
  }
  for (const element of document.querySelectorAll<HTMLMetaElement>('meta[data-rv-site-name]')) {
    element.content = productName;
  }
  for (const element of document.querySelectorAll<HTMLMetaElement>('meta[data-rv-title]')) {
    element.content = document.title;
  }

  if (config.identity?.faviconUrl) {
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[data-rv-favicon]')) {
      link.href = config.identity.faviconUrl;
    }
  }
  if (config.identity?.logoUrl) {
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-rv-logo]')) {
      image.src = config.identity.logoUrl;
    }
  }

  const jsonLd = document.querySelector<HTMLScriptElement>('script[data-rv-json-ld]');
  if (jsonLd?.textContent) {
    try {
      const value = JSON.parse(jsonLd.textContent) as Record<string, unknown>;
      value.name = productName;
      value.alternateName = shortName;
      value.description = description;
      if (config.identity?.companyName) {
        value.publisher = { '@type': 'Organization', name: config.identity.companyName };
      }
      jsonLd.textContent = JSON.stringify(value);
    } catch {
      // Static metadata is non-critical. Keep the build-time copy when malformed.
    }
  }
}

export function currentProductName(config: RVAppConfig): string {
  return config.identity?.productName ?? DEFAULT_PRODUCT_NAME;
}

export function currentProductShortName(config: RVAppConfig): string {
  return config.identity?.shortName ?? config.identity?.productName ?? DEFAULT_PRODUCT_SHORT_NAME;
}
