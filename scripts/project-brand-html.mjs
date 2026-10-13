// SPDX-License-Identifier: AGPL-3.0-only
import { resolveDeploymentBrand, brandAssetHref, brandCssVariables, localizeBrandText, escapeBrandHtml as esc, safeBrandJson } from '../src/core/deployment/brand-config.mjs';

export function projectBrandHtml(html, config, { base = '/', pageUrl, styleHref } = {}) {
  const brand = resolveDeploymentBrand(config);
  const locale = config?.defaults?.locale === 'en-US' ? 'en-US' : 'zh-CN';
  // Regenerate owned blocks, never append a second stale identity on reapplication.
  let out = html.replace(/<!-- rv-brand:start -->[\s\S]*?<!-- rv-brand:end -->\s*/g, '');
  // A release assembled without a public URL must not inherit another release's SEO URLs.
  out = out.replace(/<link\b[^>]*rel="canonical"[^>]*>\s*/g, '').replace(/<meta\b[^>]*(?:property="og:(?:url|image)"|name="twitter:(?:card|image)")[^>]*>\s*/g, '');
  const markedText = (marker, value) => {
    out = out.replace(new RegExp(`(<[^>]+\\b${marker}\\b[^>]*>)[^<]*(<\\/[^>]+>)`, 'g'), (_, a, b) => a + esc(value) + b);
  };
  const markedAttr = (marker, attr, value) => {
    out = out.replace(new RegExp(`<[^>]+\\b${marker}\\b[^>]*>`, 'g'), tag => {
      const re = new RegExp(`\\b${attr}="[^"]*"`);
      return re.test(tag) ? tag.replace(re, () => `${attr}="${esc(value)}"`) : tag.replace(/\/?>(?=$)/, match => ` ${attr}="${esc(value)}"${match}`);
    });
  };
  out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(brand.browserTitle)}</title>`);
  out = out.replace(/<html\b([^>]*)>/, (_, attrs) => `<html${attrs.replace(/\s(?:lang|data-rv-default-locale|data-rv-brand-base|data-rv-brand-animation)="[^"]*"/g, '')} lang="${locale}" data-rv-default-locale="${locale}"${brand.configured || base !== "/" ? ` data-rv-brand-base="${esc(base)}" data-rv-brand-animation="${brand.splash.animation}"` : ""}>`);
  markedText('data-rv-product-name', brand.productName);
  markedText('data-rv-product-short-name', brand.shortName);
  markedText('data-rv-attribution', brand.attribution.visible ? localizeBrandText(brand.attribution.text, locale) : '');
  markedAttr('data-rv-description', 'content', brand.description);
  out = out.replace(/<meta\b[^>]*property="og:description"[^>]*>/g, tag => tag.replace(/content="[^"]*"/, () => `content="${esc(brand.social.description)}"`));
  markedAttr('data-rv-site-name', 'content', brand.productName);
  markedAttr('data-rv-title', 'content', brand.social.title);
  markedAttr('data-rv-logo', 'src', brandAssetHref(brand.splash.logoUrl, base));
  markedAttr('data-rv-brand-image', 'src', brandAssetHref(brand.logoUrl, base));
  out = out.replace(/<link\b[^>]*data-rv-favicon[^>]*>/g, tag => {
    const path = tag.includes('apple-touch-icon') ? brand.icons.appleTouchUrl : brand.faviconUrl;
    return tag.replace(/\s+type="[^"]*"/, '').replace(/href="[^"]*"/, () => `href="${esc(brandAssetHref(path, base))}"`);
  });
  out = out.replace(/(<meta name="theme-color" content=")[^"]*(")/, (_, a, b) => a + brand.primaryColor + b);
  out = out.replace(/(<link rel="manifest" href=")[^"]*(")/, (_, a, b) => a + esc(brandAssetHref('manifest.json', base)) + b);
  out = out.replace(/<div class="loader-slogan"[^>]*>[^<]*<\/div>/, () => `<div class="loader-slogan" data-rv-zh-cn="${esc(localizeBrandText(brand.splash.tagline, 'zh-CN'))}" data-rv-en-us="${esc(localizeBrandText(brand.splash.tagline, 'en-US'))}">${esc(localizeBrandText(brand.splash.tagline, locale))}</div>`);
  out = out.replace(/(<script type="application\/ld\+json" data-rv-json-ld>)[\s\S]*?(<\/script>)/, (_, a, b) => a + safeBrandJson({
    '@context': 'https://schema.org', '@type': 'WebApplication', name: brand.productName,
    alternateName: brand.shortName, description: brand.description,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)',
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    ...(brand.companyName ? { publisher: { '@type': 'Organization', name: brand.companyName } } : {}),
  }) + b);
  const css = brandStyles(brand);
  let block = `<!-- rv-brand:start -->\n${styleHref ? `<link rel="stylesheet" href="${esc(styleHref)}">` : `<style id="rv-brand-style">${css}</style>`}\n<script id="rv-public-brand" type="application/json">${safeBrandJson(brand.publicConfig)}</script>\n`;
  if (!out.includes('data-rv-favicon')) block += `<link rel="icon" data-rv-favicon href="${esc(brandAssetHref(brand.faviconUrl, base))}">`;
  if (!out.includes('name="theme-color"')) block += `<meta name="theme-color" content="${brand.primaryColor}">`;
  if (!out.includes('data-rv-site-name')) block += `<meta property="og:site_name" data-rv-site-name content="${esc(brand.productName)}">`;
  if (!out.includes('data-rv-title')) block += `<meta property="og:title" data-rv-title content="${esc(brand.social.title)}">`;
  if (!out.includes('data-rv-description')) block += `<meta name="description" data-rv-description content="${esc(brand.description)}">`;
  if (pageUrl) {
    const url = new URL(pageUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid public page URL');
    block += `<link rel="canonical" href="${esc(url.href)}"><meta property="og:url" content="${esc(url.href)}">`;
    if (brand.social.imageUrl) {
      const image = new URL(brandAssetHref(brand.social.imageUrl, base), url).href;
      block += `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">`;
    }
  }
  block += '\n<!-- rv-brand:end -->\n';
  return out.replace(/<\/head>/i, () => block + '</head>');
}
export function brandStyles(brand) {
  const vars = Object.entries(brandCssVariables(brand)).map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${vars}}\nhtml[data-rv-brand-animation="none"] .loader-logo,html[data-rv-brand-animation="none"] .orbit-dot{animation:none}html[data-rv-brand-animation="none"] .orbit-ring,html[data-rv-brand-animation="none"] .orbit-dot{display:none}\n@media(prefers-reduced-motion:reduce){.loader-logo,.orbit-dot{animation:none}}`;
}
export function brandManifest(config, base = '/') {
  const b = resolveDeploymentBrand(config);
  const root = brandAssetHref('', base);
  return { id: root, name: b.productName, short_name: b.shortName, description: b.description,
    start_url: root, scope: root, display: 'standalone', background_color: b.splash.backgroundColor, theme_color: b.primaryColor,
    icons: [
      { src: brandAssetHref(b.icons.pwa192Url, base), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: brandAssetHref(b.icons.pwa512Url, base), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: brandAssetHref(b.icons.maskable512Url, base), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ] };
}
