// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { expect, test, type Page } from 'playwright/test';
import { pinLocale } from './helpers/pin-locale';

async function openDemoHmi(page: Page): Promise<void> {
  await pinLocale(page, 'en-US');
  await page.goto('/?model=DemoRealvirtualWeb.glb&mode=hmi', {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByText('OEE', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
}

test.describe('HMI layout regressions', () => {
  test.use({ viewport: { width: 1280, height: 300 } });

  test('WebGL stays full-browser beneath the HMI overlays', async ({ page }) => {
    await openDemoHmi(page);

    const viewport = await page.locator('#rv-viewport').boundingBox();
    const canvas = await page.locator('canvas').first().boundingBox();
    expect(viewport).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(viewport!.x).toBe(0);
    expect(viewport!.y).toBe(0);
    expect(viewport!.width).toBe(1280);
    expect(viewport!.height).toBe(300);
    expect(canvas!.x).toBe(0);
    expect(canvas!.y).toBe(0);
    expect(canvas!.width).toBe(1280);
    expect(canvas!.height).toBe(300);
  });

  test('the message collapse control stays visible when cards overflow', async ({ page }) => {
    await openDemoHmi(page);

    const collapse = page.getByRole('button', { name: 'Minimize messages' });
    await expect(collapse).toBeVisible();
    const box = await collapse.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  });
});
