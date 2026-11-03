// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { test, expect } from 'playwright/test';
import { pinLocale } from './helpers/pin-locale';

/**
 * HMI panel interaction tests — verifies that UI panels open/close correctly.
 *
 * Uses the accessibility tree to find buttons and panels by role/name,
 * making these tests resilient to CSS/layout changes.
 */
test.describe('HMI panel interactions', () => {
  test.beforeEach(async ({ page }) => {
    // English is pinned rather than inherited (ADR-0001 Validation). These
    // selectors match on English button text, and the product default is
    // Chinese — without the pin they would match nothing and the cases would
    // `test.skip` themselves into silence rather than fail.
    await pinLocale(page, 'en-US');
    // A fresh browser profile is a first visit, so the product introduction
    // opens itself and its backdrop takes every click (EP-E2E-001 #1–3: all
    // three cases timed out on "<div …> intercepts pointer events"). These
    // cases are about the panels, not the introduction.
    await page.addInitScript(() => localStorage.setItem('rv-welcome-dismissed', '1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for UI to initialize
    await page.waitForSelector('canvas', { timeout: 30_000 });
    await page.waitForTimeout(3_000);
  });

  test('bottom bar renders', async ({ page }) => {
    // The bottom bar should be visible with at least one button/element
    const bottomBar = page.locator('[class*="BottomBar"], [class*="bottombar"], [class*="bottom-bar"]');
    // If class-based selector doesn't work, try finding play/pause controls
    const hasBottomBar = await bottomBar.count() > 0;
    const hasPlayControls = await page.locator('button:has-text("Play"), button:has-text("Pause"), [aria-label*="play"], [aria-label*="Play"]').count() > 0;

    expect(hasBottomBar || hasPlayControls).toBeTruthy();
  });

  /**
   * EP-E2E-001 #1–3. These three cases used to guess at panels through CSS
   * class fragments and `test.skip` themselves when a guess missed — so for as
   * long as the introduction blocked every click they reported nothing at all.
   * They now assert the panel the button is FOR, by role, and fail when it is
   * absent instead of skipping.
   */
  async function leftPanel(page: import('playwright/test').Page): Promise<string | null> {
    return page.evaluate(() => (window as unknown as {
      __rvViewer: { leftPanelManager: { getSnapshot: () => { left: { activePanel: string | null } } } };
    }).__rvViewer.leftPanelManager.getSnapshot().left.activePanel);
  }

  test('settings button opens settings panel', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Start View', exact: true })).toBeVisible();
    await expect.poll(() => leftPanel(page)).toBe('settings');
  });

  test('hierarchy button opens hierarchy panel', async ({ page }) => {
    await page.getByRole('button', { name: 'Hierarchy', exact: true }).click();
    const tree = page.getByRole('tree');
    await expect(tree).toBeVisible();
    await expect(tree.getByRole('treeitem').first()).toBeVisible();
    await expect.poll(() => leftPanel(page)).toBe('hierarchy');
  });

  test('panel can be closed after opening', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Hierarchy', exact: true });
    await toggle.click();
    await expect(page.getByRole('tree')).toBeVisible();

    await toggle.click();
    await expect(page.getByRole('tree')).toBeHidden();
    await expect.poll(() => leftPanel(page)).toBeNull();
  });
});
