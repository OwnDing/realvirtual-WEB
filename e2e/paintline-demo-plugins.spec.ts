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
/**
 * How far each robot joint was COMMANDED and how far it actually MOVED.
 *
 * Two numbers, because one of them is not measurable here. `currentPosition`
 * only advances on a rendered frame, and this suite renders through SwiftShader
 * at ~14 fps falling lower under trace capture — sampling a 2.2 s sine at that
 * rate walks straight past the peaks. It reported a 20° wrist sweep for a sweep
 * measured at a full 69.9° from the rendered geometry, and it did so
 * intermittently, which is worse than failing outright.
 *
 * So the AMPLITUDE is taken from what the plugin commands (wrapping `startMove`
 * catches every target regardless of frame rate) and the realised span is kept
 * only to prove the drive is alive and following. A frozen drive still fails;
 * a slow frame no longer does.
 *
 * `until` then removes the second half of the same problem. The sweep phase
 * advances with SIMULATION time, so a fixed wall-clock window measures how fast
 * the machine is, not how far the wrist goes: running this file alone the 8 s
 * window covered a full 70° sweep, and running it behind two other 3D specs the
 * same window covered 21.95° — the sim had advanced a quarter of a second. Given
 * per-joint targets, sampling stops as soon as they are all met, so the test
 * asserts that the motion HAPPENS rather than that the machine was fast enough
 * to finish it inside an arbitrary window.
 */
function jointTravel(page: Page, ms: number, until?: Record<string, number>) {
  return page.evaluate(async ([durationMs, targets]: [number, Record<string, number> | null]) => {
    const viewer = (window as unknown as {
      viewer: { drives?: { name: string; currentPosition: number; startMove(v: number): void }[] };
    }).viewer;
    const base = (n: string) => n.replace(/_\d+$/, '');
    const span: Record<string, { min: number; max: number }> = {};
    const cmd: Record<string, { min: number; max: number }> = {};
    const track = (bag: Record<string, { min: number; max: number }>, k: string, v: number) => {
      const s = bag[k] ?? (bag[k] = { min: Infinity, max: -Infinity });
      s.min = Math.min(s.min, v);
      s.max = Math.max(s.max, v);
    };

    const joints = (viewer.drives ?? []).filter((d) => /^A[1-6]$/.test(base(d.name)));
    const restore: (() => void)[] = [];
    for (const d of joints) {
      const original = d.startMove.bind(d);
      const n = base(d.name);
      d.startMove = (v: number) => { track(cmd, n, v); original(v); };
      restore.push(() => { delete (d as unknown as Record<string, unknown>).startMove; });
    }

    const met = () => {
      if (!targets) return false;
      return Object.entries(targets).every(([k, v]) => {
        const c = cmd[k];
        return c !== undefined && c.max - c.min >= v;
      });
    };

    const deadline = performance.now() + durationMs;
    while (performance.now() < deadline && !met()) {
      for (const d of joints) track(span, base(d.name), d.currentPosition);
      await new Promise((r) => setTimeout(r, 20));
    }
    for (const undo of restore) undo();

    const flat = (bag: Record<string, { min: number; max: number }>) =>
      Object.fromEntries(Object.entries(bag).map(([k, s]) => [k, s.max - s.min]));
    // Bound joints come from the drive list, not from what was commanded: while
    // a hanger is in the booth only the base and the wrist are driven, so the
    // commanded set is A1/A5 by design and says nothing about the chain.
    return {
      bound: joints.map((d) => base(d.name)).sort(),
      moved: flat(span),
      commanded: flat(cmd),
    };
  }, [ms, until ?? null] as [number, Record<string, number> | null]);
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

    // A full sweep is 2 x SWEEP_DEG = 70°; wait for it rather than for a clock.
    const travel = await jointTravel(page, 90_000, { A5: 68, A1: 10 });
    expect(travel.bound, 'the six-axis chain did not bind')
      .toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);

    // The wrist sweeps across the workpiece and the base tracks the hanger
    // along the booth; the remaining joints hold a fixed spray posture, so
    // only these two are asserted to travel.
    expect(travel.commanded.A5, 'the wrist was never commanded to sweep')
      .toBeGreaterThan(60);
    expect(travel.commanded.A1, 'the base was never commanded to track a hanger')
      .toBeGreaterThan(10);
    // And the drives follow — a commanded sweep into a dead drive paints nothing.
    expect(travel.moved.A5, 'the wrist drive did not follow its command')
      .toBeGreaterThan(5);
    expect(travel.moved.A1, 'the base drive did not follow its command')
      .toBeGreaterThan(5);
  });

  test('keeps the base yaw within a working arc, not whipping round', async ({ page }) => {
    await openScene(page);

    // Measuring the yaw in WORLD terms made it flip between +146° and -146°
    // whenever the nearest hanger changed, and the arm swung 293° the long way
    // round — 321° of travel in eight seconds. Measured from the robot's own
    // facing it is a calm arc, and this pins that.
    // A fixed window is right here, unlike the sweep test above: this is an
    // UPPER bound, and under-sampling a slow run can only under-report the
    // travel, never invent it.
    const travel = await jointTravel(page, 8_000);
    expect(travel.commanded.A1, 'the base whipped round instead of tracking')
      .toBeLessThan(180);
  });

  test('points the spray gun at the workpiece, not down the line', async ({ page }) => {
    await openScene(page);

    // The defect this pins: the gun sprayed ALONG the conveyor for two
    // milestones. Everything observable still looked right — the arm tracked
    // hangers, the wrist swept, the fan was visible — because nothing measured
    // where the paint actually went. Measured then, the angle between the spray
    // axis and the direction to the hanger had a median of ~93°.
    //
    // The cause was two-fold and both halves are pinned here: the extractor
    // carried the donor scene's 2.149 m placement on the robot's root node, so
    // the base yaw swung the arm around an empty point in the air, and the yaw
    // itself used atan2(dz, dx) when the asset's tool axis lies along -Z at
    // A1 = 0, which needs atan2(-dx, -dz).
    const aim = await page.evaluate(async () => {
      const v = (window as unknown as { viewer?: Record<string, never> }).viewer!;
      const scene = (v as unknown as { scene: { traverse(cb: (o: never) => void): void } }).scene;
      let fan: Record<string, never> | null = null;
      const carriers: Record<string, never>[] = [];
      scene.traverse((o: never) => {
        const n = o as unknown as { name: string; position: { x: number; z: number } };
        const b = n.name.replace(/_\d+$/, '');
        if (b === 'Spray-Fan') fan = o;
        if (/^Carrier-\d\d$/.test(b)) carriers.push(o);
      });
      if (!fan) return { parent: null, errs: [] as number[], pitch: [] as number[] };
      const f = fan as unknown as {
        parent: { name: string }; visible: boolean;
        updateWorldMatrix(a: boolean, b: boolean): void;
        matrixWorld: { elements: number[] };
      };
      const errs: number[] = [];
      const pitch: number[] = [];
      for (let k = 0; k < 24; k++) {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        f.updateWorldMatrix(true, false);
        const e = f.matrixWorld.elements;
        const px = e[12], pz = e[14];
        const L = Math.hypot(e[8], e[9], e[10]);
        const dx = e[8] / L, dy = e[9] / L, dz = e[10] / L;
        let best: { x: number; z: number } | null = null;
        let bd = Infinity;
        for (const c of carriers) {
          const q = (c as unknown as { position: { x: number; z: number } }).position;
          if (Math.abs(q.x) > 1 || q.z < 18 || q.z > 24) continue;
          const d = Math.abs(q.z - pz);
          if (d < bd) { bd = d; best = q; }
        }
        if (!best || !f.visible) continue;
        let err = (Math.atan2(dx, dz) - Math.atan2(best.x - px, best.z - pz)) * 180 / Math.PI;
        while (err > 180) err -= 360;
        while (err < -180) err += 360;
        errs.push(Math.abs(err));
        pitch.push(Math.asin(-dy) * 180 / Math.PI);
        await new Promise((r) => setTimeout(r, 250));
      }
      return { parent: f.parent?.name.replace(/_\d+$/, '') ?? null, errs, pitch };
    });

    expect(aim.parent, 'the spray fan is not parented to the tool centre point').toBe('TCP');
    expect(aim.errs.length, 'the fan was never visible over a hanger').toBeGreaterThan(8);

    // Median rather than max: the target jumps when the nearest hanger changes,
    // and the base ramps to the new yaw over a few frames. Those transients are
    // real motion, not mis-aim, and asserting the max would pin the ramp rate.
    const sorted = [...aim.errs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median, `spray axis is ${median.toFixed(0)}° off the workpiece`).toBeLessThan(25);

    // And it must still sweep: a gun aimed correctly but frozen paints a stripe.
    expect(Math.max(...aim.pitch) - Math.min(...aim.pitch), 'the gun never swept')
      .toBeGreaterThan(30);
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
