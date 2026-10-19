// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { cpus, totalmem, release } from 'node:os';
import { chromium, expect } from 'playwright/test';
import { startOfflineServer } from './offline-test-server.mjs';
import { generateCompatibility } from './generate-compatibility.mjs';

const options = new Map(process.argv.slice(2).map(arg => { const index = arg.indexOf('='); return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)]; }));
for (const key of options.keys()) assert(['--channel', '--executable', '--hardware', '--renderer'].includes(key), `Unknown option: ${key}`);
assert(!(options.has('--channel') && options.has('--executable')), 'Use channel OR executable, not both');
const channel = options.get('--channel') ?? 'chromium', executable = options.get('--executable');
assert(['chromium', 'chrome', 'msedge'].includes(channel), 'Supported channels: chromium, chrome, msedge');
assert(!executable || (typeof executable === 'string' && isAbsolute(executable)), 'Executable must be an absolute path');
assert(!options.has('--hardware') || options.get('--hardware') === true, 'Use --hardware without a value');
const renderer = options.get('--renderer') ?? 'webgl', hardware = options.has('--hardware');
assert(['webgl', 'webgpu'].includes(renderer), 'Supported renderers: webgl, webgpu');
assert(renderer !== 'webgpu' || hardware, 'Real WebGPU acceptance requires --hardware');
generateCompatibility(true);
const dist = resolve('dist'), out = resolve('test-results/compatibility');
await mkdir(out, { recursive: true });
const matrix = JSON.parse(await readFile(join(dist, 'compatibility/support-matrix.json'), 'utf8'));
const sourceMatrix = JSON.parse(await readFile('src/core/compatibility/support-matrix.json', 'utf8'));
assert.equal(matrix.revision, sourceMatrix.revision, 'Rebuild production after changing the matrix');
for (const key of ['targets', 'workflows', 'evidence']) assert.deepEqual(matrix[key], sourceMatrix[key], 'Production matrix is stale');
const hash = createHash('sha256');
async function digestDirectory(path) {
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await digestDirectory(file);
    else { hash.update(file.slice(dist.length)); hash.update(await readFile(file)); }
  }
}
await digestDirectory(join(dist, 'assets')); await digestDirectory(join(dist, 'compatibility'));
hash.update(await readFile(join(dist, 'index.html'))); hash.update(await readFile(join(dist, 'settings.json')));
const report = {
  kind: 'xyvirtual-compatibility-production-evidence', schemaVersion: 1, generatedAt: new Date().toISOString(),
  productVersion: matrix.productVersion, matrixRevision: matrix.revision, build: hash.digest('hex'),
  os: ({ win32: 'windows', darwin: 'macos', linux: 'linux' })[process.platform] ?? 'unknown', osRelease: release(), arch: process.arch,
  browser: 'unknown', browserVersion: null, major: null, channel: executable ? 'explicit-executable' : channel,
  cpu: cpus()[0]?.model ?? null, memoryBytes: totalmem(), requestedRenderer: renderer, hardwareRequested: hardware, gpu: 'unknown',
  physicalDeviceVerified: false, salesClaimVerified: false, productionTlsVerified: false,
  status: 'running', workflows: [], journeys: [],
  unverified: ['physical reference hardware and minimum specification', 'enterprise HTTPS/WSS and policy', 'folder save/reopen and permission persistence', 'XR session/input/lifecycle', '30-sample performance certification'],
};
const server = await startOfflineServer(dist);
let browser;
async function journey(name, work) {
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('rv-terms-accepted', '1'); localStorage.setItem('rv-welcome-dismissed', '1');
    localStorage.setItem('rv-auto-quality-applied', '1'); localStorage.setItem('rv-connect-autoconnect-optout', '1');
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    await work(page, context);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    report.journeys.push({ name, status: 'passed' });
    await context.tracing.stop();
    console.log(`[compatibility] ${name}: passed`);
  } catch (error) {
    report.journeys.push({ name, status: 'failed' });
    await page.screenshot({ path: join(out, `${name}-failure.png`), timeout: 5000 }).catch(() => {});
    await context.tracing.stop({ path: join(out, `${name}-trace.zip`) });
    throw error;
  } finally { await context.close(); }
}
const checkPage = `${server.origin}/compatibility/index.html?lang=en-US`;
const runCheck = async page => {
  await page.locator('#run').click();
  await expect(page.locator('#download')).toBeEnabled();
  return JSON.parse(await page.locator('#report').textContent());
};
const boot = async (page, mode = renderer) => {
  await page.goto(`${server.origin}/?mode=hmi&lang=en-US&renderer=${mode}&model=%2Fembed%2Fvignettes%2Fconveyor-sensor.glb`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.viewer?.currentModelRoot && window.viewer.loading.getSnapshot().phase === 'ready', null, { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
  const qualityNotice = page.getByTestId('auto-quality-ok');
  if (await qualityNotice.isVisible()) await qualityNotice.click();
};
try {
  browser = await chromium.launch({ ...(executable ? { executablePath: executable } : { channel }), headless: true,
    args: hardware ? ['--no-sandbox'] : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version(); report.major = Number(report.browserVersion.split('.')[0]);
  await journey('explicit-check-and-download', async page => {
    const requests = [], sockets = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    page.on('websocket', socket => sockets.push(socket.url()));
    await page.goto(checkPage); await expect(page.locator('#run')).toBeEnabled();
    assert.equal(await page.locator('#report').textContent(), '', 'Checks must not run on page load');
    await page.locator('#workflow').selectOption('browser-project');
    const result = await runCheck(page);
    report.browser = result.environment.browser;
    assert.equal(result.checks.opfs.code, 'OPFS_ROUNDTRIP_OK');
    assert.equal(result.checks.webgl2.code, 'WEBGL2_RENDER_OK');
    assert.equal(result.checks.secureContext.code, 'PRODUCTION_HTTPS_REQUIRED', 'Do not certify loopback HTTP as trusted intranet HTTPS');
    assert.equal(result.assessment.certification, 'unverified');
    report.gpu = result.checks.webgl2.data.execution === 'software' ? 'software' : result.checks.webgl2.data.execution === 'hardware-candidate' ? 'hardware' : 'unknown';
    if (hardware) assert.equal(report.gpu, 'hardware', 'Hardware run requires a real GPU candidate; software/unknown cannot pass');
    assert(!JSON.stringify(result).includes(server.origin));
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), result);
    await page.locator('#locale').selectOption('zh-CN'); await expect(page.locator('h1')).toHaveText('环境与兼容性检查');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must fit a narrow viewport');
    await page.screenshot({ path: join(out, 'checks-zh-narrow.png'), fullPage: true });
    await page.locator('#workflow').selectOption('folder-project');
    const folder = await runCheck(page); assert.equal(folder.assessment.capability, 'limited'); // HTTP + permission not established.
    assert.notEqual(folder.checks.directoryPermission.status, 'pass');
    for (const request of requests) { assert.equal(request.method, 'GET'); assert.equal(new URL(request.url).origin, server.origin); }
    assert.deepEqual(sockets, []);
  });
  await journey('missing-matrix-and-graphics', async page => {
    await page.route('**/compatibility/matrix.mjs', route => route.fulfill({ contentType: 'text/javascript', body: 'export default {schemaVersion: 999};' }));
    await page.goto(checkPage); await expect(page.locator('#status')).toContainText('support matrix is unavailable');
    await expect(page.locator('#run')).toBeDisabled();
    await page.unroute('**/compatibility/matrix.mjs');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl2' || kind === 'webgl' ? null : original.call(this, kind, ...args); };
    });
    await page.goto(checkPage); const result = await runCheck(page);
    assert.equal(result.checks.webgl2.code, 'WEBGL2_UNAVAILABLE'); assert.equal(result.assessment.capability, 'limited');
    await expect(page.locator('#download')).toBeEnabled();
  });
  await journey('production-viewer-and-support-entry', async (page, context) => {
    await boot(page);
    const actual = await page.evaluate(() => ({ renderer: window.viewer.rendererKind, triangles: window.viewer.getRendererInfo().triangles }));
    assert.equal(actual.renderer, renderer, 'A fallback does not certify the requested backend'); assert(actual.triangles > 0);
    report.actualRenderer = actual.renderer;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Diagnostics & support' }).click();
    const link = page.getByRole('link', { name: 'Open environment compatibility checks' });
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await popup.waitForLoadState(); await expect(popup.locator('#run')).toBeEnabled();
    assert.equal(await popup.evaluate(() => window.opener === null), true);
    await popup.close();
    await page.reload(); await page.waitForFunction(() => window.viewer?.currentModelRoot, null, { timeout: 90000 });
  });
  await journey('webgpu-unavailable-fallback', async page => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
    await boot(page, 'webgpu');
    const actual = await page.evaluate(() => window.viewer.rendererKind);
    assert.equal(actual, 'webgl', 'Unavailable WebGPU must use the classic WebGL fallback');
    report.fallback = actual;
  });
  report.status = 'passed';
  // Partial prerequisite/Viewer evidence is deliberately not a full browser-project certificate.
  report.workflows = ['viewer'];
} catch (error) { report.status = 'failed'; throw error; }
finally {
  await writeFile(join(out, `${executable ? 'executable' : channel}-${renderer}-${hardware ? 'hardware' : 'software'}.json`), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); await server.close();
}
