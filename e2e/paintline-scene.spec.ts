// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-DEMO-001 M2 — the assembled paint-line demo scene.
 *
 * These assertions exist because each of them failed silently at least once
 * while the scene was being built, and none of them shows up as an error:
 *
 *   - Composition can resolve all six placements and still leave the line
 *     STATIC, because behaviors are dispatched per placement via
 *     `realvirtual.LayoutObject` and that marker is normally stamped at runtime
 *     by the planner's `adoptPlacements` — a hand-off that does not fire on the
 *     `?scene=published:` route. The scene file declares the marker itself.
 *   - A behavior reads its settings from `self.root`, which for a placed
 *     LayoutObject is the PLACEMENT node — not the library GLB root one level
 *     down. Config authored in the wrong place is ignored and the component
 *     runs on schema defaults, which is silent and looks plausible.
 *   - Hangers must stay plumb through both 180° turns; a Frenet flip would
 *     roll them upside down without throwing anything.
 *
 * Speed and phase are read as ARC LENGTH invariants rather than wall-clock
 * positions wherever possible, so the suite does not depend on frame rate.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from 'playwright/test';

/** Software rendering — headless Chromium here has no usable GPU WebGL. */
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

/**
 * Loop geometry, read from the sidecar the library generator emits rather than
 * restated here — the circuit gained a three-pass accumulation buffer in
 * EP-CONV-001 M4, and a hand-copied constant would have gone stale silently.
 */
const GEOMETRY = JSON.parse(
  readFileSync(resolve(
    dirname(fileURLToPath(import.meta.url)), '..',
    'public', 'library', 'PaintLine', 'paintline-geometry.json',
  ), 'utf8'),
) as { loopLengthM: number; carrierCount: number; gates: { name: string; sM: number }[] };
const CARRIER_COUNT = GEOMETRY.carrierCount;
const PITCH = GEOMETRY.loopLengthM / CARRIER_COUNT;

const EXPECTED_PLACEMENTS: Record<string, [number, number, number]> = {
  'PaintLineOverheadConveyor': [0, 0, 0],
  'PretreatTunnel-8m': [0, 0, 6],
  'DryOven-6m': [0, 0, 14],
  'SprayBooth': [0, 0, 21],
  'CoolingZone-4m': [0, 0, 27],
  'LoadUnloadStation': [7, 0, -6],
  // The booth's FANUC CRX, placed as its own object since EP-DEMO-003.
  'PaintRobot': [-1.9, 0.1, 20.4],
};

async function openScene(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('rv-terms-accepted', '1'));
  await page.goto('/?scene=published:DemoPaintLine', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  const dismiss = page.locator('[data-testid="welcome-dismiss"]');
  if (await dismiss.count()) await dismiss.first().click({ timeout: 5_000 }).catch(() => {});
  // Let composition resolve the six references and the chain reach target speed.
  await page.waitForTimeout(10_000);
}

/** Placement roots (the nodes carrying `LayoutObject`) and their transforms. */
function readPlacements(page: Page) {
  return page.evaluate(() => {
    const scene = (window as unknown as { viewer?: { scene?: unknown } }).viewer?.scene as
      { traverse(cb: (o: Record<string, never>) => void): void } | undefined;
    if (!scene) throw new Error('window.viewer.scene is not available');
    const out: Record<string, [number, number, number]> = {};
    scene.traverse((node: Record<string, never>) => {
      const n = node as unknown as {
        name: string;
        position: { x: number; y: number; z: number };
        userData?: { realvirtual?: { LayoutObject?: unknown } };
      };
      if (n.userData?.realvirtual?.LayoutObject) {
        out[n.name] = [n.position.x, n.position.y, n.position.z];
      }
    });
    return out;
  });
}

/** Every carrier's local pose (the frame OverheadConveyor writes into). */
function readCarriers(page: Page) {
  return page.evaluate(() => {
    const scene = (window as unknown as { viewer?: { scene?: unknown } }).viewer?.scene as
      { traverse(cb: (o: Record<string, never>) => void): void } | undefined;
    if (!scene) throw new Error('window.viewer.scene is not available');
    const out: { name: string; x: number; y: number; z: number; qx: number; qz: number }[] = [];
    scene.traverse((node: Record<string, never>) => {
      const n = node as unknown as {
        name: string;
        position: { x: number; y: number; z: number };
        quaternion: { x: number; z: number };
      };
      if (/^Carrier-\d\d$/.test(n.name)) {
        out.push({ name: n.name, x: n.position.x, y: n.position.y, z: n.position.z, qx: n.quaternion.x, qz: n.quaternion.z });
      }
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
}

const PHASE = 'PaintLineOverheadConveyor.OverheadConveyor.Position';
const RUN = 'PaintLineOverheadConveyor.OverheadConveyor.Run';
const MOVING = 'PaintLineOverheadConveyor.OverheadConveyor.Moving';

/**
 * Read signals from the LIVE page, not from `/__api/debug`.
 *
 * That endpoint serves the last snapshot pushed by any page at ~1 Hz, so it
 * can hand back state belonging to a previous test's page — which reads as a
 * missing signal (or a stale value) that has nothing to do with this scene.
 */
function readSignals(page: Page, names: string[]) {
  return page.evaluate((keys) => {
    const store = (window as unknown as {
      viewer?: { signalStore?: { getBool(n: string): boolean; getFloat(n: string): number } };
    }).viewer?.signalStore;
    if (!store) return null;
    const out: Record<string, boolean | number> = {};
    for (const k of keys) {
      out[k] = k.endsWith('.Position') ? store.getFloat(k) : store.getBool(k);
    }
    return out;
  }, names);
}

/** Poll until the chain behavior has bound and commanded the chain to run. */
async function waitForChainRunning(page: Page): Promise<void> {
  await expect.poll(
    async () => (await readSignals(page, [RUN]))?.[RUN] ?? null,
    { timeout: 45_000, message: 'the OverheadConveyor behavior never bound' },
  ).toBe(true);
}

test.describe('paint-line demo scene', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('composes every placement at its authored transform', async ({ page }) => {
    await openScene(page);
    const placed = await readPlacements(page);

    expect(Object.keys(placed).sort()).toEqual(Object.keys(EXPECTED_PLACEMENTS).sort());
    for (const [name, at] of Object.entries(EXPECTED_PLACEMENTS)) {
      expect(placed[name][0], `${name} x`).toBeCloseTo(at[0], 6);
      expect(placed[name][1], `${name} y`).toBeCloseTo(at[1], 6);
      expect(placed[name][2], `${name} z`).toBeCloseTo(at[2], 6);
    }
  });

  test('binds the OverheadConveyor behavior and circulates the chain', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);

    const first = await readSignals(page, [RUN, MOVING, PHASE])!;
    expect(first![MOVING], 'chain moving').toBe(true);

    await page.waitForTimeout(3_000);
    const second = await readSignals(page, [PHASE])!;
    expect(Number(second![PHASE]), 'chain phase must advance')
      .toBeGreaterThan(Number(first![PHASE]));
  });

  test('runs at the configured 300 mm/s, not the component default', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);

    // Measured against the SIMULATION clock, not the wall clock. Under software
    // rendering the fixed-timestep loop runs well below real time (roughly 40%
    // here), so wall-clock speed reports whatever the host managed rather than
    // what the drive was told — the same measurement that first made the chain
    // look like it ran at 500 mm/s. Ticks are the honest denominator.
    const sample = () => page.evaluate(() => {
      const v = (window as unknown as {
        viewer?: { simTickCount?: number; signalStore?: { getFloat(n: string): number } };
      }).viewer;
      let z = 0;
      (v as unknown as { scene?: { traverse(cb: (o: { name: string; position: { z: number } }) => void): void } })
        .scene?.traverse((n) => { if (n.name === 'Carrier-01') z = n.position.z; });
      return {
        ticks: v?.simTickCount ?? 0,
        phase: v?.signalStore?.getFloat('PaintLineOverheadConveyor.OverheadConveyor.Position') ?? 0,
        z,
      };
    });

    const first = await sample();
    await page.waitForTimeout(8_000);
    const second = await sample();

    const simSeconds = (second.ticks - first.ticks) / 60;   // 60 Hz fixed timestep
    expect(simSeconds, 'the simulation did not advance').toBeGreaterThan(1);
    const speed = (second.phase - first.phase) / simSeconds;

    // The band only has to separate the configured 300 from the component's
    // 500 mm/s schema default (which measures ~470 here). Sampling skew between
    // the tick counter and the 1-per-tick signal costs a few percent.
    expect(speed).toBeGreaterThan(250);
    expect(speed).toBeLessThan(360);

    // Frame-rate independent and exact: a carrier on the straight travels
    // exactly as far as the chain phase advances. This is what proves the loop
    // geometry and the pitch distribution agree with the arc-length parameter.
    const travelMm = (second.z - first.z) * 1000;
    expect(travelMm, 'carrier travel must equal the chain phase advance')
      .toBeCloseTo(second.phase - first.phase, 3);
  });

  // Fixed pitch is a RIGID-mode property. The demo scene runs `accumulating`
  // since EP-CONV-001 M4, where spacing is whatever the headway controller
  // decides — so the invariant asserted here is the FLOOR (MinGap), not
  // equality. `tests/path/overhead-conveyor-*.test.ts` still pin exact pitch
  // for rigid mode headlessly.
  test('never spaces carriers closer than the hard MinGap floor', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);
    const carriers = await readCarriers(page);
    expect(carriers).toHaveLength(CARRIER_COUNT);

    // Compare only ADJACENT indices that both sit on the x = 0 straight, so the
    // check never spans the wrap boundary or a turn.
    const onStraight = new Map<number, number>();
    for (const c of carriers) {
      const i = Number(c.name.slice('Carrier-'.length));
      if (Math.abs(c.x) < 1e-6 && c.z > 0.5 && c.z < 29.5) onStraight.set(i, c.z);
    }
    const idx = [...onStraight.keys()].sort((a, b) => a - b);
    let pairs = 0;
    for (let i = 1; i < idx.length; i++) {
      if (idx[i] - idx[i - 1] !== 1) continue;
      const gap = onStraight.get(idx[i])! - onStraight.get(idx[i - 1])!;
      // MinGap is the component's HARD no-penetration floor (0.9 m in this
      // scene); free-running carriers sit near PITCH, queued ones close to the
      // floor, and neither may ever go below it.
      expect(gap, `carriers ${idx[i - 1]} and ${idx[i]} penetrated MinGap`).toBeGreaterThan(0.899);
      expect(gap, 'carriers drifted further apart than the seeded pitch').toBeLessThan(PITCH + 0.5);
      pairs++;
    }
    expect(pairs, 'the straight should hold several adjacent carriers').toBeGreaterThan(3);
  });

  test('hangs every carrier plumb through both turns', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);
    for (const c of await readCarriers(page)) {
      // A pure-yaw quaternion has zero X and Z parts. Anything else means the
      // hanger pitched or rolled — the Frenet flip the component avoids.
      expect(c.qx, `${c.name} pitched`).toBeCloseTo(0, 9);
      expect(c.qz, `${c.name} rolled`).toBeCloseTo(0, 9);
      expect(c.y, `${c.name} left the track height`).toBeCloseTo(2.6, 6);
    }
  });

  test('travels the process side in +Z and the return side in -Z', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);
    const before = new Map((await readCarriers(page)).map((c) => [c.name, c]));
    await page.waitForTimeout(3_000);
    const after = await readCarriers(page);

    let checkedProcess = 0;
    let checkedReturn = 0;
    for (const now of after) {
      const then = before.get(now.name)!;
      // Only carriers that stayed on the same straight are unambiguous.
      if (Math.abs(then.x) < 1e-6 && Math.abs(now.x) < 1e-6 && now.z > then.z + 0.1) checkedProcess++;
      if (Math.abs(then.x - 6) < 1e-6 && Math.abs(now.x - 6) < 1e-6 && now.z < then.z - 0.1) checkedReturn++;
    }
    expect(checkedProcess, 'carriers advancing +Z on the process side').toBeGreaterThan(3);
    expect(checkedReturn, 'carriers advancing -Z on the return side').toBeGreaterThan(3);
  });

  test('loads every mesh with real surface normals', async ({ page }) => {
    await openScene(page);
    // Without a NORMAL attribute three.js falls back to flat shading, and on a
    // real GPU these shells render as solid black silhouettes — the floor and
    // the shadows stay correct, so nothing looks broken until you see it.
    const geo = await page.evaluate(() => {
      const scene = (window as unknown as { viewer?: { scene?: unknown } }).viewer?.scene as
        { traverse(cb: (o: Record<string, never>) => void): void } | undefined;
      let meshes = 0;
      let withNormals = 0;
      scene?.traverse((node: Record<string, never>) => {
        const n = node as unknown as {
          isMesh?: boolean; name: string; visible: boolean;
          geometry?: { attributes?: Record<string, unknown> };
        };
        // `__`-prefixed nodes are the viewer's own invisible helpers (raycast
        // BVH proxies and the like), not renderable assets.
        if (!n.isMesh || n.name.startsWith('__')) return;
        meshes++;
        if (n.geometry?.attributes?.normal) withNormals++;
      });
      return { meshes, withNormals };
    });
    expect(geo.meshes, 'no meshes in the scene').toBeGreaterThan(100);
    expect(geo.withNormals, 'meshes without normals render unlit/black').toBe(geo.meshes);
  });

  test('actually repaints the moving chain', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);

    // The assertion this suite was missing. Everything else here reads
    // SIMULATION state — signals, `position`, tick counts — all of which
    // advanced happily while the picture stayed frozen, because the loader
    // classified the carriers as scenery: `rv-freeze-static` stopped their
    // matrices updating and the mesh merge baked them into the root-parented
    // static arena. Only comparing rendered pixels catches that.
    await page.evaluate(() => {
      const c = (window as unknown as { viewer: { renderer: { domElement: HTMLElement } } })
        .viewer.renderer.domElement;
      c.setAttribute('data-main-canvas', '1');
    });
    const canvas = page.locator('[data-main-canvas]');

    // Neutralise the OTHER source of redraws so this cannot pass on the booth
    // reciprocator's motion alone — that is exactly how the freeze stayed
    // hidden through three milestones.
    await page.evaluate(() => {
      const drives = (window as unknown as { viewer: { drives?: { name: string;
        jogForward: boolean; jogBackward: boolean; stop?: () => void }[] } }).viewer.drives ?? [];
      for (const d of drives) {
        if (d.name.replace(/_\d+$/, '') !== 'Drive-Lin-Y') continue;
        d.jogForward = false;
        d.jogBackward = false;
        d.stop?.();
      }
    });
    await page.waitForTimeout(1_500);

    const before = await canvas.screenshot();
    await page.waitForTimeout(5_000);
    const after = await canvas.screenshot();

    expect(Buffer.compare(before, after), 'the chain moved but the canvas never repainted')
      .not.toBe(0);
  });

  test('backs the buffer up behind a closed gate and drains it again', async ({ page }) => {
    await openScene(page);
    await waitForChainRunning(page);

    // Hangers on the serpentine buffer passes; the process side is x < 4.
    const buffered = async () => (await readCarriers(page)).filter((c) => c.x >= 4);
    const crowdedPairs = (cs: { x: number; z: number }[]) => {
      let n = 0;
      for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const d = Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z);
          if (d < 1.35) n++;   // below the free-running pitch → queued
        }
      }
      return n;
    };

    const setGate = (open: boolean) => page.evaluate((v) => {
      const store = (window as unknown as {
        viewer: { signalStore?: { set(n: string, b: boolean): void } };
      }).viewer.signalStore;
      store?.set('PaintLineOverheadConveyor.Gate1.Release', v);
    }, open);

    expect(crowdedPairs(await buffered()), 'the buffer should start free-running').toBe(0);

    await setGate(false);
    await page.waitForTimeout(45_000);
    const queued = crowdedPairs(await buffered());
    expect(queued, 'a closed gate did not back the buffer up').toBeGreaterThan(2);

    await setGate(true);
    await page.waitForTimeout(30_000);
    expect(crowdedPairs(await buffered()), 'the queue never drained').toBeLessThan(queued);
  });

  test('restores identical placement transforms on reload', async ({ page }) => {
    await openScene(page);
    const first = await readPlacements(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForTimeout(8_000);
    expect(await readPlacements(page)).toEqual(first);
  });
});
