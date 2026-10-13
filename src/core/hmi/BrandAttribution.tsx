// SPDX-License-Identifier: AGPL-3.0-only
import { useRvTranslation } from '../i18n';
import { localizeBrandText, brandAssetHref } from '../deployment/brand-config.mjs';
import { allowRuntimeEgressUrl } from '../deployment/runtime-egress';
import { getDeploymentBrand, useCustomBranding } from './branding-store';

export function BrandAttribution() {
  useCustomBranding();
  const { locale } = useRvTranslation('shell');
  const { attribution } = getDeploymentBrand();
  if (!attribution.visible) return null;
  const text = localizeBrandText(attribution.text, locale);
  const path = attribution.url;
  const url = path ? allowRuntimeEgressUrl(/^https?:/.test(path) ? path : brandAssetHref(path, import.meta.env.BASE_URL), 'documentation')?.href : undefined;
  return <span data-testid="brand-attribution" style={{ color: 'var(--rv-brand-muted, #aaa)', fontSize: 11 }}>
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{text}</a> : text}
  </span>;
}
