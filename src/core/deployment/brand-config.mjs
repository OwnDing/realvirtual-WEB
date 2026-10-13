// SPDX-License-Identifier: AGPL-3.0-only
/** Shared, side-effect-free deployment branding contract for Node and browsers. */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const color = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : undefined;
const text = (value, max = 200, empty = false) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) && (empty || value.trim()) ? value.trim() : undefined;
export function brandAssetPath(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\\%?#\s\u0000-\u001f]/.test(value)
    || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || value.split('/').some(p => p === '..' || p === '.')) return undefined;
  return value;
}
function link(value) {
  const local = brandAssetPath(value);
  if (local) return local;
  if (typeof value !== 'string' || value.length > 1000) return undefined;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
function localized(value) {
  if (typeof value === 'string') return text(value, 500, true);
  if (!record(value) || Object.keys(value).some(key => key !== 'zh-CN' && key !== 'en-US')) return undefined;
  const result = {};
  for (const locale of ['zh-CN', 'en-US']) if (value[locale] !== undefined) {
    const parsed = text(value[locale], 500, true);
    if (parsed === undefined) return undefined;
    result[locale] = parsed;
  }
  return Object.keys(result).length ? result : undefined;
}
function fields(value, definitions, path, issues) {
  if (value === undefined) return undefined;
  if (!record(value)) { issues.push(`${path} must be an object`); return undefined; }
  const result = {};
  for (const [key, parse] of Object.entries(definitions)) {
    if (value[key] === undefined) continue;
    const parsed = parse(value[key]);
    if (parsed === undefined) issues.push(`${path}.${key} is invalid and was ignored`);
    else result[key] = parsed;
  }
  for (const key of Object.keys(value)) if (!(key in definitions)) issues.push(`${path} contains an unknown field`);
  return result;
}
export function parseBrandIdentity(value, issues = []) {
  return fields(value, {
    productName: v => text(v), shortName: v => text(v), companyName: v => text(v),
    description: v => text(v, 500, true), logoUrl: brandAssetPath, faviconUrl: brandAssetPath,
    primaryColor: color, secondaryColor: color,
  }, 'identity', issues);
}
export function parseBranding(value, issues = []) {
  if (value === undefined) return undefined;
  if (!record(value) || value.schemaVersion !== 1) { issues.push('branding.schemaVersion is unsupported; branding was ignored'); return undefined; }
  return fields(value, {
    schemaVersion: v => v === 1 ? 1 : undefined,
    browserTitle: v => text(v),
    theme: v => fields(v, { surfaceColor: color, textColor: color, mutedTextColor: color, borderColor: color }, 'branding.theme', issues),
    splash: v => fields(v, { logoUrl: brandAssetPath, backgroundColor: color, textColor: color, tagline: localized,
      animation: a => a === 'none' || a === 'orbit' ? a : undefined }, 'branding.splash', issues),
    attribution: v => fields(v, { visible: a => typeof a === 'boolean' ? a : undefined, text: localized, url: link }, 'branding.attribution', issues),
    icons: v => fields(v, { appleTouchUrl: brandAssetPath, pwa192Url: brandAssetPath, pwa512Url: brandAssetPath, maskable512Url: brandAssetPath }, 'branding.icons', issues),
    social: v => fields(v, { imageUrl: brandAssetPath, title: a => text(a), description: a => text(a, 500, true) }, 'branding.social', issues),
  }, 'branding', issues);
}
// Central portable strings: the preboot projector and the export writer cannot import React/i18next.
export const DEFAULT_BRAND_TEXT = Object.freeze({
  tagline: { 'zh-CN': '开放、轻量、工业级、随处可用。', 'en-US': 'Open. Light. Industrial. Anywhere.' },
  attribution: { 'zh-CN': '由 XYvirtual WEB 提供支持', 'en-US': 'powered by XYvirtual WEB' },
});
export function localizeBrandText(value, locale, fallback = '') {
  return typeof value === 'string' ? value : value?.[locale] ?? value?.['zh-CN'] ?? fallback;
}
function resolveLocalized(value, defaults) {
  if (typeof value === 'string') return value;
  return { 'zh-CN': value?.['zh-CN'] ?? defaults['zh-CN'], 'en-US': value?.['en-US'] ?? value?.['zh-CN'] ?? defaults['en-US'] };
}
export function resolveDeploymentBrand(raw = {}, issues = []) {
  const supported = raw.schemaVersion === undefined || raw.schemaVersion === 1 || raw.schemaVersion === 2;
  if (!supported) issues.push('schemaVersion is unsupported; deployment branding was ignored');
  const identity = supported ? parseBrandIdentity(raw.identity, issues) ?? {} : {};
  const branding = raw.schemaVersion === 2 ? parseBranding(raw.branding, issues) ?? {} : {};
  const name = identity.productName ?? 'XYvirtual WEB';
  const shortName = identity.shortName ?? (identity.productName ? name : 'XYvirtual');
  const description = identity.description ?? 'Open, browser-based 3D HMI and digital twin viewer for industrial automation.';
  return {
    configured: Object.keys(identity).length > 0 || branding.schemaVersion === 1,
    productName: name, shortName, companyName: identity.companyName, description,
    browserTitle: branding.browserTitle ?? `${name} — Browser-based 3D HMI & Digital Twin Viewer`,
    logoUrl: identity.logoUrl ?? 'logo.png', faviconUrl: identity.faviconUrl ?? 'favicon.png',
    primaryColor: identity.primaryColor ?? '#4fc3f7', secondaryColor: identity.secondaryColor ?? '#e94078',
    theme: { ...branding.theme },
    splash: { logoUrl: branding.splash?.logoUrl ?? identity.logoUrl ?? 'logo.png', backgroundColor: '#1a1a1a', textColor: '#cccccc',
      animation: 'orbit', ...branding.splash, tagline: resolveLocalized(branding.splash?.tagline, DEFAULT_BRAND_TEXT.tagline) },
    attribution: { visible: false, ...branding.attribution, text: resolveLocalized(branding.attribution?.text, DEFAULT_BRAND_TEXT.attribution) },
    icons: { appleTouchUrl: 'apple-touch-icon.png', pwa192Url: 'pwa-192x192.png', pwa512Url: 'pwa-512x512.png', maskable512Url: 'pwa-512x512.png', ...branding.icons },
    social: { title: branding.browserTitle ?? `${name} — Browser-based 3D HMI & Digital Twin Viewer`, description, ...branding.social },
    // Only this allowlist may be embedded into unauthenticated pages.
    publicConfig: { schemaVersion: 2, identity, ...(branding.schemaVersion === 1 ? { branding } : {}) },
  };
}
export function brandAssetHref(path, base = '/') {
  if (!base.startsWith('/')) return `${base.endsWith('/') ? base : base + '/'}${path.replace(/^\//, '')}`;
  const cleanBase = '/' + base.split('/').filter(Boolean).join('/');
  return `${cleanBase === '/' ? '' : cleanBase}/${path.replace(/^\//, '')}`;
}
export function brandCssVariables(brand) {
  const rgb = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)).join(',');
  const splashPrimary = brand.publicConfig.identity.primaryColor ?? '#2dd4bf';
  const splashSecondary = brand.publicConfig.identity.secondaryColor ?? '#4f46e5';
  return {
    '--rv-brand-primary': brand.primaryColor,
    '--rv-brand-primary-rgb': rgb(brand.primaryColor), '--rv-brand-secondary': brand.secondaryColor,
    '--rv-brand-splash-primary': splashPrimary, '--rv-brand-splash-secondary': splashSecondary,
    '--rv-brand-splash-primary-rgb': rgb(splashPrimary), '--rv-brand-splash-secondary-rgb': rgb(splashSecondary),
    '--rv-brand-surface': brand.theme.surfaceColor ?? 'rgba(30,30,30,0.6)',
    '--rv-brand-text': brand.theme.textColor ?? '#ffffff', '--rv-brand-muted': brand.theme.mutedTextColor ?? '#aaaaaa',
    '--rv-brand-border': brand.theme.borderColor ?? 'rgba(255,255,255,0.08)',
    '--rv-brand-splash-background': brand.splash.backgroundColor, '--rv-brand-splash-text': brand.splash.textColor,
  };
}
export const escapeBrandHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const safeBrandJson = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
