// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import assert from 'node:assert/strict';
import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from 'playwright/test';
import { startOfflineServer } from './offline-test-server.mjs';
import { observeOfflineContext } from './offline-network-observer.mjs';

assert(Object.values(networkInterfaces()).flat().every((iface) => iface.internal), 'Network gate must have only loopback interfaces');
const networkProbe = await new Promise((done) => {
  const socket = connect({ host: '198.51.100.1', port: 9 });
  socket.on('connect', () => { socket.destroy(); done('connected'); });
  socket.on('error', (error) => done(error.code));
  socket.setTimeout(2_000, () => { socket.destroy(); done('timeout'); });
});
assert.equal(networkProbe, 'ENETUNREACH', 'The child namespace must have no external network route');
const identity = { uid: process.getuid(), gid: process.getgid(),
  groups: [...new Set([...process.getgroups(), process.getgid()])].sort((a, b) => a - b), home: process.env.HOME };
if (process.env.RV_OFFLINE_EXPECTED_IDENTITY !== undefined) {
  const expected = JSON.parse(process.env.RV_OFFLINE_EXPECTED_IDENTITY);
  assert.equal(process.geteuid(), expected.uid, 'The isolated process must use the expected effective uid');
  assert.equal(process.getegid(), expected.gid, 'The isolated process must use the expected effective gid');
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(identity[key], value, `Isolated browser identity: ${key}`);
}
const reportDir = resolve('test-results/offline');
await mkdir(reportDir, { recursive: true });
let server;
// Keep the full Chromium selected by the parent across sudo's HOME change.
// SwANGLE requires both switches; selecting only the ANGLE backend can leave
// headless Linux without a usable GL implementation.
// https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
const browserArgs = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let browser;
const report = {
  startedAt: new Date().toISOString(),
  browser: { platform: process.platform, arch: process.arch, args: browserArgs },
  namespace: { mode: process.env.RV_OFFLINE_NAMESPACE_MODE, ...identity },
  production: Object.fromEntries(await Promise.all(['index.html', 'settings.json'].map(async file =>
    [file, createHash('sha256').update(await readFile(resolve('dist', file))).digest('hex')]))),
  isolation: 'network namespace: loopback only; external TCP returns ENETUNREACH', journeys: [],
};

async function contextForJourney(name, callback) {
  const started = Date.now();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  const observer = await observeOfflineContext(context, server.origin);
  await context.tracing.start({ screenshots: true, snapshots: true });
  let failure;
  try {
    await context.addInitScript(() => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('rv-terms-accepted', '1');
      localStorage.setItem('rv-welcome-dismissed', '1');
    });
    const page = await context.newPage();
    await observer.pageReady(page);
    let journeyTimer;
    try {
      await Promise.race([callback(page, observer, context), new Promise((_, reject) => {
        journeyTimer = setTimeout(() => reject(new Error(`${name}: exceeded 180 seconds`)), 180_000);
      })]);
    } finally { clearTimeout(journeyTimer); }
    assert.deepEqual([...observer.attempts], [], `${name}: external attempts`);
    assert.deepEqual(observer.errors, [], `${name}: page errors`);
    assert.deepEqual(observer.violations, [], `${name}: CSP violations`);
    await context.tracing.stop();
    report.journeys.push({ name, status: 'passed', durationMs: Date.now() - started, localResources: observer.requests.size, externalAttempts: 0 });
    console.log(`[offline] ${name}: passed (${observer.requests.size} local resources)`);
  } catch (error) {
    failure = { name, status: 'failed', failure: error.message, durationMs: Date.now() - started, externalAttempts: [...observer.attempts], errors: observer.errors, violations: observer.violations };
    report.journeys.push(failure);
    try { await context.tracing.stop({ path: resolve(reportDir, `${name}.zip`) }); }
    catch (traceError) { failure.traceError = traceError.message; }
    throw error;
  } finally {
    try { await context.close(); }
    catch (closeError) {
      if (!failure) throw closeError;
      failure.closeError = closeError.message;
    }
  }
}

async function boot(page, suffix = '/?mode=hmi&lang=en-US') {
  await page.goto(server.origin + suffix, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(window.viewer?.currentModelRoot && window.viewer?.signalStore && window.viewer?.currentScene)), { timeout: 90_000 }).toBe(true);
  return page.evaluate(() => {
    let meshes = 0, vertices = 0;
    window.viewer.currentModelRoot.traverse((node) => {
      if (node.isMesh) { meshes++; vertices += node.geometry?.attributes?.position?.count ?? 0; }
    });
    return { meshes, vertices, url: window.viewer.currentModelUrl };
  });
}

try {
  server = await startOfflineServer('dist');
  browser = await chromium.launch({ channel: 'chromium', executablePath: process.env.RV_OFFLINE_CHROMIUM, headless: true, args: browserArgs });
  report.browser.version = browser.version();
  await contextForJourney('webgl2-preflight', async (page) => {
    // This is a real draw/readback in the same browser and isolated namespace
    // as the application, using RVViewer's WebGL context attributes.
    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      let creationError = '';
      canvas.addEventListener('webglcontextcreationerror', (event) => { creationError = event.statusMessage; });
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, stencil: true, powerPreference: 'high-performance' });
      if (!gl) return { available: false, creationError };
      try {
        gl.clearColor(17 / 255, 34 / 255, 51 / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { available: true, pixel: [...pixel], error: gl.getError(),
          renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    });
    report.browser.webgl2 = result;
    if (!result.available) {
      const session = await browser.newBrowserCDPSession();
      try {
        report.browser.gpu = (await session.send('SystemInfo.getInfo')).gpu;
        console.error('[offline] GPU diagnostics:', JSON.stringify(report.browser.gpu));
      } finally { await session.detach(); }

    }
    assert(result.available, `Offline Chromium cannot create WebGL2: ${result.creationError}`);
    assert.equal(result.error, 0, 'WebGL2 preflight must render without GL errors');
    assert.deepEqual(result.pixel, [17, 34, 51, 255], 'WebGL2 preflight must read back the rendered pixel');
    console.log(`[offline] WebGL2 renderer: ${result.renderer}`);
  });
  const canaryContext = await browser.newContext({ serviceWorkers: 'block' });
  const canaryObserver = await observeOfflineContext(canaryContext, server.origin);
  await canaryContext.tracing.start({ screenshots: true, snapshots: true });
  try {
    const observer = canaryObserver;
    const page = await canaryContext.newPage();
    await observer.pageReady(page);
    await page.goto(server.origin + '/__offline/canary.html');
    await page.evaluate(async () => {
      const target = 'http://127.0.0.2:54321';
      await fetch(target + '/fetch').catch(() => {});
      const image = new Image(); image.src = target + '/image'; document.body.append(image);
      const script = document.createElement('script'); script.src = target + '/script'; document.body.append(script);
      const frame = document.createElement('iframe'); frame.src = 'http://127.0.0.4:54321/frame'; document.body.append(frame);
      window.open('http://127.0.0.5:54321/popup');
      navigator.sendBeacon(target + '/beacon', 'canary');
      const xhr = new XMLHttpRequest(); xhr.open('GET', target + '/xhr'); xhr.send();
      const socket = new WebSocket('ws://127.0.0.2:54321/socket'); socket.onerror = () => {};
      await new Promise((resolve, reject) => {
        const worker = new Worker('/__offline/worker.js');
        worker.onmessage = () => { worker.terminate(); resolve(); };
        worker.onerror = reject;
      });
    });
    for (const kind of ['websocket', 'image', 'script', 'popup', 'fetch', 'xhr', 'ping']) {
      await expect.poll(() => [...observer.attempts].some(item => item.startsWith(kind + ':'))).toBe(true);
    }
    for (const target of ['http://127.0.0.3:54321', 'http://127.0.0.4:54321', 'http://127.0.0.5:54321']) {
      await expect.poll(() => [...observer.attempts].some(item => item.endsWith(target))).toBe(true);
    }
    await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/__offline/strict-worker.js');
      worker.onmessage = () => { worker.terminate(); resolve(); };
      worker.onerror = reject;
    }));
    await expect.poll(() => observer.attempts.has('csp: http://127.0.0.6:54321')).toBe(true);
    report.journeys.push({ name: 'detector-canaries', status: 'passed', detected: [...observer.attempts] });
    await canaryContext.tracing.stop();
  } catch (error) {
    report.journeys.push({ name: 'detector-canaries', status: 'failed', detected: [...canaryObserver.attempts], violations: canaryObserver.violations });
    await canaryContext.tracing.stop({ path: resolve(reportDir, 'detector-canaries.zip') });
    throw error;
  } finally { await canaryContext.close(); }
  console.log('[offline] detector canaries passed');
  const settings = JSON.parse(await readFile('dist/settings.json', 'utf8'));
  assert.equal(settings.egress.mode, 'deny-external');
  assert.deepEqual(settings.egress.allow, []);
  await contextForJourney('model-and-workspaces', async (page, observer) => {
    const model = await boot(page);
    console.log('[offline] real model loaded');
    assert(model.meshes > 0 && model.vertices > 0, 'A real model must be decoded');
    assert(observer.requests.has('/models/DemoRealvirtualWeb.glb'));
    for (const mode of ['viewer', 'hmi', 'planner', 'des', 'commissioning']) {
      // requestMode resolves after committing the mode. Read that state in the
      // same browser task, before React/SwiftShader renders the large model.
      const transition = await page.evaluate(async (next) => {
        const switched = await window.viewer.modes.requestMode(next);
        return { switched, activeMode: window.viewer.modes.activeMode };
      }, mode);
      assert.equal(transition.switched, true, `${mode}: guarded switch must succeed`);
      assert.equal(transition.activeMode, mode, `${mode}: requested mode must be active`);
      assert(await page.locator('canvas').first().isVisible());
    }
  });
  await contextForJourney('local-save-and-reopen', async (page) => {
    // Exercise real shipped library geometry here. Large-model decoding and
    // Draco have separate journeys; save/reopen also needs to fit CPU renderers.
    const model = await boot(page, '/?mode=hmi&lang=en-US&model=%2Flibrary%2FPaintLine%2FPaintTrackStraight-2m.glb');
    assert(model.meshes > 0 && model.vertices > 0);
    const placementId = await page.evaluate(async () => {
      await window.viewer.modes.requestMode('planner');
      const id = await window.viewer.getPlugin('layout-planner').placeComponent({
        id: 'offline-local-conveyor', name: 'Offline saved conveyor',
        glbUrl: '/library/PaintLine/PaintTrackStraight-4m.glb',
      }, [3, 0, 4]);
      const hierarchy = window.viewer.getPlugin('rv-extras-editor');
      if (!hierarchy.panelOpen) hierarchy.togglePanel();
      return id;
    });
    console.log('[offline] local placement created');
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key =>
      key.startsWith('rv-scene-glb/draft/') && JSON.parse(localStorage.getItem(key))?.sha)), { timeout: 60_000 }).toBe(true);
    const save = page.getByTestId('document-card-save').first();
    await expect(save).toBeVisible();
    const dismiss = page.getByRole('button', { name: 'OK', exact: true });
    if (await dismiss.isVisible()) await dismiss.press('Enter');
    await save.press('Enter');
    const name = page.getByRole('dialog').getByRole('textbox', { name: 'Name', exact: true });
    await expect(name).toBeVisible();
    await name.fill('Offline saved scene');
    await name.press('Enter');
    await expect(page.getByTestId('document-card-status').first()).toHaveText('Saved', { timeout: 90_000 });
    console.log('[offline] local save completed');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rv-project/browser/workspace-default')));
    assert(saved?.documents?.length > 0, 'Saving must commit a project document');
    const identity = saved.documents[0].id;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => Boolean(window.viewer?.currentModelRoot && window.viewer?.signalStore && window.viewer?.currentScene)), { timeout: 90_000 }).toBe(true);
    console.log('[offline] saved model reopened');
    await page.evaluate(() => window.viewer.modes.requestMode('planner'));
    // Saving bakes placements into GLB reference nodes. The planner's transient
    // placement list is empty after reopen; verify the persisted composition.
    const restored = await page.evaluate((id) => {
      const frame = window.viewer.lastLoadResult?.composition?.frames.find(item => item.referenceNode?.userData?.realvirtual?.NodeId === id);
      if (!frame) return null;
      let vertices = 0;
      frame.subtreeRoot.traverse(node => { if (node.isMesh) vertices += node.geometry?.attributes?.position?.count ?? 0; });
      return { name: frame.referenceNode.name, position: frame.referenceNode.position.toArray(), vertices };
    }, placementId);
    assert(restored, 'The saved placement NodeId must survive a real reload');
    assert.equal(restored.name, 'Offline saved conveyor');
    assert.equal(restored.position[0], 3);
    assert.equal(restored.position[2], 4);
    assert(restored.vertices > 0, 'The saved reference must resolve to real geometry');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rv-project/browser/workspace-default')).documents[0].id), identity);
    console.log('[offline] saved placement and document identity verified');
    await page.evaluate(() => window.viewer.modes.requestMode('editor'));
    await expect.poll(() => page.evaluate(() => window.viewer.getPlugin('asset-editor')?.getSnapshot().status), { timeout: 60_000 }).toBe('ready');
    assert(await page.evaluate(() => Boolean(window.viewer.getPlugin('asset-editor').document && window.viewer.currentModelRoot)));

  });
  await contextForJourney('teams-entry', async (page) => {
    await page.goto(server.origin + '/teams-config.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#model-url')).toBeVisible();
    await expect(page.locator('#teams-status')).toContainText('unavailable');
  });
  await contextForJourney('local-draco-and-denials', async (page, observer) => {
    await boot(page, '/?mode=hmi&lang=en-US&model=%2Fembed%2Fvignettes%2Fconveyor-sensor.glb');
    const decoded = await page.evaluate(async () => {
      await window.viewer.loadModel('/embed/vignettes/conveyor-sensor.glb');
      let vertices = 0;
      window.viewer.currentModelRoot.traverse((node) => { if (node.isMesh) vertices += node.geometry?.attributes?.position?.count ?? 0; });
      return vertices;
    });
    assert(decoded > 0, 'Local Draco fixture must decode geometry');
    assert(observer.requests.has('/draco/draco_decoder.wasm'), 'Real local Draco Wasm must be requested');
    for (const url of ['http://127.0.0.2:54321/model.glb', '/__offline/redirect.glb', '/__offline/external-buffer.gltf']) {
      const rejection = await page.evaluate(async (candidate) => {
        try { await window.viewer.loadModel(candidate); return null; }
        catch (error) { return { name: error.name, code: error.code, message: error.message }; }
      }, url);
      assert(rejection, 'Forbidden model or redirect must fail visibly');
      if (url.endsWith('external-buffer.gltf')) assert.equal(rejection.code, 'EGRESS_BLOCKED', 'The nested buffer must reach the policy check');
      else if (url.endsWith('redirect.glb')) assert.equal(rejection.name, 'TypeError', 'Native fetch must refuse the redirect');
      else assert.match(rejection.message, /deployment.*policy/i);
    }
    assert(observer.requests.has('/__offline/redirect.glb'));
    assert(observer.requests.has('/__offline/external-buffer.gltf'));
  });
  // Further journeys below use the same production bytes with only the
  // deployment JSON supplied by the test HTTP server changed.
  for (const [name, config] of [['missing-config', null], ['malformed-config', '{broken'], ['future-config', JSON.stringify({ schemaVersion: 99, egress: { mode: 'allow-listed', allow: [{ origin: 'http://127.0.0.2:54321', purposes: ['analytics', 'news', 'remote-model'] }] }, services: { news: { apiUrl: 'http://127.0.0.2:54321/news' } } })]]) {
    server.setConfig(config);
    await contextForJourney(name, async (page) => { const model = await boot(page, '/?mode=hmi&lang=en-US&model=%2Fembed%2Fvignettes%2Fconveyor-sensor.glb'); assert(model.meshes > 0); });
  }
  const external = 'http://127.0.0.2:54321';
  server.setConfig(JSON.stringify({ ...settings,
    // Residual online values must not win over the deployment's deny policy.
    egress: { mode: 'deny-external', allow: [{ origin: external, purposes: ['analytics', 'news', 'remote-model', 'industrial-interface', 'multiuser'] }] },
    services: {
      analytics: { provider: 'google-analytics', measurementId: 'G-FIXTURE', scriptUrl: external + '/analytics.js' },
      news: { apiUrl: external + '/news' }, documentation: { baseUrl: external + '/docs/' },
      connectUpdates: { stableDownloadUrl: external + '/setup.exe', stableManifestUrl: external + '/version.json' },
      firebaseDemo: { modelBaseUrl: external + '/models/' },
      githubLibrary: { webBaseUrl: external, apiBaseUrl: external, rawBaseUrl: external },
    },
    interface: { activeType: 'mqtt', autoConnect: true, mqttBrokerUrl: 'ws://127.0.0.2:54321/mqtt' },
  }));
  await contextForJourney('residual-online-configuration', async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('rv-connect-url', 'http://127.0.0.2:54321');
      localStorage.setItem('rv-connect-user-connected', '1');
      localStorage.setItem('rv-ai-bridge', JSON.stringify({ enabled: true, port: '54321' }));
    });
    const model = await boot(page, '/?mode=hmi&lang=en-US&model=%2Fembed%2Fvignettes%2Fconveyor-sensor.glb&teams=1&server=ws%3A%2F%2F127.0.0.2%3A54321&joinCode=OFFLINE');
    assert(model.meshes > 0);
    await expect(page.locator('[data-rv-runtime-csp]')).toHaveAttribute('content', /connect-src 'self' blob: data:;/);
  });
  server.setConfig(undefined);

} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  // A crashed GPU/browser must not prevent server cleanup or erase the
  // original failure report. Cleanup failures still fail an otherwise good run.
  const cleanup = await Promise.allSettled([browser?.close(), server?.close()]);
  const failed = cleanup.filter(result => result.status === 'rejected');
  if (failed.length) report.cleanupErrors = failed.map(result => result.reason.message);
  await writeFile(resolve(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.failure && failed.length) throw failed[0].reason;
}
