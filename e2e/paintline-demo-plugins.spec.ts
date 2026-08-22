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

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from 'playwright/test';

/** Carrier count comes from the generator's sidecar, never a pinned literal. */
const CARRIER_COUNT = (JSON.parse(readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)), '..',
  'public', 'library', 'PaintLine', 'paintline-geometry.json',
), 'utf8')) as { carrierCount: number }).carrierCount;
/** Two workpieces hang from every carrier. */
const WORKPIECES = CARRIER_COUNT * 2;

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
  // behavior and the model plugins come up together, and the booth robot's six
  // joint drives only exist once they have.
  await expect.poll(
    async () => page.evaluate(() => {
      const v = (window as unknown as { viewer?: { drives?: { name: string }[] } }).viewer;
      return (v?.drives ?? []).filter((d) => /^A[1-6]$/.test(d.name.replace(/_\d+$/, ''))).length;
    }),
    { timeout: 45_000, message: 'the DemoPaintLine plugin pack never bound' },
  ).toBe(6);
}

/**
 * Sample every robot joint IN-PAGE for `ms`, returning each one's travel.
 *
 * Sampling by repeated `page.evaluate` round-trips aliases badly: each call
 * traverses a 600-node scene, so the interval drifts towards the motion period
 * and every sample lands at the same phase — which reads as "nothing moved"
 * while the arm is in fact running its full sweep.
 */
function jointTravel(page: Page, ms: number) {
  return page.evaluate(async (durationMs) => {
    const viewer = (window as unknown as {
      viewer: { drives?: { name: string; currentPosition: number }[] };
    }).viewer;
    const base = (n: string) => n.replace(/_\d+$/, '');
    const span: Record<string, { min: number; max: number }> = {};

    const until = performance.now() + durationMs;
    while (performance.now() < until) {
      for (const d of viewer.drives ?? []) {
        const n = base(d.name);
        if (!/^A[1-6]$/.test(n)) continue;
        const s = span[n] ?? (span[n] = { min: Infinity, max: -Infinity });
        s.min = Math.min(s.min, d.currentPosition);
        s.max = Math.max(s.max, d.currentPosition);
      }
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return Object.fromEntries(Object.entries(span).map(([k, s]) => [k, s.max - s.min]));
  }, ms);
}

/** Workpiece finish split and per-instance material count. */
function readPack(page: Page) {
  return page.evaluate(() => {
    const viewer = (window as unknown as { viewer: Record<string, never> }).viewer as unknown as {
      scene?: { traverse(cb: (o: Record<string, never>) => void): void };
    };
    const base = (n: string) => n.replace(/_\d+$/, '');

    let painted = 0;
    let raw = 0;
    const materials = new Set<string>();
    viewer.scene?.traverse((node: Record<string, never>) => {
      const n = node as unknown as {
        name: string;
        material?: { uuid: string; color?: { r: number; g: number; b: number } };
      };
      const bn = base(n.name);
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
    return { painted, raw, distinctMaterials: materials.size };
  });
}

test.describe('paint-line demo plugin pack', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('binds by folder name and moves the booth robot', async ({ page }) => {
    await openScene(page);

    const travel = await jointTravel(page, 8_000);
    expect(Object.keys(travel).sort(), 'the six-axis chain did not bind')
      .toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);

    // The wrist sweeps across the workpiece and the base tracks the hanger
    // along the booth; the remaining joints hold a fixed spray posture, so
    // only these two are asserted to travel.
    expect(travel.A5, 'the wrist never swept').toBeGreaterThan(30);
    expect(travel.A1, 'the base never tracked a hanger').toBeGreaterThan(10);
  });

  test('keeps the base yaw within a working arc, not whipping round', async ({ page }) => {
    await openScene(page);

    // Measuring the yaw in WORLD terms made it flip between +146° and -146°
    // whenever the nearest hanger changed, and the arm swung 293° the long way
    // round — 321° of travel in eight seconds. Measured from the robot's own
    // facing it is a calm arc, and this pins that.
    const travel = await jointTravel(page, 8_000);
    expect(travel.A1, 'the base whipped round instead of tracking').toBeLessThan(180);
  });

  test('gives every workpiece its own material and paints past the booth', async ({ page }) => {
    await openScene(page);
    const state = await readPack(page);

    // Every part is cloned — a shared material would recolour all of them at
    // once, which is exactly the bug this pins.
    expect(state.distinctMaterials).toBe(WORKPIECES);
    expect(state.painted + state.raw).toBe(WORKPIECES);
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

  /** Numeric KPI reading, or null when the tile is absent or shows "—". */
  async function kpiNumber(page: Page, label: string): Promise<number | null> {
    const raw = await kpiValue(page, label);
    if (raw === null || raw === '—') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * The text of the KPI tile whose label matches, or null.
   *
   * Case-INSENSITIVE: `KpiCard` uppercases its label in CSS, so the rendered
   * text is "CYCLE". A case-sensitive lookup silently found nothing and the
   * poll below then timed out as though no KPI had ever been measured.
   */
  async function kpiValue(page: Page, label: string): Promise<string | null> {
    const lines = (await page.evaluate(() => document.body.innerText))
      .split('\n').map((l) => l.trim()).filter(Boolean);
    const want = label.toLowerCase();
    const i = lines.findIndex((l) => l.toLowerCase() === want);
    return i >= 0 && i + 1 < lines.length ? lines[i + 1] : null;
  }

  test('measures real cycle time and throughput off the running line', async ({ page }) => {
    test.setTimeout(300_000);
    await openScene(page, 'en-US');

    // A reading has to APPEAR — it starts as "—" because no two hangers have
    // passed the counting plane yet. That is the point: nothing is pre-seeded.
    //
    // Polled as a NUMBER, not as "not the dash": a missing tile reads as null,
    // and `null !== '—'` would satisfy the poll instantly and then compare 0.
    await expect.poll(
      async () => await kpiNumber(page, 'Cycle'),
      { timeout: 180_000, message: 'no cycle time was ever measured' },
    ).not.toBeNull();

    const cycle = (await kpiNumber(page, 'Cycle'))!;
    // 145.4 m loop / 72 hangers / 300 mm/s = 6.7 s. A wide band still separates
    // a real measurement from a decorative constant.
    expect(cycle).toBeGreaterThan(4);
    expect(cycle).toBeLessThan(11);

    const perHour = (await kpiNumber(page, 'Throughput'))!;
    // Two pieces per hanger, so throughput and cycle must agree with EACH
    // OTHER — tiles fed by their own generator would not. Compared relatively:
    // the cycle tile shows one decimal and the throughput tile a whole number,
    // so a 6.735 s cycle prints as 6.7 and reconstructs ~5 p/h off. That
    // rounding is display-only and must not fail the agreement check.
    const implied = (3600 / cycle) * 2;
    expect(Math.abs(perHour - implied) / implied,
      `throughput ${perHour} disagrees with cycle ${cycle}`).toBeLessThan(0.03);
  });

  test('stops reporting a cycle time when the line stops', async ({ page }) => {
    test.setTimeout(420_000);
    await openScene(page, 'en-US');
    await expect.poll(async () => await kpiNumber(page, 'Cycle'), { timeout: 180_000 }).not.toBeNull();

    await page.evaluate(() => {
      const store = (window as unknown as {
        viewer: { signalStore?: { set(n: string, v: boolean): void } };
      }).viewer.signalStore;
      store?.set('PaintLineOverheadConveyor.OverheadConveyor.Run', false);
    });

    // The honesty rule: a stopped line has NO current cycle time. Keeping the
    // last one would be indistinguishable from a live reading.
    await expect.poll(
      async () => await kpiValue(page, 'Cycle'),
      { timeout: 180_000, message: 'a stopped line kept showing its last cycle time' },
    ).toBe('—');
    expect(await kpiValue(page, 'Throughput')).toBe('—');
  });
});
