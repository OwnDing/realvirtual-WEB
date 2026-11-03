// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { test, expect, type Page } from 'playwright/test';
import { pinLocale } from './helpers/pin-locale';

/**
 * EP-E2E-001 #4–5. A fresh profile is a first visit, so the product
 * introduction opens itself and swallows the Settings click; it is marked as
 * seen up front. The camera is read from THIS page's viewer: the dev server's
 * `/__api/debug` holds a single snapshot that every open page overwrites once a
 * second (so a parallel worker could answer), and that snapshot never carried
 * a camera at all.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rv-welcome-dismissed', '1'));
});

async function cameraX(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as {
    __rvViewer: { camera: { position: { x: number } } };
  }).__rvViewer.camera.position.x);
}

test('save and restore camera start position across reload', async ({ page }) => {
  // English is pinned rather than inherited: the Settings panel this spec drives
  // is migrated (batch 2) and the product default is Chinese, so the pin is what
  // makes the English assertions below mean anything.
  await pinLocale(page, 'en-US');
  await page.goto('/?model=DemoRealvirtualWeb.glb');
  await page.waitForSelector('canvas');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500); // settle fit-to-bounds

  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByRole('tab', { name: /Start View/i }).click();
  await page.getByRole('button', { name: /Save current camera/i }).click();
  await expect(page.getByText(/Start view saved/i)).toBeVisible();

  // UI updates immediately (same-tab) — no reload needed
  await expect(page.getByText(/Saved \(user\)/i)).toBeVisible();

  const before = await cameraX(page);

  await page.reload();
  await page.waitForSelector('canvas');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // tween completes (clamped to 1.0s) + buffer

  const after = await cameraX(page);
  const dx = Math.abs(before - after);
  expect(dx).toBeLessThan(0.1);
});

test('Start View tab appears in Settings (EDIT 3)', async ({ page }) => {
  // English is pinned rather than inherited: the Settings panel this spec drives
  // is migrated (batch 2) and the product default is Chinese, so the pin is what
  // makes the English assertions below mean anything.
  await pinLocale(page, 'en-US');
  await page.goto('/?model=DemoRealvirtualWeb.glb');
  await page.waitForSelector('canvas');
  await page.getByRole('button', { name: /Settings/i }).click();
  await expect(page.getByRole('tab', { name: /Start View/i })).toBeVisible();
});
