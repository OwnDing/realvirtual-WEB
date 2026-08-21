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

/** Loop geometry, mirroring `scripts/build-paintline-library.mjs`. */
const LOOP_LENGTH = 60 + 6 * Math.PI;   // two 30 m straights + two half-turns of r=3
const CARRIER_COUNT = 40;
const PITCH = LOOP_LENGTH / CARRIER_COUNT;

const EXPECTED_PLACEMENTS: Record<string, [number, number, number]> = {
  'PaintLineOverheadConveyor': [0, 0, 0],
  'PretreatTunnel-8m': [0, 0, 6],
  'DryOven-6m': [0, 0, 14],
  'SprayBooth': [0, 0, 21],
  'CoolingZone-4m': [0, 0, 27],
  'LoadUnloadStation': [6, 0, 12],
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

async function signals(page: Page): Promise<Record<string, unknown>> {
  const res = await page.request.get('/__api/debug');
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { signals?: Record<string, unknown> }).signals ?? {};
}

const PHASE = 'PaintLineOverheadConveyor.OverheadConveyor.Position';

test.describe('paint-line demo scene', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('composes all six placements at their authored transforms', async ({ page }) => {
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

    const first = await signals(page);
    expect(first['PaintLineOverheadConveyor.OverheadConveyor.Run'], 'chain command').toBe(true);
    expect(first['PaintLineOverheadConveyor.OverheadConveyor.Moving'], 'chain moving').toBe(true);

    await page.waitForTimeout(3_000);
    const second = await signals(page);
    expect(Number(second[PHASE]), 'chain phase must advance')
      .toBeGreaterThan(Number(first[PHASE]));
  });

  test('runs at the configured 300 mm/s, not the component default', async ({ page }) => {
    await openScene(page);

    // Read the SAME node twice and time it by wall clock. The config that sets
    // this lives on the placement node; authored one level down it is ignored
    // and the chain silently runs at the 500 mm/s schema default instead.
    const z = async () => (await readCarriers(page)).find((c) => c.name === 'Carrier-01')!.z;
    const t0 = Date.now();
    const z0 = await z();
    await page.waitForTimeout(5_000);
    const z1 = await z();
    const speed = ((z1 - z0) / ((Date.now() - t0) / 1000)) * 1000;

    // Generous band: this must separate 300 from the 500 default, nothing finer.
    expect(speed).toBeGreaterThan(240);
    expect(speed).toBeLessThan(380);
  });

  test('spaces carriers exactly one pitch apart', async ({ page }) => {
    await openScene(page);
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
      expect(onStraight.get(idx[i])! - onStraight.get(idx[i - 1])!).toBeCloseTo(PITCH, 6);
      pairs++;
    }
    expect(pairs, 'the straight should hold several adjacent carriers').toBeGreaterThan(5);
  });

  test('hangs every carrier plumb through both turns', async ({ page }) => {
    await openScene(page);
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

  test('restores identical placement transforms on reload', async ({ page }) => {
    await openScene(page);
    const first = await readPlacements(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForTimeout(8_000);
    expect(await readPlacements(page)).toEqual(first);
  });
});
