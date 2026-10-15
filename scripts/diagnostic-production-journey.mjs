// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect } from 'playwright/test';

async function readBundle(download) {
  const archive = await JSZip.loadAsync(await readFile(await download.path()));
  const files = {};
  for (const name of Object.keys(archive.files)) files[name] = await archive.file(name).async('string');
  const manifest = JSON.parse(files['manifest.json']);
  assert.equal(manifest.kind, 'xyvirtual-diagnostic-bundle'); assert.equal(manifest.schemaVersion, 1);
  assert.equal(Object.keys(files).length, 6);
  for (const file of manifest.files) assert.equal(Buffer.byteLength(files[file.name]), file.bytes);
  return { files, manifest };
}
/** Real public production UI and download; reusable inside the isolated offline gate. */
export async function diagnosticProductionJourney(page, origin) {
  // Model a customer's explicitly disconnected gateway preference. Existing CONNECT
  // discovery otherwise retries /health on loopback independently of diagnostics.
  await page.addInitScript(() => localStorage.setItem('rv-connect-autoconnect-optout', '1'));
  await page.goto(`${origin}/?mode=hmi&lang=en-US&model=%2Fembed%2Fvignettes%2Fconveyor-sensor.glb`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => !!window.viewer?.currentModelRoot), { timeout: 90000 }).toBe(true);
  await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
  const qualityNotice = page.getByTestId('auto-quality-ok');
  if (await qualityNotice.isVisible()) await qualityNotice.click();
  console.log('[diagnostics] model loaded; opening support panel');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Diagnostics & support' }).click();
  const panel = page.getByTestId('diagnostics-panel'); await expect(panel).toBeVisible();
  await mkdir('test-results/diagnostics', { recursive: true });
  await page.screenshot({ path: 'test-results/diagnostics/panel.png' });
  // Finish layout changes (including the shell's responsive branding images)
  // before observing requests caused by collection/export.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeInViewport();
  const bounds = await panel.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Support controls must fit a narrow viewport');
  await expect.poll(() => page.evaluate(() => [...document.images].every(image => image.complete))).toBe(true);
  // Test-only sentinel: must never survive capture, preview or ZIP.
  await page.evaluate(() => console.warn('fixture-sensitive-value', { token: 'fixture-sensitive-value', url: 'http://192.0.2.10/private' }));
  const requests = [], sockets = [];
  const onRequest = request => requests.push({ method: request.method(), url: request.url() });
  const onSocket = socket => sockets.push(socket.url());
  page.on('request', onRequest); page.on('websocket', onSocket);
  try {
    await panel.getByRole('button', { name: 'Refresh preview' }).click();
    await expect(panel.getByTestId('diagnostics-preview')).toBeAttached();
    const preview = await panel.getByTestId('diagnostics-preview').textContent();
    assert(!preview.includes('fixture-sensitive-value')); assert(!preview.includes('192.0.2.10'));
    await page.screenshot({ path: 'test-results/diagnostics/panel-narrow.png' });
    console.log('[diagnostics] preview ready; downloading ZIP');
    await panel.getByRole('button', { name: 'Export diagnostic bundle' }).focus();
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    const result = await readBundle(download);
    const contents = Object.values(result.files).join('\n');
    assert(!contents.includes('fixture-sensitive-value')); assert(!contents.includes('192.0.2.10')); assert(!contents.includes(origin));
    assert(result.files['logs.jsonl'].includes('CONSOLE_WARN'));
    assert.equal(JSON.parse(result.files['graphics.json']).data.rendererKind, 'webgl');
    assert(JSON.parse(result.files['scene-summary.json']).data.nodes > 0);
    // Same capture is used for the preview and downloaded files.
    for (const content of Object.values(result.files)) assert(preview.includes(content));
    await panel.getByRole('checkbox', { name: 'Include recent logs' }).uncheck();
    await panel.getByRole('checkbox', { name: 'Include scene summary' }).uncheck();
    const [excludedDownload] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Export diagnostic bundle' }).click()]);
    const excluded = await readBundle(excludedDownload);
    assert.equal(excluded.files['logs.jsonl'], ''); assert.equal(JSON.parse(excluded.files['scene-summary.json']).status, 'excluded');
    console.log('[diagnostics] ZIP and scope exclusions verified; testing context loss');
    // A real lost GL context must leave the native diagnostic action available.
    await page.evaluate(() => {
      const gl = window.viewer.renderer.getContext();
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Test requires WEBGL_lose_context');
      extension.loseContext();
    });
    const errorEntry = page.getByTestId('diagnostics-error-entry');
    await expect(errorEntry).toBeVisible();
    const [errorDownload] = await Promise.all([page.waitForEvent('download'), errorEntry.getByRole('button', { name: 'Export diagnostic bundle' }).click()]);
    const failure = await readBundle(errorDownload);
    assert(failure.files['logs.jsonl'].includes('CONTEXT_LOST'));
    assert.equal(JSON.parse(failure.files['graphics.json']).data.contextLost, true);
    assert.equal(sockets.length, 0, 'Export must not open connections');
    for (const request of requests) {
      const url = new URL(request.url);
      assert.equal(request.method, 'GET', 'Export must not upload'); assert.equal(url.origin, origin);
      assert(url.pathname.startsWith('/assets/'), `Export requested a non-static resource: ${url.pathname}`);
    }
    return { generatedAt: result.manifest.generatedAt, captureId: result.manifest.id, files: Object.keys(result.files), logs: result.manifest.logRange.count, staticRequests: requests.length, sockets: sockets.length, privacy: 'passed', actualContextLoss: 'passed' };
  } catch (error) {
    await page.screenshot({ path: 'test-results/diagnostics/failure.png', timeout: 5000 }).catch(() => {});
    throw error;
  } finally { page.off('request', onRequest); page.off('websocket', onSocket); }
}
