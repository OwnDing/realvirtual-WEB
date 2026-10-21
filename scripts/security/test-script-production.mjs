// SPDX-License-Identifier: AGPL-3.0-only
// Actual production entry point, synthetic GLB, loopback-only Chromium traffic.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, expect } from 'playwright/test';
import { offlineProfile } from '../offline-profile.mjs';

const root = resolve('dist');
const output = resolve('test-results/security');
await mkdir(output, { recursive: true });
await readFile(resolve(root, 'index.html')); // missing build must fail before launch
function model(name) {
  const binary = Buffer.from(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]).buffer);
  const metadata = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, extras: { realvirtual: { NodeId: `security-${name}`, WebComponent: { Code: 'function setup(self){ self.log("SECURITY_SETUP"); return {}; }' } } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: binary.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }],
  };
  const text = Buffer.from(JSON.stringify(metadata));
  const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(json);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, binary]);
}
let denied = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/settings.json') {
      res.setHeader('Content-Type', types['.json']);
      res.end(JSON.stringify(offlineProfile({ schemaVersion: 2, defaults: { locale: 'en-US' }, ...(denied ? { scripting: { sandbox: false, native: false } } : {}) })));
      return;
    }
    if (path === '/security.glb' || path === '/other.glb') {
      res.setHeader('Content-Type', types['.glb']); res.end(model(path === '/security.glb' ? 'SecurityTriangle' : 'OtherTriangle')); return;
    }
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root + sep)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, currentPage;
const checks = [], errors = [], externalRequests = [];
let failure = null;
try {
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (denied of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalRequests.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    let executions = 0;
    page.on('console', message => {
      if (message.text().includes('SECURITY_SETUP')) executions++;
      if (['warning', 'error'].includes(message.type())) console.error(`[browser] ${message.text()}`);
    });
    await page.addInitScript(() => { localStorage.setItem('rv-welcome-dismissed', '1'); localStorage.setItem('rv-auto-quality-applied', '1'); });
    await page.goto(`${origin}/?model=security.glb&scripts`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.viewer?.currentModelRoot?.getObjectByName('SecurityTriangle'), undefined, { timeout: 60000 });
    console.log(`Loaded synthetic script model (deployment denial: ${denied})`);
    const ok = page.getByRole('button', { name: 'OK', exact: true });
    if (await ok.isVisible()) await ok.click();
    const state = () => page.evaluate(() => {
      const plugin = window.viewer.getPlugin('web-component');
      return { allowed: plugin.scriptsAllowed, count: plugin.instances.length };
    });
    assert.deepEqual(await state(), { allowed: false, count: 0 });
    assert.equal(executions, 0);
    await page.getByTestId('script-enable').click();
    if (denied) {
      assert.deepEqual(await state(), { allowed: false, count: 0 });
      assert.equal(executions, 0); checks.push('deployment denial overrides explicit confirmation');
    } else {
      await expect.poll(async () => (await state()).count).toBe(1);
      assert.equal(executions, 1); checks.push('URL request is inert; explicit UI confirmation executes once');
      await page.evaluate(() => window.viewer.getPlugin('web-component').setAllowScripts(false));
      assert.deepEqual(await state(), { allowed: false, count: 0 }); checks.push('revocation disposes live instances');
      await page.evaluate(() => window.viewer.loadModel(new URL('/other.glb', location.href).href));
      await page.waitForFunction(() => window.viewer.currentModelRoot?.getObjectByName('OtherTriangle'));
      assert.deepEqual(await state(), { allowed: false, count: 0 });
      assert.equal(executions, 1); checks.push('new model requires fresh confirmation');
    }
    await page.screenshot({ path: resolve(output, denied ? 'script-deployment-denial.png' : 'script-revocation.png') });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log(`PASS: ${checks.join('; ')}`);
} catch (error) {
  failure = String(error.stack ?? error);
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: resolve(output, 'script-production-failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, 'script-production.json'), JSON.stringify({ generatedAt: new Date().toISOString(), status: failure ? 'failed' : 'passed', failure, checks, errors, externalRequests }, null, 2));
  await browser?.close();
  await new Promise(r => server.close(r));
}
