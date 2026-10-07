// SPDX-License-Identifier: AGPL-3.0-only
// Real production IIFE + packager, copied file:// in a fresh offline Chromium context.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';
import { crc32, deflateSync } from 'node:zlib';
import { chromium, expect } from 'playwright/test';
const artifacts = resolve('test-results/demo-package'); await mkdir(artifacts, { recursive: true });
const compiled = await build({ entryPoints: ['src/core/demo-package/html.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const packager = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const manifest = JSON.parse(await readFile('dist/demo-player/demo-player.json', 'utf8'));
const runtime = { manifest, player: new Uint8Array(await readFile('dist/demo-player/demo-player.js')), source: new Uint8Array(await readFile('dist/demo-player/demo-player-source.zip')) };
const archive = await JSZip.loadAsync(runtime.source);
for (const path of ['LICENSE', 'README-DEMO.txt', 'package-lock.json', 'tsconfig.json', 'vite.demo-player.config.ts', 'scripts/build-demo-player.mjs', 'src/demo-package/player.ts', 'schema/v1/rv-odt.json']) assert.ok(archive.file(path), `Missing corresponding source: ${path}`);
for (const path of Object.keys(archive.files)) assert.ok(!/^(?:public|projects|node_modules|\.env|realvirtual-web-pro)\//.test(path) && !path.includes('..'), `Unexpected archive member: ${path}`);
function model() {
  // A real embedded PNG is essential: a missing texture makes the triangle white,
  // so the green-pixel assertion also proves offline texture decoding/rendering.
  const chunk = (type, payload) => {
    const body = Buffer.concat([Buffer.from(type), payload]), header = Buffer.alloc(4), crc = Buffer.alloc(4);
    header.writeUInt32BE(payload.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([header, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0,25,220,80,255]))), chunk('IEND', Buffer.alloc(0))]);
  const content = Buffer.concat([Buffer.from(new Float32Array([-1,0,0, 1,0,0, 0,2,0]).buffer), Buffer.from(new Float32Array([0,0, 1,0, 0.5,1]).buffer), png]);
  const binary = Buffer.alloc(Math.ceil(content.length / 4) * 4); content.copy(binary);
  const metadata = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'DemoTriangle', mesh: 0, extras: { realvirtual: { NodeId: 'triangle-stable' } } }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }], materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 } }], textures: [{ source: 0 }], images: [{ bufferView: 2, mimeType: 'image/png' }], buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: png.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1,0,0], max: [1,2,0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }] };
  const text = Buffer.from(JSON.stringify(metadata)), json = Buffer.alloc(Math.ceil(text.length/4)*4, 32); text.copy(json);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+binary.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,binary]);
}
const startCamera = { position: [0,1,6], target: [0,1,0], fov: 50 };
const recipe = { schemaVersion: 1, title: 'Offline demo fixture', locale: 'en-US', startCamera, loop: false, steps: [
  { id: 'overview', title: 'Overview', description: '</script><img src=https://invalid.example>', camera: startCamera, durationMs: 0, dwellMs: 1000 },
  { id: 'side', title: 'Side view', description: 'A second camera', camera: { ...startCamera, position: [4,2,4], fov: 40 }, durationMs: 200, dwellMs: 1000 },
] };
const html = packager.createDemoHtml(recipe, new Uint8Array(model()), runtime, manifest.version);
const path = join(artifacts, 'offline-demo.html'); await writeFile(path, html);
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], network = [];
try {
  const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^(?:https?|wss?):/.test(r.url())) network.push(r.url()); });
  await page.addInitScript(() => {
    window.__demoViolations = [];
    document.addEventListener('securitypolicyviolation', e => window.__demoViolations.push(`${e.effectiveDirective}: ${e.blockedURI}`));
  });
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('body')).toHaveAttribute('data-demo-ready', 'true', { timeout: 60000 });
  await expect(page.locator('h1')).toHaveText(recipe.title);
  const initial = await page.locator('canvas').screenshot();
  const greenPixels = await page.evaluate(async png => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let green = 0; for (let i=0; i<pixels.length; i+=4) if (pixels[i+1] > pixels[i] * 1.3 && pixels[i+1] > pixels[i+2] * 1.3) green++;
    bitmap.close(); return green;
  }, initial.toString('base64'));
  assert.ok(greenPixels > 2000, `Expected rendered green geometry; got ${greenPixels} pixels`);
  await page.getByRole('button', { name: 'Next shot', exact: true }).click();
  await expect(page.locator('#caption')).toContainText(recipe.steps[0].description);
  assert.equal(await page.locator('img').count(), 0);
  await page.getByRole('button', { name: 'Next shot', exact: true }).click();
  await expect(page.locator('#caption')).toContainText('Side view');
  const side = await page.locator('canvas').screenshot(); assert.notDeepEqual(initial, side);
  await page.getByRole('button', { name: 'Play tour', exact: true }).click();
  await expect(page.locator('#caption')).toContainText('Overview');
  await expect(page.locator('#caption')).toContainText('Side view', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Play tour', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Play tour', exact: true }).click();
  await page.mouse.move(800,400); await page.mouse.down(); await page.mouse.move(900,430,{steps:5}); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Play tour', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Initial view', exact: true }).click();
  await expect(page.locator('#caption')).toBeEmpty();
  await page.getByRole('button', { name: 'Previous shot', exact: true }).click();
  await expect(page.locator('#caption')).toContainText('Side view');
  await page.getByRole('button', { name: 'Initial view', exact: true }).click();
  for (const [label, file] of [['Download tour recipe', 'tour.demo.json'], ['Download player source and licenses', 'source.zip']]) {
    const pending = page.waitForEvent('download'); await page.getByRole('link', { name: label, exact: true }).click(); const download = await pending; await download.saveAs(join(artifacts, file));
  }
  assert.deepEqual(JSON.parse(await readFile(join(artifacts, 'tour.demo.json'), 'utf8')), recipe);
  assert.deepEqual(await readFile(join(artifacts, 'source.zip')), Buffer.from(runtime.source));
  await page.screenshot({ path: join(artifacts, 'offline-player.png') });
  assert.deepEqual(await page.evaluate(() => window.__demoViolations), []); assert.deepEqual(network, []); assert.deepEqual(errors, []);
  await context.close();
  // A modified/invalid package fails before WebGL/player construction and cannot fetch anything.
  const bad = join(artifacts, 'invalid-demo.html'); await writeFile(bad, html.replace('"schemaVersion":1', '"schemaVersion":2'));
  const invalid = await browser.newContext({ offline: true }); const badPage = await invalid.newPage();
  await badPage.goto(pathToFileURL(bad).href); await expect(badPage.getByRole('alert')).toContainText('Invalid tour recipe');
  assert.equal(await badPage.locator('body').getAttribute('data-demo-ready'), null); await invalid.close();
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ productionPlayer: manifest.sha256, greenPixels, offlineNetworkAttempts: network.length, browserErrors: errors, checks: ['file cold start', 'embedded PNG texture pixels', 'camera change', 'tour completion', 'manual takeover', 'reset', 'recipe/source downloads', 'caption injection', 'invalid package'] }, null, 2));
  console.log(`PASS: offline file:// demo; ${greenPixels} geometry pixels, no network attempts`);
} finally { await browser.close(); }
