// SPDX-License-Identifier: AGPL-3.0-only
/** Production first-paint, UI, subpath, protected shell and file:// brand regression. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { chromium, expect } from 'playwright/test';
import sharp from 'sharp';
import { build } from 'esbuild';
import { prepareBrandDelivery } from './prepare-brand-delivery.mjs';
const root = await mkdtemp(join(tmpdir(), 'rv-brand-e2e-'));
const artifacts = resolve('test-results/white-label'); await mkdir(artifacts, { recursive: true });
const assets = join(root, 'assets'); await mkdir(assets);
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#cc5500' } }).png().toFile(join(assets, 'logo.png'));
const png = await readFile(join(assets, 'logo.png'));
function model() {
  const binary = Buffer.from(new Float32Array([-1,0,0, 1,0,0, 0,2,0]).buffer);
  const metadata = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Amber fixture', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.8,0.3,0.1,1], metallicFactor: 0 } }],
    buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: binary.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1,0,0], max: [1,2,0] }] }));
  const json = Buffer.alloc(Math.ceil(metadata.length / 4) * 4, 32); metadata.copy(json);
  const bytes = Buffer.alloc(28 + json.length + binary.length); [0x46546c67, 2, bytes.length, json.length, 0x4e4f534a].forEach((n, i) => bytes.writeUInt32LE(n, i * 4)); json.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + json.length); bytes.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(bytes, 28 + json.length); return bytes;
}
const config = {
  schemaVersion: 2, defaultModel: 'brand-model.glb', disableOpenerMessages: true,
  defaults: { locale: 'en-US', workspace: { default: 'viewer' } },
  identity: { productName: 'Factory Amber', shortName: 'Amber', logoUrl: 'brand/logo.png', primaryColor: '#cc5500', secondaryColor: '#339966' },
  branding: { schemaVersion: 1, browserTitle: 'Factory Amber Twin', theme: { surfaceColor: '#18232b', textColor: '#eeeeee' },
    splash: { animation: 'none', backgroundColor: '#18232b', tagline: { 'zh-CN': '琥珀工厂', 'en-US': 'Amber production' } },
    attribution: { visible: true, text: { 'zh-CN': '客户技术', 'en-US': 'Customer technology' } }, social: { imageUrl: 'brand/logo.png' } },
};
const settings = join(root, 'settings.json'); await writeFile(settings, JSON.stringify(config));
let browser, server;
const external = [], errors = [], failed = [];
try {
  const output = await prepareBrandDelivery({ input: 'dist', output: join(root, 'release'), settings, assets, base: '/twin/', pageUrl: 'https://brand.example.test/twin/' });
  await mkdir(join(output, 'models'), { recursive: true });
  await writeFile(join(output, 'models/brand-model.glb'), model());
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/access/v1/session') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":{"code":"UNAUTHENTICATED"}}'); return; }
    if (!path.startsWith('/twin/')) { res.writeHead(404); res.end(); return; }
    try {
      const file = resolve(output, path.slice('/twin/'.length) || 'index.html');
      if (!file.startsWith(output + sep)) throw new Error();
      const full = (await stat(file)).isDirectory() ? join(file, 'index.html') : file;
      res.setHeader('Content-Type', mime[extname(full)] ?? 'application/octet-stream');
      if (path.startsWith('/twin/present/')) res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'self'");
      res.end(await readFile(full));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // The HTML shell is branded even while the main application cannot execute.
  const shell = await browser.newContext(); const first = await shell.newPage();
  await first.route('**/assets/*.js', route => route.abort());
  await first.goto(origin + '/twin/');
  await expect(first).toHaveTitle('Factory Amber Twin');
  await expect(first.locator('.loader-brand')).toHaveText('Factory Amber');
  await expect(first.locator('.loader-slogan')).toHaveText('Amber production');
  assert.equal(await first.locator('#loading-overlay').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(24, 35, 43)');
  await first.screenshot({ path: join(artifacts, 'first-paint.png') }); await shell.close();
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__brandCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.__brandCspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`));
  });
  context.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url()); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && /(?:_brand\/|brand-model\.glb)/.test(response.url())) errors.push(`Missing fixture/brand resource: ${new URL(response.url()).pathname}`); });
  page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failed.push(new URL(request.url()).pathname); });
  await page.goto(origin + '/twin/?mode=viewer');
  await expect(page.getByTestId('model-load-feedback')).toHaveAttribute('data-phase', 'ready', { timeout: 90000 });
  await expect(page.locator('#react-root img[alt="Amber"]')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('brand-attribution')).toHaveText('Customer technology');
  await expect(page).toHaveTitle('Factory Amber Twin');
  const manifest = await (await page.request.get(origin + '/twin/manifest.json')).json();
  assert.equal(manifest.name, 'Factory Amber'); assert.equal(manifest.scope, '/twin/');
  await page.reload();
  await expect(page.getByTestId('model-load-feedback')).toHaveAttribute('data-phase', 'ready', { timeout: 90000 });
  await expect(page.getByTestId('brand-attribution')).toHaveText('Customer technology');
  const footer = await page.getByTestId('brand-attribution').boundingBox();
  const controls = await page.getByRole('button').filter({ hasText: /^VR$/ }).boundingBox();
  assert.ok(footer && controls && footer.y + footer.height < controls.y, 'attribution must clear viewport controls');
  await page.screenshot({ path: join(artifacts, 'application.png') });
  assert.deepEqual(await page.evaluate(() => window.__brandCspViolations), []);
  // Strict access CSP and no settings fetch: brand lives in a whitelisted public snapshot.
  const accessHits = [];
  const access = await context.newPage(); access.on('request', r => accessHits.push(new URL(r.url()).pathname)); access.on('pageerror', error => errors.push(error.message));
  await access.goto(origin + '/twin/present/');
  await expect(access.locator('header strong')).toHaveText('Factory Amber');
  await expect(access.locator('header img')).toBeVisible();
  assert.equal(await access.locator('header img').evaluate(image => image.naturalWidth), 512);
  await expect(access).toHaveTitle('Factory Amber Twin');
  await expect(access.locator('footer')).toContainText('Customer technology');
  assert.deepEqual(await access.evaluate(() => window.__brandCspViolations), []);
  assert.ok(!accessHits.some(path => path.endsWith('/settings.json')));
  await access.screenshot({ path: join(artifacts, 'access.png') });
  await context.close();
  const compiled = await build({ entryPoints: ['src/core/demo-package/html.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  const packager = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  const manifestPlayer = JSON.parse(await readFile('dist/demo-player/demo-player.json', 'utf8'));
  const runtime = { manifest: manifestPlayer, player: new Uint8Array(await readFile('dist/demo-player/demo-player.js')), source: new Uint8Array(await readFile('dist/demo-player/demo-player-source.zip')) };
  const recipe = { schemaVersion: 1, title: 'Amber demo', locale: 'en-US', loop: false, startCamera: { position: [3,2,1], target: [0,0,0], fov: 50 }, steps: [] };
  const demo = packager.createDemoHtml(recipe, new Uint8Array(model()), runtime, manifestPlayer.version, { config, logoDataUrl: 'data:image/png;base64,' + png.toString('base64') });
  const file = join(root, 'branded-demo.html'); await writeFile(file, demo);
  const offline = await browser.newContext({ offline: true }); const demoPage = await offline.newPage(); const network = [];
  demoPage.on('pageerror', error => errors.push(error.message));
  demoPage.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await demoPage.goto(pathToFileURL(file).href); await expect(demoPage).toHaveTitle('Factory Amber Twin');
  await expect(demoPage.locator('header img')).toBeVisible(); await expect(demoPage.locator('footer')).toContainText('Customer technology');
  await expect(demoPage.locator('#reset')).toBeEnabled({ timeout: 30000 });
  assert.equal(await demoPage.locator('header img').evaluate(image => image.naturalWidth), 512);
  assert.deepEqual(network, []); await demoPage.screenshot({ path: join(artifacts, 'offline-demo.png') }); await offline.close();
  assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ passed: true, checks: ['first paint without app JS', 'main UI', 'reload', 'subdirectory', 'manifest', 'strict-CSP access shell', 'public brand isolation', 'file:// branded demo'], externalRequests: external.length, errors, failed }, null, 2));
  console.log('PASS: production white-label journey, subdirectory, strict access CSP and offline branded demo');
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
  await rm(root, { recursive: true, force: true });
}
