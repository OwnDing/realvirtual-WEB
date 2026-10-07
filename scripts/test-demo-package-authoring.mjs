// SPDX-License-Identifier: AGPL-3.0-only
// Production workbench -> actual document-card export -> copied offline HTML.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from 'playwright/test';
import { offlineProfile } from './offline-profile.mjs';
const evidence = resolve('test-results/demo-package');
const fixture = await readFile(resolve(evidence, 'offline-demo.html'), 'utf8');
const data = JSON.parse(fixture.match(/id="rv-demo-data" type="application\/json">(.*?)<\/script>/s)[1]);
const model = Buffer.from(data.modelBase64, 'base64');
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.zip': 'application/zip' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/demo-base\//, '/');
    if (path === '/fixture.glb') { res.setHeader('Content-Type', types['.glb']); res.end(model); return; }
    if (path === '/settings.json') { res.setHeader('Content-Type', types['.json']); res.end(JSON.stringify(offlineProfile({ schemaVersion: 2, identity: { productName: 'XYvirtual Demo Test' }, defaults: { locale: 'en-US' } }))); return; }
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root + sep)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('rv-welcome-dismissed', '1'); localStorage.setItem('rv-auto-quality-applied', '1'); });
  await page.goto(`${origin}/demo-base/?model=fixture.glb&mode=planner`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.viewer?.currentModelRoot?.getObjectByName('DemoTriangle'), undefined, { timeout: 60000 });
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.waitForFunction(() => window.viewer?.getPlugin('layout-planner')?.isActive, undefined, { timeout: 60000 });
  // Exercise the actual Planner placement path before the document-card export.
  const placement = await page.evaluate(async () => {
    const viewer = window.viewer, planner = viewer.getPlugin('layout-planner');
    // The minimal GLB fixture has no plugin declarations; use the public
    // scene attachment entry point before calling the programmatic placement API.
    planner.ensureAttached(viewer);
    viewer.leftPanelManager.close('layout-planner');
    const id = await planner.placeComponent({ id: 'demo-export-fixture', name: 'PlacedDemoDevice', glbUrl: new URL('fixture.glb', location.href).href }, [2, 0, 1]);
    const node = planner.getPlacedRootById(id);
    return { name: node.name, position: node.position.toArray(), underModel: node.parent === viewer.currentModelRoot };
  });
  assert.equal(placement.underModel, true);
  await page.getByRole('button', { name: 'Hierarchy', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: resolve(evidence, 'authoring-boot.png') });
  const menu = page.getByRole('button', { name: /More actions|更多操作/ }).first();
  await expect(menu).toBeVisible({ timeout: 30000 }); await menu.click();
  await page.getByTestId('document-card-verb-export-demo').click();
  const panel = page.getByTestId('demo-export-panel');
  try { await expect(panel).toBeVisible(); }
  catch (err) {
    await page.screenshot({ animations: 'disabled', path: resolve(evidence, 'authoring-panel-error.png') });
    console.error('Authoring errors:', errors);
    throw err;
  }
  await panel.getByLabel(/Demo name|演示名称/, { exact: true }).fill('Production UI demo');
  await panel.getByRole('button', { name: /Add current view|添加当前镜头/, exact: true }).click();
  await panel.getByLabel(/1\. Shot title|1\. 镜头标题/).fill('Production shot');
  await panel.getByLabel(/Shot description|镜头说明/, { exact: true }).fill('Exported through the real document card');
  await page.screenshot({ animations: 'disabled', path: resolve(evidence, 'authoring-panel.png') });
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await panel.getByRole('button', { name: /Export demo HTML|导出演示 HTML/, exact: true }).click();
  const download = await pending, file = resolve(evidence, 'ui-exported-demo.html'); await download.saveAs(file);
  const html = await readFile(file, 'utf8'); const payload = JSON.parse(html.match(/id="rv-demo-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(payload.recipe.steps[0].title, 'Production shot');
  assert.equal(payload.build.version, data.build.version);
  const exportedModel = Buffer.from(payload.modelBase64, 'base64');
  const gltf = JSON.parse(exportedModel.subarray(20, 20 + exportedModel.readUInt32LE(12)).toString('utf8'));
  const placedNodes = gltf.nodes.filter(node => node.extras?.realvirtual?.LayoutObject?.CatalogId === 'demo-export-fixture');
  assert.equal(placedNodes.length, 1, 'the newly placed device must be exported exactly once');
  assert.equal(placedNodes[0].name, placement.name);
  assert.deepEqual(placedNodes[0].translation ?? placedNodes[0].matrix?.slice(12, 15) ?? [0, 0, 0], placement.position);
  assert.ok(placedNodes[0].mesh !== undefined || placedNodes[0].children?.length, 'the placed device must retain its geometry');
  await context.close();
  const offline = await browser.newContext({ offline: true, viewport: { width: 1280, height: 900 } });
  const receiver = await offline.newPage(); const network = [];
  receiver.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await receiver.goto(pathToFileURL(file).href);
  await expect(receiver.locator('body')).toHaveAttribute('data-demo-ready', 'true', { timeout: 60000 });
  await expect(receiver.locator('h1')).toHaveText('Production UI demo');
  await receiver.getByRole('button', { name: /Play tour|播放导览/, exact: true }).click();
  await expect(receiver.locator('#caption')).toContainText('Production shot');
  await receiver.screenshot({ path: resolve(evidence, 'ui-exported-player.png') });
  assert.deepEqual(network, []); assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'authoring-result.json'), JSON.stringify({ productionUI: true, plannerPlacement: placement, exportedPlacements: placedNodes.length, deploymentBase: '/demo-base/', fileName: download.suggestedFilename(), modelBytes: exportedModel.length, receiverNetworkAttempts: network.length, browserErrors: errors }, null, 2));
  console.log('PASS: production document card -> HTML download -> offline file:// playback under a deployment subpath');
  await offline.close();
} finally { await browser.close(); await new Promise(r => server.close(r)); }
