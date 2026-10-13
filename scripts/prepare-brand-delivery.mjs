// SPDX-License-Identifier: AGPL-3.0-only
/** Assemble into a fresh directory; the caller switches the complete release atomically. */
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, statSync, lstatSync, cpSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, dirname, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { resolveDeploymentBrand, brandAssetPath, brandAssetHref } from '../src/core/deployment/brand-config.mjs';
import { brandStyles, projectBrandHtml } from './project-brand-html.mjs';
import { applyDeploymentProfile } from './apply-deployment-profile.mjs';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const entries = config => [
  ['identity.logoUrl', config.identity?.logoUrl], ['identity.faviconUrl', config.identity?.faviconUrl],
  ['branding.splash.logoUrl', config.branding?.splash?.logoUrl],
  ...Object.entries(config.branding?.icons ?? {}).map(([key, value]) => [`branding.icons.${key}`, value]),
  ['branding.social.imageUrl', config.branding?.social?.imageUrl],
].filter(([, value]) => value !== undefined);
function assetFile(root, path) {
  if (!brandAssetPath(path)) throw new Error('Invalid brand asset path');
  const base = realpathSync(root);
  const target = realpathSync(resolve(root, path.replace(/^\//, '')));
  if (!target.startsWith(base + sep) || !statSync(target).isFile()) throw new Error('Brand asset escapes delivery directory');
  const size = statSync(target).size;
  if (!size || size > 4 * 1024 * 1024) throw new Error('Brand asset must be 1 byte to 4 MiB');
  return target;
}
export async function validateBrandAssets(root, config) {
  const issues = [];
  resolveDeploymentBrand(config, issues);
  if (issues.length) throw new Error(`Invalid branding: ${issues.join('; ')}`);
  const result = [];
  // v1/legacy branding is deliberately inert, including during delivery.
  for (const [key, path] of entries({ ...config, branding: config.schemaVersion === 2 ? config.branding : undefined })) {
    let file;
    try { file = assetFile(root, path); } catch { throw new Error(`Missing or unsafe brand asset: ${key}`); }
    const bytes = readFileSync(file);
    const extension = extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(extension)) throw new Error(`Unsupported brand image: ${key}`);
    if (extension === '.svg') {
      const svg = bytes.toString('utf8');
      const passiveTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'text', 'tspan', 'title', 'desc', 'pattern']);
      const unknownTag = [...svg.matchAll(/<\s*\/?\s*([a-z][\w:.-]*)/gi)].some(match => !passiveTags.has(match[1].toLowerCase()));
      if (!/<svg[\s>]/i.test(svg) || unknownTag || /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|\s(?:on[a-z]+|style)\s*=|(?:href|src)\s*=\s*["'](?!#)|url\s*\(\s*["']?(?!#)|@import/i.test(svg)) throw new Error(`Active or externally referenced SVG: ${key}`);
    }
    let meta;
    try { meta = await sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 }).metadata(); } catch { throw new Error(`Unreadable brand image: ${key}`); }
    if (meta.format !== ({ '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.svg': 'svg' })[extension]) throw new Error(`Brand image format does not match its extension: ${key}`);
    if (!meta.width || !meta.height || meta.width > 4096 || meta.height > 4096 || (meta.pages ?? 1) !== 1) throw new Error(`Oversized or animated brand image: ${key}`);
    const expected = { 'branding.icons.appleTouchUrl': 180, 'branding.icons.pwa192Url': 192, 'branding.icons.pwa512Url': 512, 'branding.icons.maskable512Url': 512 }[key];
    if (expected && (extension !== '.png' || meta.format !== 'png' || meta.width !== expected || meta.height !== expected)) throw new Error(`Invalid brand icon dimensions: ${key} requires ${expected}x${expected} PNG`);
    if (key === 'branding.social.imageUrl' && meta.format === 'svg') throw new Error('Social image must be PNG, JPEG or WebP');
    result.push({ key, bytes, path, target: `_brand/${hash(bytes)}${extension}` });
  }
  return result;
}
export async function prepareBrandAssets(root, config) {
  const assets = await validateBrandAssets(root, config);
  const result = structuredClone(config);
  for (const { key, bytes, target } of assets) {
    mkdirSync(join(root, '_brand'), { recursive: true });
    writeFileSync(join(root, target), bytes);
    const keys = key.split('.'); let owner = result;
    for (const part of keys.slice(0, -1)) owner = owner[part];
    owner[keys.at(-1)] = target;
  }
  return result;
}
/** Public pages receive only validated identity/branding and locally copied presentation assets. */
export function projectStandaloneBrand(directory, assetRoot, config, base) {
  const path = join(directory, 'index.html');
  if (!existsSync(path)) return false;
  const brand = resolveDeploymentBrand(config);
  mkdirSync(join(directory, '_brand'), { recursive: true });
  const publicConfig = structuredClone(brand.publicConfig);
  // Never publish an arbitrary external navigation capability on an unauthenticated page.
  if (publicConfig.branding?.attribution?.url && /^https?:/.test(publicConfig.branding.attribution.url)) {
    const origin = new URL(publicConfig.branding.attribution.url).origin;
    if (config.egress?.mode !== 'allow-listed' || !config.egress.allow?.some(rule => rule.origin === origin && rule.purposes?.includes('documentation'))) delete publicConfig.branding.attribution.url;
  }
  const publicBrand = resolveDeploymentBrand(publicConfig);
  // Include defaults as well; authenticated application assets are not accessible from /present/.
  const paths = new Set([publicBrand.logoUrl, publicBrand.splash.logoUrl, publicBrand.faviconUrl, ...Object.values(publicBrand.icons), publicBrand.social.imageUrl].filter(Boolean));
  const replacements = new Map();
  for (const source of paths) {
    let file;
    try { file = assetFile(assetRoot, source); } catch {
      if (entries(publicConfig).some(([, value]) => value === source)) throw new Error('Standalone page is missing a configured brand asset');
      continue;
    }
    const bytes = readFileSync(file), target = `_brand/${hash(bytes)}${extname(file).toLowerCase()}`;
    writeFileSync(join(directory, target), bytes); replacements.set(source, target);
  }
  publicConfig.identity.logoUrl = replacements.get(publicBrand.logoUrl) ?? publicBrand.logoUrl;
  publicConfig.identity.faviconUrl = replacements.get(publicBrand.faviconUrl) ?? publicBrand.faviconUrl;
  publicConfig.branding = { schemaVersion: 1, ...publicConfig.branding,
    splash: { ...publicConfig.branding?.splash, logoUrl: replacements.get(publicBrand.splash.logoUrl) ?? publicBrand.splash.logoUrl },
    icons: Object.fromEntries(Object.entries(publicBrand.icons).map(([key, value]) => [key, replacements.get(value) ?? value])),
    ...(publicBrand.social.imageUrl && { social: { ...publicConfig.branding?.social, imageUrl: replacements.get(publicBrand.social.imageUrl) ?? publicBrand.social.imageUrl } }),
  };
  const css = brandStyles(resolveDeploymentBrand(publicConfig));
  const cssPath = `_brand/theme-${hash(css)}.css`;
  writeFileSync(join(directory, cssPath), css);
  writeFileSync(path, projectBrandHtml(readFileSync(path, 'utf8'), { ...publicConfig, defaults: { locale: config.defaults?.locale } }, { base, styleHref: brandAssetHref(cssPath, base) }));
  return true;
}
export async function prepareBrandDelivery({ input, output, settings, assets, base = '/', pageUrl }) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be a slash-delimited deployment path');
  const source = resolve(input), destination = resolve(output);
  if (existsSync(destination) || destination.startsWith(source + sep)) throw new Error('Brand delivery output must be a fresh directory outside the input');
  const config = JSON.parse(readFileSync(settings ?? join(source, 'settings.json'), 'utf8'));
  mkdirSync(dirname(destination), { recursive: true });
  const stage = mkdtempSync(join(dirname(destination), '.rv-brand-stage-'));
  try {
    const safeCopy = { recursive: true, dereference: false, filter(path) { if (lstatSync(path).isSymbolicLink()) throw new Error('Delivery inputs must not contain symbolic links'); return true; } };
    cpSync(source, stage, safeCopy);
    if (assets) cpSync(resolve(assets), join(stage, 'brand'), safeCopy);
    const resolved = await prepareBrandAssets(stage, config);
    writeFileSync(join(stage, 'settings.json'), JSON.stringify(resolved, null, 2) + '\n');
    if (!applyDeploymentProfile(stage, { base, pageUrl })) throw new Error('Missing application index/settings');
    // Profile projection can tighten egress; publish against the effective settings.
    const effective = JSON.parse(readFileSync(join(stage, 'settings.json'), 'utf8'));
    projectStandaloneBrand(join(stage, 'present'), stage, effective, `${base}present/`);
    // Keep byte-for-byte application bundles; only these owned delivery surfaces change.
    renameSync(stage, destination);
    return destination;
  } catch (error) { rmSync(stage, { recursive: true, force: true }); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2].replace(/^--/, ''), process.argv[3 + i * 2]]));
  if (!args.input || !args.output) throw new Error('Usage: node scripts/prepare-brand-delivery.mjs --input dist --output NEW_DIRECTORY [--settings FILE] [--assets DIRECTORY] [--base /twin/] [--page-url URL]');
  console.log(await prepareBrandDelivery({ ...args, pageUrl: args['page-url'] }));
}
