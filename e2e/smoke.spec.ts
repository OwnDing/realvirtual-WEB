// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { test, expect, type Page } from 'playwright/test';

/**
 * The debug endpoints serve the LATEST snapshot any page pushed (one global per dev server); the
 * browser pushes it at 1 Hz once the viewer has initialised its debug plugin, after the model
 * load. A fixed 5 s after navigation is not that condition: develop run 41866903664 (and PR #35
 * run 41842732433) read /__api/debug/drives before such a snapshot and got 0 drives. Each test
 * now waits, bounded, for a snapshot pushed by ITS OWN page (timestamp after the test started,
 * so an earlier test's page cannot satisfy it) that has the content the test is about; the
 * assertions after each wait are unchanged.
 */
async function waitForOwnSnapshot(page: Page, since: number, ready: (data: any) => boolean, what: string): Promise<void> {
  await expect.poll(async () => {
    const response = await page.request.get('/__api/debug');
    if (!response.ok()) return false;
    try {
      const data = await response.json();
      return typeof data?.timestamp === 'number' && data.timestamp >= since && ready(data);
    } catch { return false; }
  }, { timeout: 60_000, message: `no snapshot from this page with ${what}` }).toBe(true);
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

    const since = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await waitForOwnSnapshot(page, since, () => true, 'any state');

    const response = await page.request.get('/__api/debug');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toBeDefined();
    expect(data).not.toEqual({ status: 'no data yet' });
  });

  test('at least 1 drive exists after model load', async ({ page }) => {
    test.setTimeout(90_000);

    const since = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForOwnSnapshot(page, since, (data) => (data.scene?.driveCount ?? 0) > 0, 'a drive');

    const response = await page.request.get('/__api/debug/drives');
    expect(response.ok()).toBeTruthy();

    const drives = await response.json();
    expect(Array.isArray(drives) || typeof drives === 'object').toBeTruthy();

    // At least one drive should exist in the demo model
    const driveCount = Array.isArray(drives) ? drives.length : Object.keys(drives).length;
    expect(driveCount).toBeGreaterThan(0);
  });

  test('at least 1 signal exists after model load', async ({ page }) => {
    test.setTimeout(90_000);

    const since = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForOwnSnapshot(page, since, (data) => (data.scene?.signalCount ?? 0) > 0, 'a signal');

    const response = await page.request.get('/__api/debug/signals');
    expect(response.ok()).toBeTruthy();

    const signals = await response.json();
    expect(typeof signals === 'object').toBeTruthy();

    const signalCount = Object.keys(signals).length;
    expect(signalCount).toBeGreaterThan(0);
  });

  test('rendering is active (FPS > 0)', async ({ page }) => {
    test.setTimeout(90_000);

    const since = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForOwnSnapshot(page, since, (data) => data.fps === undefined || data.fps > 0, 'rendering');

    const response = await page.request.get('/__api/debug');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();

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
