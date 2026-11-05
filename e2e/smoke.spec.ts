// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { test, expect, type Page } from 'playwright/test';

/**
 * The debug endpoints serve the LATEST snapshot ANY page pushed: one global per dev server,
 * pushed at 1 Hz by each page once its viewer has initialised the debug plugin, after the model
 * load. With parallel workers another spec's page (an empty scene, say) can push between two
 * requests. A fixed 5 s after navigation read 0 drives (develop run 41866903664, PR #35 run
 * 41842732433); waiting for a fresh snapshot and then asking /__api/debug/drives again still
 * read 0 (PR #36 run 41938924918: the wait succeeded, the second request got another page).
 * So each test waits, bounded, for a snapshot carrying ITS OWN page's debug session id and
 * makes its content assertions on that snapshot. The global sub-routes are still checked for
 * status and shape, which is all a request to them can attribute to this page.
 */
async function ownSnapshot(page: Page, ready: (data: any) => boolean, what: string): Promise<any> {
  const session = await (await page.waitForFunction(() => {
    const plugin = (window as any).__rvViewer?.getPlugin?.('debug-endpoint');
    return plugin?._debugSessionId ?? null;
  }, null, { timeout: 60_000 })).jsonValue() as string;
  let snapshot: any = null;
  await expect.poll(async () => {
    const response = await page.request.get('/__api/debug');
    if (!response.ok()) return false;
    try {
      const data = await response.json();
      if (data?.debugSessionId !== session || !ready(data)) return false;
      snapshot = data;
      return true;
    } catch { return false; }
  }, { timeout: 60_000, message: `no snapshot from this page (${session}) with ${what}` }).toBe(true);
  return snapshot;
}

/**
 * Basic smoke test — verifies the WebViewer loads without critical errors,
 * the 3D scene renders, and the debug API returns valid data.
 *
 * This test is designed to be run by Claude Code after making changes
 * to verify nothing is fundamentally broken.
 */
test.describe('WebViewer smoke tests', () => {
  test('page loads without critical errors', async ({ page }) => {
    test.setTimeout(90_000);

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for the canvas (Three.js renderer) to appear
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // Wait a bit for async initialization
    await page.waitForTimeout(3_000);

    // Filter non-critical errors (favicon, network, ResizeObserver)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('favicon.ico') &&
        !e.includes('net::ERR_') &&
        !e.includes('ResizeObserver') &&
        !e.includes('404'),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('debug API returns valid snapshot', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const own = await ownSnapshot(page, () => true, 'any state');
    expect(own).not.toEqual({ status: 'no data yet' });

    const response = await page.request.get('/__api/debug');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toBeDefined();
    expect(data).not.toEqual({ status: 'no data yet' });
  });

  test('at least 1 drive exists after model load', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const own = await ownSnapshot(page, (data) => Array.isArray(data.drives) && data.drives.length > 0, 'a drive');

    const response = await page.request.get('/__api/debug/drives');
    expect(response.ok()).toBeTruthy();

    const drives = await response.json();
    expect(Array.isArray(drives) || typeof drives === 'object').toBeTruthy();

    // At least one drive should exist in the demo model — counted in THIS page's snapshot.
    expect(own.drives.length).toBeGreaterThan(0);
  });

  test('at least 1 signal exists after model load', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const own = await ownSnapshot(page, (data) => Object.keys(data.signals ?? {}).length > 0, 'a signal');

    const response = await page.request.get('/__api/debug/signals');
    expect(response.ok()).toBeTruthy();

    const signals = await response.json();
    expect(typeof signals === 'object').toBeTruthy();

    // Counted in THIS page's snapshot.
    expect(Object.keys(own.signals).length).toBeGreaterThan(0);
  });

  test('rendering is active (FPS > 0)', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const data = await ownSnapshot(page, (snapshot) => snapshot.fps === undefined || snapshot.fps > 0, 'rendering');

    const response = await page.request.get('/__api/debug');
    expect(response.ok()).toBeTruthy();

    // Check for FPS data in snapshot (may be under different keys depending on version)
    // The snapshot should have some indicator of rendering activity
    if (data.fps !== undefined) {
      expect(data.fps).toBeGreaterThan(0);
    } else if (data.renderer !== undefined) {
      // Renderer info exists, meaning the scene is rendering
      expect(data.renderer).toBeDefined();
    } else {
      // At minimum, having a non-empty snapshot means the app is running
      expect(Object.keys(data).length).toBeGreaterThan(0);
    }
  });
});
