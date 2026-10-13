// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { resolveDeploymentBrand, parseBranding, brandAssetPath, localizeBrandText } from '../src/core/deployment/brand-config.mjs';
import { validateDeploymentConfig, migrateDeploymentConfigV1ToV2 } from '../src/core/deployment/deployment-config';
import { projectDeploymentProfile } from '../scripts/apply-deployment-profile.mjs';
import { validateBrandAssets, prepareBrandDelivery, projectStandaloneBrand } from '../scripts/prepare-brand-delivery.mjs';

const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function directory() { const path = mkdtempSync(join(tmpdir(), 'rv-white-label-')); roots.push(path); return path; }
const config = (name = 'Plant A', primary = '#1667CC') => ({ schemaVersion: 2, identity: { productName: name, logoUrl: 'brand/logo.png', primaryColor: primary },
  branding: { schemaVersion: 1, browserTitle: name, splash: { tagline: { 'zh-CN': '工厂', 'en-US': 'Plant' }, animation: 'none' },
    attribution: { visible: true, text: 'Powered by the customer' }, icons: { pwa192Url: 'brand/icon.png' }, social: { imageUrl: 'brand/logo.png' } } });
const html = readFileSync('index.html', 'utf8');
async function fixture() {
  const root = directory(); mkdirSync(join(root, 'brand')); mkdirSync(join(root, 'present')); mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), html); writeFileSync(join(root, 'present/index.html'), '<html><head><title>Access</title></head><body><h1 data-rv-product-name>Old</h1></body></html>');
  await sharp({ create: { width: 192, height: 192, channels: 4, background: '#1667CC' } }).png().toFile(join(root, 'brand/logo.png'));
  writeFileSync(join(root, 'brand/icon.png'), readFileSync(join(root, 'brand/logo.png')));
  writeFileSync(join(root, 'settings.json'), JSON.stringify(config())); writeFileSync(join(root, 'assets/app.js'), '/* unchanged application */');
  return root;
}
describe('deployment white-label contract', () => {
  it('preserves old defaults, rejects future versions, migrates without activating reserved branding', () => {
    expect(resolveDeploymentBrand().productName).toBe('XYvirtual WEB');
    expect(resolveDeploymentBrand({ schemaVersion: 1, branding: config().branding }).attribution.visible).toBe(false);
    expect(resolveDeploymentBrand({ schemaVersion: 99, identity: { productName: 'Unknown' } }).productName).toBe('XYvirtual WEB');
    expect(migrateDeploymentConfigV1ToV2({ schemaVersion: 1, branding: config().branding, extension: { keep: true } })).toEqual({ schemaVersion: 2, extension: { keep: true } });
    expect(validateDeploymentConfig({ schemaVersion: 99, branding: config().branding }).config.branding).toBeUndefined();
  });
  it('parses idempotently, retains unrelated fields, and matches the static/runtime brand', () => {
    const raw = { ...config(), extension: { keep: true } }, before = structuredClone(raw);
    const a = validateDeploymentConfig(raw), b = validateDeploymentConfig({ ...a.config });
    expect(a.config).toEqual(b.config); expect(b.issues).toEqual([]); expect(raw).toEqual(before);
    expect(resolveDeploymentBrand(a.config)).toEqual(resolveDeploymentBrand(raw));
    expect(parseBranding({ schemaVersion: 4 })).toBeUndefined();
  });
  it('ignores malformed individual values with field-only diagnostics and language fallback', () => {
    const issues: string[] = [];
    const b = resolveDeploymentBrand({ schemaVersion: 2, branding: { schemaVersion: 1, theme: { surfaceColor: 'red;url(secret)' }, splash: { tagline: { 'zh-CN': '工厂' }, animation: 'script' } } }, issues);
    expect(b.theme.surfaceColor).toBeUndefined(); expect(b.splash.animation).toBe('orbit'); expect(issues.join(' ')).not.toContain('secret');
    expect(localizeBrandText(b.splash.tagline, 'en-US')).toBe('工厂'); expect(localizeBrandText('', 'en-US')).toBe('');
    const englishOnly = resolveDeploymentBrand({ schemaVersion: 2, branding: { schemaVersion: 1, splash: { tagline: { 'en-US': 'Factory' } } } });
    expect(localizeBrandText(englishOnly.splash.tagline, 'zh-CN')).toBe('开放、轻量、工业级、随处可用。');
  });
  it.each(['//evil.test/x', 'https://evil.test/a', 'data:image/png;base64,x', '../logo.png', 'x/../logo.png', 'x\\logo.png', '%2e%2e/a', '/\\evil.test/a', 'x?token=secret', 'a\n.png'])('rejects unsafe asset path %s', value => {
    expect(brandAssetPath(value)).toBeUndefined();
  });
  it('escapes HTML/JSON including replacement metacharacters and is repeatable', () => {
    const raw = config('Plant $& </script><script>bad()</script> " < &');
    const projected = projectDeploymentProfile(html, raw);
    expect(projected).not.toContain('<script>bad()'); expect(projected).toContain('Plant $&amp;');
    expect(projectDeploymentProfile(projected, raw)).toBe(projected);
    expect(projected).toContain('data-rv-en-us="Plant"');
    expect(projected).toContain('data-rv-brand-animation="none"');
  });
  it('removes a previous public URL when assembling a private release and preserves legal metadata', () => {
    const publicPage = projectDeploymentProfile(html, config(), { pageUrl: 'https://old.example.test/' });
    const privatePage = projectDeploymentProfile(publicPage, config('Private factory'));
    expect(privatePage).not.toContain('old.example.test');
    expect(privatePage).toContain('https://www.gnu.org/licenses/agpl-3.0.html');
  });
  it('keeps schema asset paths aligned with accepted and rejected runtime inputs', () => {
    const schema = JSON.parse(readFileSync('schema/v1/branding.json', 'utf8'));
    const pattern = new RegExp(schema.properties.splash.properties.logoUrl.pattern);
    for (const value of ['brand/logo.png', '/brand/logo.svg', '品牌/logo.png', '../a', 'a/../b', 'a b.png', '//host/a', 'https://host/a', 'a\\\\b', '%2f/a', 'x?key=y']) {
      expect(pattern.test(value), value).toBe(brandAssetPath(value) !== undefined);
    }
  });
  it('keeps attribution URL schema constraints aligned with runtime and delivery inputs', () => {
    const schema = JSON.parse(readFileSync('schema/v1/branding.json', 'utf8')).properties.attribution.properties.url;
    for (const [value, accepted] of [
      ['about', true], ['/brand/about', true], ['品牌/支持', true],
      ['https://docs.example.test/about?q=a%20b#help', true], ['HTTP://localhost:8080/about', true],
      ['https://[::1]:8080/', true], ['javascript:alert(1)', false], ['data:text/html,x', false],
      ['relative path', false], ['../about', false], ['//elsewhere.test/about', false],
      ['https://user:password@host.test/', false], ['https://host.test/a b', false],
      ['https:host.test', false], ['https://host.test/\\\\evil', false], ['x'.repeat(501), false],
    ] as const) {
      const valid = (schema.anyOf ?? [schema]).some((branch: { maxLength: number; pattern?: string }) =>
        value.length <= branch.maxLength && (!branch.pattern || new RegExp(branch.pattern).test(value)));
      expect(valid, `schema: ${value}`).toBe(accepted);
      const issues: string[] = [];
      const brand = parseBranding({ schemaVersion: 1, attribution: { url: value } }, issues);
      expect(brand?.attribution?.url !== undefined, `runtime: ${value}`).toBe(accepted);
      expect(issues.length === 0).toBe(accepted);
    }
  });
  it('builds two brands without changing app JS and keeps public projection free of private settings', async () => {
    const source = await fixture(); const outputParent = directory();
    for (const [name, primary] of [['Plant A', '#1667CC'], ['Plant B', '#DD5500']]) {
      const settings = join(outputParent, name + '.json');
      writeFileSync(settings, JSON.stringify({ ...config(name, primary), defaultModel: 'secret-customer.glb', license: { installId: 'secret-id' }, services: { news: { apiUrl: 'https://private.invalid' } } }));
      const output = await prepareBrandDelivery({ input: source, output: join(outputParent, name), settings, base: '/twin/', pageUrl: 'https://plant.example.test/twin/' });
      const page = readFileSync(join(output, 'index.html'), 'utf8'), access = readFileSync(join(output, 'present/index.html'), 'utf8');
      const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
      expect(page).toContain(`<title>${name}</title>`); expect(page).toContain(`--rv-brand-primary:${primary}`);
      expect(manifest).toMatchObject({ id: '/twin/', scope: '/twin/', start_url: '/twin/', name, theme_color: primary });
      expect(manifest.icons[0].src).toMatch(/^\/twin\/_brand\//);
      expect(page).toContain('https://plant.example.test/twin/_brand/');
      expect(access).toContain('/twin/present/_brand/'); expect(access).not.toContain('<style');
      for (const secret of ['secret-customer', 'secret-id', 'private.invalid', '"services"']) expect(access).not.toContain(secret);
      expect(readFileSync(join(output, 'assets/app.js'), 'utf8')).toBe('/* unchanged application */');
    }
    expect(readFileSync(join(source, 'index.html'), 'utf8')).toBe(html);
  });
  it('fails delivery on missing, wrong-sized, corrupt and escaped resources', async () => {
    const root = await fixture();
    await expect(validateBrandAssets(root, { ...config(), identity: { logoUrl: 'missing.png' } })).rejects.toThrow('Missing');
    await sharp({ create: { width: 32, height: 32, channels: 4, background: '#000000' } }).png().toFile(join(root, 'brand/icon.png'));
    await expect(validateBrandAssets(root, config())).rejects.toThrow('dimensions');
    writeFileSync(join(root, 'brand/logo.png'), 'not an image');
    await expect(validateBrandAssets(root, config())).rejects.toThrow('Unreadable');
    const outside = directory(); writeFileSync(join(outside, 'outside.png'), 'bytes');
    symlinkSync(join(outside, 'outside.png'), join(root, 'brand/escape.png'));
    await expect(validateBrandAssets(root, { schemaVersion: 2, identity: { logoUrl: 'brand/escape.png' } })).rejects.toThrow('unsafe');
  });
  it('rejects active SVG before image decoding and preserves output on failed assembly', async () => {
    const root = await fixture(); writeFileSync(join(root, 'brand/active.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script></svg>');
    const bad = { schemaVersion: 2, identity: { logoUrl: 'brand/active.svg' } };
    await expect(validateBrandAssets(root, bad)).rejects.toThrow('Active');
    const target = directory(); writeFileSync(join(target, 'user.txt'), 'keep');
    await expect(prepareBrandDelivery({ input: root, output: target })).rejects.toThrow('fresh');
    expect(readFileSync(join(target, 'user.txt'), 'utf8')).toBe('keep');
  });
  it('rejects mismatched image MIME and unauthorized public attribution links', async () => {
    const root = await fixture();
    writeFileSync(join(root, 'brand/fake.svg'), readFileSync(join(root, 'brand/logo.png')));
    await expect(validateBrandAssets(root, { schemaVersion: 2, identity: { logoUrl: 'brand/fake.svg' } })).rejects.toThrow('SVG');
    writeFileSync(join(root, 'brand/fake.jpg'), readFileSync(join(root, 'brand/logo.png')));
    await expect(validateBrandAssets(root, { schemaVersion: 2, identity: { logoUrl: 'brand/fake.jpg' } })).rejects.toThrow('format');
    const standalone = directory(); writeFileSync(join(standalone, 'index.html'), html);
    const configured = { ...config(), defaults: { locale: 'en-US' }, branding: { ...config().branding, attribution: { visible: true, url: 'https://blocked.example.test/about' } } };
    projectStandaloneBrand(standalone, root, configured, '/present/');
    const page = readFileSync(join(standalone, 'index.html'), 'utf8');
    expect(page).not.toContain('blocked.example.test'); expect(page).toContain('lang="en-US"');
  });
  it('projects Appliance pages with local resource and stylesheet routes', async () => {
    const root = await fixture(), standalone = directory(); writeFileSync(join(standalone, 'index.html'), html);
    expect(projectStandaloneBrand(standalone, root, config(), '/appliance/')).toBe(true);
    const page = readFileSync(join(standalone, 'index.html'), 'utf8');
    expect(page).toContain('/appliance/_brand/theme-'); expect(page).toContain('data-rv-brand-base="/appliance/"');
  });
  it('uses the final offline policy when publishing public attribution links', async () => {
    const root = await fixture(), parent = directory();
    const configured = { ...config(), egress: { mode: 'allow-listed', allow: [{ origin: 'https://docs.example.test', purposes: ['documentation'] }] },
      branding: { ...config().branding, attribution: { visible: true, url: 'https://docs.example.test/about' } } };
    writeFileSync(join(root, 'settings.json'), JSON.stringify(configured));
    const oldProfile = process.env.RV_DEPLOYMENT_PROFILE;
    process.env.RV_DEPLOYMENT_PROFILE = 'offline';
    try {
      const output = await prepareBrandDelivery({ input: root, output: join(parent, 'release') });
      expect(readFileSync(join(output, 'present/index.html'), 'utf8')).not.toContain('docs.example.test');
      expect(JSON.parse(readFileSync(join(output, 'settings.json'), 'utf8')).egress.mode).toBe('deny-external');
    } finally {
      if (oldProfile === undefined) delete process.env.RV_DEPLOYMENT_PROFILE; else process.env.RV_DEPLOYMENT_PROFILE = oldProfile;
    }
  });
});
