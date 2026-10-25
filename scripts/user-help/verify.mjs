// SPDX-License-Identifier: AGPL-3.0-only
// Exercise delivered files and real user actions, including an isolated recipient.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from 'playwright/test';
import { helpTestServer } from './server.mjs';

const evidence = resolve('test-results/user-help/verification');
await mkdir(evidence, { recursive: true });
const manifest = JSON.parse(await readFile('dist/user-help/manifest.json', 'utf8'));
assert.equal(manifest.contentDigest, JSON.parse(await readFile('public/user-help/manifest.json', 'utf8')).contentDigest, 'rebuild dist before verification');
const server = await helpTestServer();
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = { productVersion: manifest.productVersion, contentDigest: manifest.contentDigest, browser: browser.version(), deploymentBase: server.base, pages: [], videos: [], workflow: {} };

async function helpJourney(offline) {
  const context = await browser.newContext({ offline, serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && (offline || new URL(request.url()).origin !== server.origin)) external.push(request.url());
  });
  const base = offline ? pathToFileURL(resolve('dist/user-help') + '/').href : server.url + 'user-help/';
  try {
    for (const locale of ['zh-CN', 'en-US']) {
      await page.goto(`${base}viewer/interface/index.html?lang=${locale}#hierarchy`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#hierarchy')).toBeAttached();
      assert.equal(new URL(page.url()).hash, '#hierarchy');
      await expect(page.locator('img')).toHaveJSProperty('complete', true);
      assert(await page.locator('img').evaluate(img => img.naturalWidth > 0));
      await page.locator('#search').fill(locale === 'zh-CN' ? '诊断' : 'diagnostic');
      await expect(page.locator('#results a').first()).toBeVisible();
      await page.locator('#search').fill('no-match-7d433');
      await expect(page.locator('#results a')).toHaveCount(0);
      await expect(page.locator('#results')).not.toBeEmpty();
      await page.locator('#language').click();
      await expect(page.locator('html')).toHaveAttribute('lang', locale === 'en-US' ? 'zh-CN' : 'en-US');
      assert.equal(new URL(page.url()).hash, '#hierarchy');
      result.pages.push({ offline, locale, alias: true, anchor: true, search: true, language: true, image: true });
    }
    for (const video of manifest.media.videos) {
      await page.goto(`${base}en-US/${video.topic}/index.html`);
      const player = page.locator('video');
      await player.evaluate(async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0.3);
      const state = await player.evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, captions: Array.from(video.textTracks, t => ({ language: t.language, cues: t.cues?.length ?? 0 })) }));
      assert(state.width >= 1280 && state.height >= 720 && state.duration >= 120 && state.duration <= 270);
      assert(Math.abs(state.duration - video.durationSeconds) < 0.1, 'media duration must describe the encoded file');
      await page.waitForFunction(() => Array.from(document.querySelector('video').textTracks).some(track => track.mode === 'showing' && track.cues?.length >= 6));
      const alternateCues = await player.evaluate(video => { video.textTracks[1].mode = 'disabled'; video.textTracks[0].mode = 'showing'; return video.textTracks[0].cues?.length; });
      assert(alternateCues >= 6, 'Chinese captions must remain available offline');
      state.captions[0].cues = alternateCues;
      await player.evaluate(video => video.pause());
      result.videos.push({ offline, topic: video.topic, ...state });
    }
    await page.screenshot({ path: resolve(evidence, offline ? 'offline-help.png' : 'hosted-help.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'help must make no external network attempts');
  } finally { await context.close(); }
}

async function workbenchJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('rv-welcome-dismissed', '1'); localStorage.setItem('rv-terms-accepted', '1');
    localStorage.setItem('rv-auto-quality-applied', '1'); localStorage.setItem('rv-connect-autoconnect-optout', '1');
  });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.url + '?mode=planner&lang=en-US&model=library/PalletHandling/RollConveyor-3m.glb', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.viewer?.currentModelRoot, undefined, { timeout: 90000 });
    await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
    const ok = page.getByTestId('auto-quality-ok'); if (await ok.isVisible()) await ok.click();
    await page.getByRole('button', { name: 'Hierarchy', exact: true }).click();
    const helpPending = context.waitForEvent('page');
    await page.keyboard.press('F1');
    const help = await helpPending;
    await expect(help.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(help.locator('#hierarchy')).toBeAttached();
    await help.close();
    await page.getByRole('button', { name: 'More actions', exact: true }).first().click();
    await page.getByTestId('document-card-verb-export-demo').click();
    const panel = page.getByTestId('demo-export-panel'); await expect(panel).toBeVisible();
    await panel.locator('input[type=file]').setInputFiles({ name: 'bad.demo.json', mimeType: 'application/json', buffer: Buffer.from('{"secret":"customer-private-token"') });
    await expect(panel.getByRole('alert')).toBeVisible();
    assert(!(await panel.getByRole('alert').textContent()).includes('customer-private-token'));
    await expect(panel.getByRole('alert').getByRole('link')).toHaveAttribute('href', /user-help\/tours\//);
    await panel.getByLabel('Demo name', { exact: true }).fill('Customer documentation verification');
    await panel.getByRole('button', { name: 'Set initial view', exact: true }).click();
    await panel.getByRole('button', { name: 'Add current view', exact: true }).click();
    await panel.getByLabel('1. Shot title').fill('Verified public conveyor');
    const recipePending = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Save tour recipe', exact: true }).click();
    await (await recipePending).saveAs(resolve(evidence, 'verified.demo.json'));
    assert.equal(JSON.parse(await readFile(resolve(evidence, 'verified.demo.json'), 'utf8')).steps[0].title, 'Verified public conveyor');
    const htmlPending = page.waitForEvent('download', { timeout: 90000 });
    await panel.getByRole('button', { name: 'Export demo HTML', exact: true }).click();
    const download = await Promise.race([htmlPending, panel.getByRole('alert').waitFor({ state: 'visible', timeout: 90000 }).then(async () => { throw new Error(await panel.getByRole('alert').innerText()); })]);
    const file = resolve(evidence, 'verified.html'); await download.saveAs(file);
    await page.screenshot({ path: resolve(evidence, 'authoring.png') });
    assert.deepEqual(errors, []);
    const recipient = await browser.newContext({ offline: true, viewport: { width: 1280, height: 800 } });
    try {
      const received = await recipient.newPage(), network = [];
      received.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
      await received.goto(pathToFileURL(file).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await expect(received.locator('body')).toHaveAttribute('data-demo-ready', 'true', { timeout: 90000 });
      await received.getByRole('button', { name: 'Play tour', exact: true }).click();
      await expect(received.locator('#caption')).toContainText('Verified public conveyor');
      await received.getByRole('button', { name: 'Initial view', exact: true }).click();
      await received.screenshot({ path: resolve(evidence, 'offline-recipient.png') });
      assert.deepEqual(network, []);
      result.workflow = { actualDocumentExport: true, invalidRecipeRedacted: true, contextualF1: true, recipeDownload: true, offlineRecipient: true, networkAttempts: 0 };
    } finally { await recipient.close(); }
  } finally { await context.close(); }
}

try {
  if (!process.argv.includes('--workbench-only')) { await helpJourney(false); await helpJourney(true); }
  await workbenchJourney();
  await writeFile(resolve(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('PASS: bilingual help/search/media on HTTP subpath and offline file://; real export -> offline recipient');
} catch (error) {
  await writeFile(resolve(evidence, 'failure.json'), JSON.stringify({ ...result, failure: String(error) }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); await server.close(); }
