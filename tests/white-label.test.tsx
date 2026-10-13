// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setDeploymentBranding, setCustomBranding, clearCustomBranding, useCustomBranding, getBrandingDiagnostics } from '../src/core/hmi/branding-store';
import { BrandAttribution } from '../src/core/hmi/BrandAttribution';
import { BrandImage } from '../src/core/hmi/BrandImage';
import { createBrandedTheme } from '../src/core/hmi/theme';
import { applyDeploymentIdentityToDocument } from '../src/core/deployment/deployment-identity';
import { initI18n, setLocale } from '../src/core/i18n';
import { DEFAULT_BRAND_TEXT, resolveDeploymentBrand } from '../src/core/deployment/brand-config.mjs';
import { zhCN } from '../src/core/i18n/catalogs/zh-CN';
import { enUS } from '../src/core/i18n/catalogs/en-US';
import { getAppConfig, setAppConfig } from '../src/core/rv-app-config';
import { runtimeFetch } from '../src/core/deployment/runtime-egress';
import { loadDemoBrand } from '../src/core/demo-package/demo-brand';

vi.mock('../src/core/deployment/runtime-egress', async importOriginal => ({
  ...await importOriginal<typeof import('../src/core/deployment/runtime-egress')>(), runtimeFetch: vi.fn(),
}));
const originalConfig = getAppConfig();

beforeAll(() => { initI18n(); });
afterEach(() => { cleanup(); setDeploymentBranding(null); clearCustomBranding(); setAppConfig(originalConfig); vi.restoreAllMocks(); vi.mocked(runtimeFetch).mockReset(); document.documentElement.removeAttribute('data-rv-brand-base'); document.documentElement.removeAttribute('data-rv-brand-animation'); document.documentElement.removeAttribute('style'); });
function Probe() { const brand = useCustomBranding(); return <span data-testid="probe">{brand?.productName}|{brand?.primaryColor}|{brand?.title}</span>; }
describe('white-label UI authority and behavior', () => {
  it('rejects project identity/color overrides and restores deployment after project disposal', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setDeploymentBranding({ productName: 'Factory', primaryColor: '#123456', logoUrl: 'brand/logo.png' });
    render(<Probe />);
    act(() => setCustomBranding({ productName: 'Hijack', primaryColor: '#ff0000', title: 'Line 1', titleBar: true }));
    expect(screen.getByTestId('probe').textContent).toBe('Factory|#123456|Line 1');
    expect(getBrandingDiagnostics()).toEqual(['Project branding cannot override deployment identity']);
    act(() => clearCustomBranding()); expect(screen.getByTestId('probe').textContent).toBe('Factory|#123456|');
    act(() => setDeploymentBranding({ productName: 'Second customer', primaryColor: '#abcdef' }));
    expect(screen.getByTestId('probe').textContent).toBe('Second customer|#abcdef|');
  });
  it('localizes attribution, hides it on demand and never renders configuration as markup', async () => {
    await setLocale('zh-CN');
    setDeploymentBranding({}, { schemaVersion: 1, attribution: { visible: true, text: { 'zh-CN': '客户支持', 'en-US': '<script>Brand</script>' } } });
    render(<BrandAttribution />); expect(screen.getByTestId('brand-attribution').textContent).toBe('客户支持');
    await act(() => setLocale('en-US')); expect(screen.getByTestId('brand-attribution').textContent).toBe('<script>Brand</script>');
    expect(screen.getByTestId('brand-attribution').querySelector('script')).toBeNull();
    act(() => setDeploymentBranding({}, { schemaVersion: 1, attribution: { visible: false } })); expect(screen.queryByTestId('brand-attribution')).toBeNull();
  });
  it('falls back visibly on image errors and recovers on a new image source', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<BrandImage src="data:image/png;base64,broken" name="Factory" />);
    fireEvent.error(screen.getByRole('img')); expect(screen.getByRole('img').tagName).toBe('SPAN');
    view.rerender(<BrandImage src="data:image/png;base64,another" name="Factory B" />); expect(screen.getByRole('img').tagName).toBe('IMG');
  });
  it('applies deployment A then B without stale title, links, splash or theme', () => {
    const host = document.createElement('section');
    host.innerHTML = '<h1 data-rv-product-name>Old</h1><div class="loader-slogan"></div><img data-rv-logo><link rel="apple-touch-icon" data-rv-favicon><meta data-rv-title><meta name="theme-color">';
    document.body.append(host); document.documentElement.setAttribute('data-rv-brand-base', '/twin/'); document.documentElement.lang = 'en-US';
    try {
      for (const name of ['Factory A', 'Factory B']) {
        applyDeploymentIdentityToDocument({ schemaVersion: 2, identity: { productName: name, logoUrl: 'brand/logo.svg', faviconUrl: 'brand/fav.png', primaryColor: '#123456' }, branding: { schemaVersion: 1, browserTitle: name, icons: { appleTouchUrl: 'brand/apple.png' }, splash: { tagline: { 'zh-CN': name }, animation: 'none' } } });
        expect(document.title).toBe(name); expect(host.querySelector('h1')?.textContent).toBe(name);
        expect(host.querySelector('.loader-slogan')?.textContent).toBe(name);
        expect(host.querySelector('link')?.getAttribute('href')).toBe('/twin/brand/apple.png');
        expect(host.querySelector('img')?.getAttribute('src')).toBe('/twin/brand/logo.svg');
        expect(document.documentElement.style.getPropertyValue('--rv-brand-primary')).toBe('#123456');
      }
    } finally { host.remove(); }
  });
  it('retains semantic alert colors while applying brand palette and contrast text', () => {
    const theme = createBrandedTheme('#123456', '#654321', { surfaceColor: '#202020', textColor: '#eeeeee', mutedTextColor: '#bbbbbb', borderColor: '#444444' });
    expect(theme.palette.primary.main).toBe('#123456'); expect(theme.palette.background.paper).toBe('#202020');
    expect(theme.palette.text.primary).toBe('#eeeeee'); expect(theme.palette.error.main).toBe('#ef5350');
    expect(resolveDeploymentBrand().attribution.visible).toBe(false);
  });
  it('keeps portable preboot strings synchronized with the central language catalogs', () => {
    expect(DEFAULT_BRAND_TEXT.tagline).toEqual({ 'zh-CN': zhCN.preboot.slogan, 'en-US': enUS.preboot.slogan });
    expect(DEFAULT_BRAND_TEXT.attribution).toEqual({ 'zh-CN': zhCN.shell.login.poweredBy, 'en-US': enUS.shell.login.poweredBy });
  });
  it('freezes public demo branding with a real rasterized logo and releases the object URL', async () => {
    setAppConfig({ schemaVersion: 2, defaultModel: 'private.glb', identity: { productName: 'Factory', logoUrl: 'brand/logo.png' } });
    const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 350;
    canvas.getContext('2d')!.fillRect(0, 0, 700, 350);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!)));
    vi.mocked(runtimeFetch).mockResolvedValue(new Response(blob, { headers: { 'content-type': 'image/png' } }));
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const snapshot = await loadDemoBrand(new AbortController().signal);
    expect(snapshot?.config).toEqual({ schemaVersion: 2, identity: { productName: 'Factory', logoUrl: 'brand/logo.png' } });
    expect(JSON.stringify(snapshot)).not.toContain('private.glb'); expect(revoke).toHaveBeenCalledOnce();
    const image = new Image(); image.src = snapshot!.logoDataUrl; await image.decode();
    expect([image.naturalWidth, image.naturalHeight]).toEqual([512, 256]);
  });
  it('rejects missing and oversized demo logos without creating a partial snapshot', async () => {
    setAppConfig({ schemaVersion: 2, identity: { productName: 'Factory' } });
    vi.mocked(runtimeFetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(loadDemoBrand(new AbortController().signal)).rejects.toThrow();
    vi.mocked(runtimeFetch).mockResolvedValue(new Response('x', { headers: { 'content-length': String(5 * 1024 * 1024) } }));
    await expect(loadDemoBrand(new AbortController().signal)).rejects.toThrow();
  });
  it('never returns a demo brand when export was canceled during the fetch', async () => {
    setAppConfig({ schemaVersion: 2, identity: { productName: 'Factory' } });
    const controller = new AbortController();
    vi.mocked(runtimeFetch).mockImplementation(async () => { controller.abort(); return new Response('bytes'); });
    await expect(loadDemoBrand(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
