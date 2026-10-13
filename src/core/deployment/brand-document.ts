// SPDX-License-Identifier: AGPL-3.0-only
import { brandAssetHref, brandCssVariables, localizeBrandText, resolveDeploymentBrand, type ResolvedBrand } from './brand-config.mjs';

/** Public HTML contains only the presentation allowlist, never settings/policy. */
export function readDocumentBrand(): ResolvedBrand {
  try { return resolveDeploymentBrand(JSON.parse(document.querySelector('#rv-public-brand')?.textContent ?? '{}')); }
  catch { return resolveDeploymentBrand(); }
}
export function documentBrandBase(): string {
  return document.documentElement.getAttribute('data-rv-brand-base') ?? import.meta.env.BASE_URL;
}
export function applyBrandDocument(brand: ResolvedBrand): void {
  const base = documentBrandBase();
  document.title = brand.browserTitle;
  for (const [key, value] of Object.entries(brandCssVariables(brand))) document.documentElement.style.setProperty(key, value);
  document.documentElement.setAttribute('data-rv-brand-animation', brand.splash.animation);
  const content = (selector: string, value: string) => document.querySelectorAll<HTMLElement>(selector).forEach(node => { node.textContent = value; });
  content('[data-rv-product-name]', brand.productName);
  content('[data-rv-product-short-name]', brand.shortName);
  const slogan = document.querySelector<HTMLElement>('.loader-slogan');
  if (slogan) {
    for (const locale of ['zh-CN', 'en-US']) slogan.setAttribute(`data-rv-${locale.toLowerCase()}`, localizeBrandText(brand.splash.tagline, locale));
    slogan.textContent = localizeBrandText(brand.splash.tagline, document.documentElement.lang);
  }
  for (const [selector, value] of [
    ['meta[data-rv-description]:not([property="og:description"])', brand.description], ['meta[property="og:description"]', brand.social.description], ['meta[data-rv-site-name]', brand.productName],
    ['meta[data-rv-title]', brand.social.title], ['meta[name="theme-color"]', brand.primaryColor],
  ]) document.querySelectorAll<HTMLMetaElement>(selector).forEach(node => { node.content = value; });
  document.querySelectorAll<HTMLLinkElement>('link[data-rv-favicon]').forEach(node => {
    node.href = brandAssetHref(node.rel === 'apple-touch-icon' ? brand.icons.appleTouchUrl : brand.faviconUrl, base);
    if (node.rel === 'icon') node.removeAttribute('type');
  });
  document.querySelectorAll<HTMLImageElement>('img[data-rv-logo]').forEach(node => { node.src = brandAssetHref(brand.splash.logoUrl, base); });
  const jsonLd = document.querySelector<HTMLScriptElement>('script[data-rv-json-ld]');
  if (jsonLd?.textContent) try {
    const value = JSON.parse(jsonLd.textContent);
    value.name = brand.productName; value.alternateName = brand.shortName; value.description = brand.description;
    if (brand.companyName) value.publisher = { '@type': 'Organization', name: brand.companyName };
    else delete value.publisher;
    if (brand.configured) delete value.sameAs;
    jsonLd.textContent = JSON.stringify(value);
  } catch { /* Noncritical metadata: retain the static projection. */ }
}
