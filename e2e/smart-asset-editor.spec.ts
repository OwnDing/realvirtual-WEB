// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { expect, test } from 'playwright/test';
import path from 'node:path';
import { pinLocale } from './helpers/pin-locale';

test('public smart asset editor authors, validates and publishes a reusable GLB', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  // Headless Chromium cannot grant persistent storage. Keep that environment
  // notice from covering the editor tabs; storage behavior has its own tests.
  await page.addInitScript(() => {
    sessionStorage.setItem('rv-storage-persist-dismissed', '1');
    sessionStorage.setItem('rv-gpu-warning-dismissed', '1');
  });
  await pinLocale(page, 'en-US');

  await page.goto('/?mode=editor', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const viewer = (window as any).__rvViewer;
    return viewer?.modes.activeMode === 'editor'
      && viewer?.getPlugin('asset-editor')?.getSnapshot().status === 'ready';
  }, null, { timeout: 90_000 });

  const welcomeDismiss = page.getByTestId('welcome-dismiss');
  if (await welcomeDismiss.isVisible().catch(() => false)) await welcomeDismiss.click();
  const qualityOk = page.getByTestId('auto-quality-ok');
  if (await qualityOk.isVisible().catch(() => false)) await qualityOk.click();

  await page.getByTestId('smart-asset-editor-button').click();
  await expect(page.getByTestId('smart-editor-title')).toBeVisible();

  // A fresh base guarantees Save routes to library/Custom rather than copying
  // a built-in source into models/.
  await page.getByTestId('smart-new-asset').click();
  await page.waitForFunction(() => (window as any).__rvViewer
    ?.getPlugin('asset-editor')?.document?.base?.kind === 'empty');

  await page.getByTestId('smart-import-glb').click();
  const dialog = page.locator('[data-testid="unified-import-dialog"]:visible');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles(
    path.resolve('public/library/PaintLine/Workpiece-Bracket.glb'),
  );
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() => {
    const plugin = (window as any).__rvViewer?.getPlugin('asset-editor');
    return plugin?.getSnapshot().status === 'ready'
      && plugin?.getSnapshot().report.meshCount > 0;
  }, null, { timeout: 60_000 });
  // Unified import closes itself after a successful import in some host
  // configurations; close it only when the host leaves it open.
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.locator('button').first().click();
  }
  await expect(dialog).toBeHidden();

  const name = page.getByTestId('smart-asset-name');
  await name.fill('E2E Smart Carton');
  await name.press('Tab');

  const tabs = page.getByTestId('smart-editor-tabs').getByRole('tab');
  await tabs.nth(2).click();
  await page.getByTestId('smart-apply-template').click();
  await page.waitForFunction(() => (window as any).__rvViewer
    ?.getPlugin('asset-editor')?.getSnapshot().report.portCount === 2);

  await tabs.nth(3).click();
  await page.getByTestId('smart-add-signal').click();
  await page.waitForFunction(() => (window as any).__rvViewer
    ?.getPlugin('asset-editor')?.getSnapshot().report.signalCount === 1);

  // A non-dismissible software-GPU warning is expected in headless Chromium
  // and may visually overlap the tab even though it is unrelated to this flow.
  await tabs.nth(4).click({ force: true });
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('smart-publish')).toBeEnabled();
  const before = await page.evaluate(() => {
    const report = (window as any).__rvViewer.getPlugin('asset-editor').getSnapshot().report;
    return { errors: report.errorCount, ports: report.portCount, signals: report.signalCount };
  });
  expect(before).toEqual({ errors: 0, ports: 2, signals: 1 });

  await page.getByTestId('smart-publish').click();
  await page.waitForFunction(() => {
    const plugin = (window as any).__rvViewer?.getPlugin('asset-editor');
    return plugin?.getSnapshot().status === 'ready'
      && plugin?.document?.base?.kind === 'document';
  }, null, { timeout: 60_000 });
  const saved = await page.evaluate(() => {
    const plugin = (window as any).__rvViewer.getPlugin('asset-editor');
    return { base: plugin.document.base, dirty: plugin.document.dirty };
  });
  expect(saved.base.path).toBe('library/Custom/E2E Smart Carton.glb');
  expect(saved.dirty).toBe(false);

  expect(errors.filter(error => !error.includes('ResizeObserver'))).toEqual([]);
});
