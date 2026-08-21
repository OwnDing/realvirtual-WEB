// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-DEMO-001 M3 — the paint-line demo's model plugin pack and Kiosk tour.
 *
 * The pack binds by FOLDER NAME (`src/plugins/models/DemoPaintLine/`), with no
 * `models[]` array — that field is deprecated. Nothing warns if the binding
 * silently stops matching; the line simply loses its reciprocator, its colour
 * change and its tour while still rendering perfectly. Hence these tests.
 *
 * The colour-change assertions read material colours off the meshes rather
 * than pixels, so they do not depend on the renderer or the camera.
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

async function openScene(page: Page, locale = 'zh-CN'): Promise<void> {
  await page.addInitScript((loc) => {
    localStorage.setItem('rv-terms-accepted', '1');
    localStorage.setItem('rv-language', JSON.stringify({ v: 1, locale: loc }));
  }, locale);
  await page.goto('/?scene=published:DemoPaintLine', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  // The welcome modal re-renders once a tour registers, so dismiss repeatedly.
  for (let i = 0; i < 4; i++) {
    const dismiss = page.locator('[data-testid="welcome-dismiss"]');
    if (!(await dismiss.count())) break;
    await dismiss.first().click({ force: true, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(4_000);
  // Wait for the pack to actually bind rather than guessing a sleep: the chain
  // behavior and the model plugins come up together, and the reciprocator only
  // exists once they have.
  await expect.poll(
    async () => page.evaluate(() => {
      const v = (window as unknown as { viewer?: { drives?: { name: string }[] } }).viewer;
      return (v?.drives ?? []).some((d) => d.name.replace(/_\d+$/, '') === 'Drive-Lin-Y');
    }),
    { timeout: 45_000, message: 'the DemoPaintLine plugin pack never bound' },
  ).toBe(true);
}

/** Reciprocator drive state, workpiece finish split, spray-fan visibility. */
function readPack(page: Page) {
  return page.evaluate(() => {
    const viewer = (window as unknown as { viewer: Record<string, never> }).viewer as unknown as {
      drives?: { name: string; currentPosition: number; jogForward: boolean; jogBackward: boolean }[];
      scene?: { traverse(cb: (o: Record<string, never>) => void): void };
    };
    const base = (n: string) => n.replace(/_\d+$/, '');
    const drive = (viewer.drives ?? []).find((d) => base(d.name) === 'Drive-Lin-Y') ?? null;

    let fans = 0;
    let painted = 0;
    let raw = 0;
    const materials = new Set<string>();
    viewer.scene?.traverse((node: Record<string, never>) => {
      const n = node as unknown as {
        name: string;
        material?: { uuid: string; color?: { r: number; g: number; b: number } };
      };
      const bn = base(n.name);
      if (bn.startsWith('Spray-Fan-')) fans++;
      if (/^Workpiece-[AB]$/.test(bn) && n.material?.color) {
        materials.add(n.material.uuid);
        const c = n.material.color;
        // "Painted" is detected as one of the two finishes the plugin applies,
        // NOT by comparing against a hardcoded bare-steel value: the viewer
        // swaps in a shared `__rvUberMaterial` whose `.color` starts white, so
        // the asset's own baseColorFactor is not what sits in `.color`.
        const isFinish = (r: number, g: number, b: number) =>
          Math.abs(c.r - r) < 0.02 && Math.abs(c.g - g) < 0.02 && Math.abs(c.b - b) < 0.02;
        if (isFinish(0.78, 0.16, 0.16) || isFinish(0.16, 0.34, 0.72)) painted++;
        else raw++;
      }
    });
    return {
      drive: drive && {
        position: drive.currentPosition,
        jogForward: drive.jogForward,
        jogBackward: drive.jogBackward,
      },
      fans,
      painted,
      raw,
      distinctMaterials: materials.size,
    };
  });
}

test.describe('paint-line demo plugin pack', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('binds by folder name and drives the booth reciprocator', async ({ page }) => {
    await openScene(page);

    const first = await readPack(page);
    expect(first.drive, 'the pack did not bind — no Drive-Lin-Y under its control').not.toBeNull();
    expect(first.fans, 'spray fans should exist in the booth asset').toBe(6);

    await page.waitForTimeout(4_000);
    const second = await readPack(page);
    expect(second.drive!.position, 'the carriage must be stroking')
      .not.toBeCloseTo(first.drive!.position, 1);
    // Exactly one jog direction is active at a time.
    expect(second.drive!.jogForward).not.toBe(second.drive!.jogBackward);
  });

  test('reverses the stroke at the authored limits', async ({ page }) => {
    await openScene(page);

    // Sample across more than one full stroke (1.2 m at 700 mm/s ≈ 1.7 s each
    // way) and assert the travel stays inside the limits and turns around.
    const seen: number[] = [];
    const directions = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const s = await readPack(page);
      seen.push(s.drive!.position);
      directions.add(s.drive!.jogForward ? 'up' : 'down');
      await page.waitForTimeout(500);
    }
    expect(Math.min(...seen), 'carriage dropped below the lower limit').toBeGreaterThanOrEqual(-1);
    expect(Math.max(...seen), 'carriage rose above the upper limit').toBeLessThanOrEqual(1201);
    expect(directions.size, 'the stroke never reversed').toBe(2);
  });

  test('gives every workpiece its own material and paints past the booth', async ({ page }) => {
    await openScene(page);
    const state = await readPack(page);

    // 40 hangers x 2 parts, each cloned — a shared material would recolour all.
    expect(state.distinctMaterials).toBe(80);
    expect(state.painted + state.raw).toBe(80);
    // Both finishes are present at once: the loop always has parts on each side
    // of the booth, so neither count may be zero.
    expect(state.painted, 'no painted parts — coating never ran').toBeGreaterThan(0);
    expect(state.raw, 'no raw parts — everything painted at once').toBeGreaterThan(0);
  });

  test('registers a Kiosk tour for this model', async ({ page }) => {
    await openScene(page);
    const snapshot = await page.evaluate(() => {
      const viewer = (window as unknown as { viewer: { getPlugin(id: string): unknown } }).viewer;
      const kiosk = viewer.getPlugin('kiosk') as { getSnapshot?: () => unknown } | null;
      return kiosk?.getSnapshot?.() ?? null;
    });
    expect(snapshot).toMatchObject({ hasTour: true, hasCurrentModelTour: true, tourName: 'DemoPaintLine' });
  });

  test('narrates in the UI language and shows one caption at a time', async ({ page }) => {
    await openScene(page, 'zh-CN');
    await page.evaluate(() => {
      const viewer = (window as unknown as { viewer: { getPlugin(id: string): unknown } }).viewer;
      (viewer.getPlugin('kiosk') as { startKiosk(): void } | null)?.startKiosk();
    });
    await page.waitForTimeout(6_000);

    const zh = await page.evaluate(() => document.body.innerText);
    expect(zh, 'Chinese caption missing').toContain('连续输送式涂装线');

    // A stable instruction id means each step REPLACES the previous caption.
    // Without it all seven stack up on screen at once.
    const captionCount = zh.split('\n').filter((l) => l.includes('—') && l.includes('涂装线')).length;
    expect(captionCount, 'captions are stacking instead of replacing').toBe(1);
  });

  test('narrates in English when the UI is English', async ({ page }) => {
    await openScene(page, 'en-US');
    await page.evaluate(() => {
      const viewer = (window as unknown as { viewer: { getPlugin(id: string): unknown } }).viewer;
      (viewer.getPlugin('kiosk') as { startKiosk(): void } | null)?.startKiosk();
    });
    await page.waitForTimeout(6_000);
    expect(await page.evaluate(() => document.body.innerText))
      .toContain('Continuous conveyorised paint line');
  });
});
