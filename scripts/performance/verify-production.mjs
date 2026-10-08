// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { chromium, expect } from 'playwright/test';
import { startOfflineServer } from '../offline-test-server.mjs';
import { createPerformanceFixture } from './fixture.mjs';
import { prepareModel } from './prepare-model.mjs';
const out = resolve('test-results/loading-performance');
await mkdir(out, { recursive: true });
const benchmarking = process.argv.includes('--benchmark');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
if (only && (benchmarking || process.env.CI)) throw new Error('CI and benchmarks require the full journey suite');
const source = resolve('dist/_perf/model.glb');
const fixture = await createPerformanceFixture(
    source,
    benchmarking ? 48 : 8,
    benchmarking ? 192 : 96,
  ),
  prepared = await prepareModel(source);
assert(prepared.report.withinPreviewBudget, 'Overview exceeds the 3 MiB fixture budget');
assert(
  prepared.report.previewBytes < prepared.report.sourceBytes * 0.2,
  'Derived fixture must reduce overview transfer by at least 80%',
);
const server = await startOfflineServer(resolve('dist'));
const args = process.argv.includes('--hardware')
  ? ['--no-sandbox']
  : ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ channel: 'chromium', headless: true, args });
const report = {
  scope: only ?? 'full',
  environment: {
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    memory: totalmem(),
    browser: browser.version(),
    gpu: process.argv.includes('--hardware')
      ? 'Hardware requested; inspect actual renderer below'
      : 'SwiftShader (functional evidence, not a physical low-end device)',
    viewport: '1920x1080',
  },
  fixture: { ...fixture, ...prepared.report },
  journeys: [],
  benchmarks: [],
  baseline: [],
  warm: [],
  salesClaimVerified: false,
};
async function journey(name, run) {
  if (only && only !== name) return;
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('rv-terms-accepted', '1');
    localStorage.setItem('rv-welcome-dismissed', '1');
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.tracing.start({ screenshots: true, snapshots: true });
  const started = Date.now();
  try {
    await run(page, context);
    assert.deepEqual(errors, []);
    report.journeys.push({ name, status: 'passed', ms: Date.now() - started });
    console.log(`[performance] ${name}: passed`);
    await context.tracing.stop();
  } catch (error) {
    report.journeys.push({ name, status: 'failed', error: error.message, errors });
    await page.screenshot({ path: resolve(out, `${name}-failure.png`) }).catch(() => {});
    await context.tracing.stop({ path: resolve(out, `${name}.zip`) });
    throw error;
  } finally {
    await context.close();
  }
}
const boot = (page) =>
  page.goto(`${server.origin}/?model=/_perf/model.glb&mode=hmi&lang=en-US`, {
    waitUntil: 'domcontentloaded',
  });
const ready = (page) =>
  page.waitForFunction(() => window.viewer?.loading?.getSnapshot().phase === 'ready', null, {
    timeout: 90000,
  });
try {
  await journey('preview-before-completion', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb', async (route) => {
      await gate;
      await route.continue();
    });
    await boot(page);
    await page.waitForFunction(() => window.viewer?.loading?.getSnapshot().preview, null, {
      timeout: 30000,
    });
    assert.notEqual(await page.evaluate(() => window.viewer.loading.getSnapshot().phase), 'ready');
    await expect(page.getByTestId('model-load-feedback')).toBeVisible();
    await page.screenshot({ path: resolve(out, 'overview.png') });
    release();
    await ready(page);
    const metrics = await page.evaluate(() => ({
      load: window.viewer.loading.getSnapshot(),
      meshes: window.viewer.currentModelRoot.children.length,
      lod: window.viewer._runtimeLod?.size ?? 0,
    }));
    assert(metrics.load.previewMs > 0);
    assert(metrics.lod > 0);
    assert(metrics.meshes >= 8);
    report.firstLoad = metrics;
    report.environment.actualRenderer = await page.evaluate(() => {
      const gl = window.viewer.renderer.getContext(),
        info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    await expect(page.getByTestId('model-load-feedback')).toBeHidden();
  });
  await journey('cancel-retry', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb', async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await boot(page);
    await page.waitForFunction(
      () => window.viewer?.loading?.getSnapshot().phase === 'download',
      null,
      { timeout: 30000 },
    );
    await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
    assert.equal(await page.evaluate(() => window.viewer.loading.getSnapshot().phase), 'cancelled');
    await page.unroute('**/_perf/model.glb');
    release();
    await page.evaluate(() => window.viewer.loadModelWithProgress('/_perf/model.glb'));
    await ready(page);
  });
  await journey('bad-package-falls-back', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb', async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await page.route('**/_perf/model.glb.perf.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"schemaVersion":999}',
      }),
    );
    await boot(page);
    await page.waitForFunction(() => window.viewer?.loading?.getSnapshot().warning, null, {
      timeout: 30000,
    });
    release();
    await ready(page);
    assert.equal(await page.evaluate(() => window.viewer.loading.getSnapshot().warning), true);
    assert.equal(await page.evaluate(() => window.viewer.loading.getSnapshot().preview), false);
  });
  await journey('slow-package-does-not-block-source', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb.perf.json', async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await boot(page);
      await ready(page);
      assert.equal(await page.evaluate(() => window.viewer.loading.getSnapshot().preview), false);
    } finally {
      release();
    }
  });
  await journey('stale-source-hash-falls-back', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb', async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await page.route('**/_perf/model.glb.perf.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...prepared.manifest,
          source: { ...prepared.manifest.source, sha256: '0'.repeat(64) },
        }),
      }),
    );
    await boot(page);
    await page.waitForFunction(() => window.viewer?.loading?.getSnapshot().preview, null, {
      timeout: 30000,
    });
    release();
    await ready(page);
    const actual = await page.evaluate(() => ({
      state: window.viewer.loading.getSnapshot(),
      lod: window.viewer._runtimeLod?.size ?? 0,
    }));
    assert.equal(actual.state.warning, true);
    assert.equal(actual.state.preview, false);
    assert.equal(actual.lod, 0);
  });
  await journey('failed-source-keeps-preview', async (page) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/_perf/model.glb', async (route) => {
      await gate;
      await route.fulfill({ status: 404, body: 'Missing source' });
    });
    await boot(page);
    await page.waitForFunction(() => window.viewer?.loading?.getSnapshot().preview, null, {
      timeout: 30000,
    });
    release();
    await page.waitForFunction(
      () => window.viewer?.loading?.getSnapshot().phase === 'error',
      null,
      { timeout: 30000 },
    );
    assert.equal(await page.evaluate(() => window.viewer.loading.getSnapshot().preview), true);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    await page.unroute('**/_perf/model.glb');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await ready(page);
  });
  await journey('quality-and-repeated-loads', async (page) => {
    // Force each real load through the preview/LOD path, including on a fast loopback server.
    await page.route('**/_perf/model.glb', async route => {
      await page.waitForFunction(() => window.viewer?.loading?.getSnapshot().preview, null, {timeout:30000});
      await route.continue();
    });
    await boot(page);
    await ready(page);
    const result = await page.evaluate(async () => {
      const v = window.viewer,
        preferences = localStorage.getItem('rv-visual-settings');
      v.adaptiveQuality.setMode('auto', 2, 0);
      for (let t = 40; t < 7000; t += 40) v.adaptiveQuality.sample(t, true);
      const tier = v.adaptiveQuality.getSnapshot().tier;
      v.adaptiveQuality.setMode('high');
      const counts = [], textures = [], lod = [];
      for (let i = 0; i < 4; i++) {
        await v.loadModelWithProgress('/_perf/model.glb');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        v.renderFrameForCapture();
        counts.push(v.renderer.info.memory.geometries);
        textures.push(v.renderer.info.memory.textures);
        lod.push(v._runtimeLod?.size ?? 0);
      }
      return {
        tier,
        counts,
        textures,
        lod,
        unchanged: preferences === localStorage.getItem('rv-visual-settings'),
        quality: v.adaptiveQuality.getSnapshot(),
      };
    });
    assert.equal(result.tier, 1);
    assert.equal(result.quality.mode, 'high');
    assert(result.unchanged);
    assert.equal(result.counts.at(-1), result.counts[0]);
    assert.equal(result.textures.at(-1), result.textures[0]);
    assert(result.lod.every(count => count > 0));
    report.resources = result;
  });
  await journey('manual-quality-ui', async (page) => {
    await boot(page);
    await ready(page);
    // Fresh software-GPU profiles show the existing first-run quality notice.
    await page.addLocatorHandler(page.getByTestId('auto-quality-ok'), async () => {
      await page.getByTestId('auto-quality-ok').click();
    });
    await page
      .getByRole('button', { name: /^Settings/ })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Visual', exact: true }).click();
    await page.getByRole('combobox', { name: 'Performance and quality', exact: true }).click();
    await page.getByRole('option', { name: 'Fast', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.viewer.adaptiveQuality.getSnapshot().mode),
      'fast',
    );
    const resolution = page
      .getByText('Resolution', { exact: true })
      .locator('..')
      .getByRole('slider');
    await resolution.focus();
    await resolution.press('Home');
    const actual = await page.evaluate(() => ({
      mode: window.viewer.adaptiveQuality.getSnapshot().mode,
      ratio: window.viewer.renderer.getPixelRatio(),
      saved: JSON.parse(localStorage.getItem('rv-visual-settings')).maxDpr,
      preference: localStorage.getItem('rv-performance-quality-v1'),
    }));
    assert.equal(actual.mode, 'manual');
    assert.equal(actual.preference, 'manual');
    assert.equal(actual.ratio, 0.5);
    assert.equal(actual.saved, 0.5);
    report.manualSettings = actual;
  });
  await journey('cancel-deferred-work', async (page) => {
    await boot(page);
    await ready(page);
    await page.evaluate(() => {
      const v = window.viewer;
      window.perfOldRoot = v.currentModelRoot.uuid;
      v.trackLoadingWork(
        new Promise((resolve) => {
          window.perfRelease = resolve;
        }),
      );
      window.perfPending = v.loadModelWithProgress('/_perf/model.glb');
    });
    await page.waitForFunction(
      () => {
        const v = window.viewer;
        return (
          v.currentModelRoot &&
          v.currentModelRoot.uuid !== window.perfOldRoot &&
          v.loading.getSnapshot().phase === 'batch'
        );
      },
      null,
      { timeout: 30000 },
    );
    await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
    await page.waitForFunction(() => !window.viewer.currentModelRoot, null, { timeout: 5000 });
    const result = await page.evaluate(() => window.perfPending);
    assert.equal(result.ok, false);
    // The abandoned promise remains unresolved while the next model finishes.
    await page.evaluate(() => window.viewer.loadModelWithProgress('/_perf/model.glb'));
    await ready(page);
    await page.evaluate(() => window.perfRelease());
  });
  if (only && !report.journeys.length) throw new Error(`Unknown journey: ${only}`);
  const rounds = benchmarking ? 30 : 0;
  for (let i = 0; i < rounds; i++)
    await journey(`cold-${i + 1}`, async (page, context) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 20,
        downloadThroughput: 100_000_000 / 8,
        uploadThroughput: 100_000_000 / 8,
      });
      const started = Date.now();
      await boot(page);
      await ready(page);
      const load = await page.evaluate(() => ({
        ...window.viewer.loading.getSnapshot(),
        feedbackMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      }));
      report.benchmarks.push({
        navigationMs: Date.now() - started,
        overviewFromNavigationMs: load.previewMs === null ? null : load.startedAt + load.previewMs,
        ...load,
      });
    });
  for (let i = 0; i < rounds; i++)
    await journey(`baseline-${i + 1}`, async (page, context) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 20,
        downloadThroughput: 100_000_000 / 8,
        uploadThroughput: 100_000_000 / 8,
      });
      await page.route('**/_perf/model.glb.perf.json', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
      await boot(page);
      await ready(page);
      report.baseline.push(
        await page.evaluate(() => {
          const s = window.viewer.loading.getSnapshot();
          return { completeMs: s.startedAt + s.elapsedMs, loadMs: s.elapsedMs };
        }),
      );
    });
  if (rounds)
    await journey('warm-repeat', async (page) => {
      await boot(page);
      await ready(page);
      for (let i = 0; i < rounds; i++)
        report.warm.push(
          await page.evaluate(async () => {
            await window.viewer.loadModelWithProgress('/_perf/model.glb');
            return window.viewer.loading.getSnapshot();
          }),
        );
      report.orbit = await page.evaluate(async () => {
        const v = window.viewer,
          target = v.controls.target.clone(),
          radius = v.camera.position.distanceTo(target),
          intervals = [];
        const started = performance.now();
        let previous = started;
        await new Promise((resolve) => {
          const step = (now) => {
            intervals.push(now - previous);
            previous = now;
            const angle = ((now - started) / 10000) * Math.PI * 2;
            v.camera.position.set(
              target.x + Math.cos(angle) * radius,
              target.y + radius * 0.4,
              target.z + Math.sin(angle) * radius,
            );
            v.controls.update();
            v._renderDirty = true;
            if (now - started < 10000) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
        const elapsed = previous - started;
        return {
          durationMs: elapsed,
          frames: intervals.length,
          averageFps: (intervals.length * 1000) / elapsed,
          p95FrameMs: intervals.sort((a, b) => a - b)[Math.ceil(intervals.length * 0.95) - 1],
          renderedTriangles: v.renderer.info.render.triangles,
        };
      });
    });
  if (rounds) {
    const p95 = (values) => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
    report.p95 = {
      overviewMs: p95(report.benchmarks.map((x) => x.overviewFromNavigationMs ?? Infinity)),
      completeMs: p95(report.benchmarks.map((x) => x.elapsedMs)),
      navigationMs: p95(report.benchmarks.map((x) => x.navigationMs)),
      baselineCompleteMs: p95(report.baseline.map((x) => x.completeMs)),
      warmLoadMs: p95(report.warm.map((x) => x.elapsedMs)),
      feedbackMs: p95(report.benchmarks.map((x) => x.feedbackMs ?? Infinity)),
    };
  }
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
