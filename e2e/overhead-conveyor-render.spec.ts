// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-CONV-001 M1 — the circulating chain has to be VISIBLE, not just simulated.
 *
 * Three separate things classified a driveless conveyor as scenery, and each
 * one on its own is enough to freeze the picture while every simulation value
 * keeps advancing:
 *
 *   1. `rv-freeze-static` stopped updating the carrier matrices,
 *   2. `rv-scene-loader`'s mesh merge baked them into the root-parented arena
 *      ("which cannot move by construction"),
 *   3. render-on-demand never got a dirty flag, because only a running RVDrive
 *      raises one.
 *
 * The library object is loaded ON ITS OWN here, with no model plugin pack and
 * no other moving drive in the scene, so nothing can mask a regression the way
 * the demo scene's spray-booth reciprocator did for three milestones.
 */

import { test, expect, type Page } from 'playwright/test';

test.use({
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  },
});

const MODEL = '/?model=/library/PaintLine/PaintLineOverheadConveyor.glb';

async function openBareConveyor(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('rv-terms-accepted', '1'));
  await page.goto(MODEL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  for (let i = 0; i < 4; i++) {
    const dismiss = page.locator('[data-testid="welcome-dismiss"]');
    if (!(await dismiss.count())) break;
    await dismiss.first().click({ force: true, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(10_000);
  await page.evaluate(() => {
    const c = (window as unknown as { viewer: { renderer: { domElement: HTMLElement } } })
      .viewer.renderer.domElement;
    c.setAttribute('data-main-canvas', '1');
  });
}

/** No plugin pack is bound to this model, so there is no other mover at all. */
function otherDrives(page: Page) {
  return page.evaluate(() => (
    (window as unknown as { viewer: { drives?: unknown[] } }).viewer.drives ?? []
  ).length);
}

test.describe('overhead conveyor renders its motion', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('repaints while the chain runs, with nothing else moving', async ({ page }) => {
    await openBareConveyor(page);
    expect(await otherDrives(page), 'this scene must contain no drive at all').toBe(0);

    const canvas = page.locator('[data-main-canvas]');
    const before = await canvas.screenshot();
    await page.waitForTimeout(5_000);
    const after = await canvas.screenshot();

    expect(Buffer.compare(before, after), 'the chain moved but the canvas never repainted')
      .not.toBe(0);
  });

  test('stops repainting when the chain is stopped', async ({ page }) => {
    await openBareConveyor(page);

    // The saving render-on-demand exists for must survive: a STOPPED chain has
    // to stop asking for frames, or the fix would just pin the renderer on.
    //
    // The signal name depends on the LOAD PATH: bound to the scene root (this
    // `?model=` case) the component publishes `OverheadConveyor.Run`, while a
    // placed LayoutObject prefixes it with the placement name. Resolve it by
    // probing instead of hardcoding — `getBool` on an unknown name silently
    // returns false, so a wrong guess reads as "already stopped" and the test
    // passes while asserting nothing.
    const stopped = await page.evaluate(() => {
      const store = (window as unknown as {
        viewer: { signalStore?: {
          get(n: string): unknown; set(n: string, v: boolean): void;
        } };
      }).viewer.signalStore;
      if (!store) return null;
      const name = ['OverheadConveyor.Run', 'PaintLineOverheadConveyor.OverheadConveyor.Run']
        .find((n) => store.get(n) !== undefined);
      if (!name) return null;
      store.set(name, false);
      return name;
    });
    expect(stopped, 'could not resolve the chain Run signal').not.toBeNull();
    // Let the ramp decelerate to a standstill before sampling.
    await page.waitForTimeout(6_000);

    const canvas = page.locator('[data-main-canvas]');
    const before = await canvas.screenshot();
    await page.waitForTimeout(4_000);
    const after = await canvas.screenshot();

    expect(Buffer.compare(before, after), 'a stopped chain kept requesting redraws')
      .toBe(0);
  });
});
