// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-PLANNER-001 golden path — a user can discover, drag, assemble, run and
 * cold-rehydrate a modular paint line. The first component deliberately enters
 * through the real Library HTML5 drag path; subsequent modules use the public
 * stable-port placement API used by the snap picker and MCP bridge.
 */

import { test, expect, type Page } from 'playwright/test';
import { pinLocale } from './helpers/pin-locale';

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

test.setTimeout(180_000);

async function openEmptyPlanner(page: Page): Promise<string[]> {
  const diagnostics: string[] = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    diagnostics.push(`${message.type()}: ${message.text()}`);
    if (diagnostics.length > 300) diagnostics.shift();
  });
  page.on('requestfailed', (request) => {
    diagnostics.push(`request: ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`);
  });
  await page.addInitScript(() => {
    // Initialise this browser context once. Keeping the guard makes accidental
    // navigation unable to erase the planner autosave being verified.
    if (sessionStorage.getItem('paintline-e2e-initialised') !== '1') {
      localStorage.clear();
      sessionStorage.setItem('paintline-e2e-initialised', '1');
    }
    localStorage.setItem('rv-terms-accepted', '1');
  });
  await pinLocale(page, 'zh-CN');
  await page.goto('/?mode=planner', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('canvas', { timeout: 60_000 });
  } catch {
    throw new Error(`empty Planner did not finish booting\n${diagnostics.join('\n')}`);
  }
  // Headless Chromium uses a tiny SwiftShader context. Rendering previews for
  // the unrelated 15 MB pallet assets can exhaust that software context. Cards
  // and drag behavior remain fully active; only
  // background preview rendering is disabled for this focused paint-line flow.
  await page.evaluate(() => (window as any).viewer?.thumbnails?.dispose?.());
  const dismiss = page.locator('[data-testid="welcome-dismiss"]');
  if (await dismiss.count()) await dismiss.first().click({ force: true }).catch(() => {});
  // The About welcome and the low-performance renderer notice can appear
  // after the canvas itself. Both are legitimate first-run UI, but neither is
  // part of the Library gesture under test.
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const label of [/^我知道了$/, /^I understand$/, /^好$/, /^OK$/]) {
      const button = page.getByRole('button', { name: label }).last();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true }).catch(() => {});
      }
    }
    await page.waitForTimeout(400);
  }

  await expect.poll(() => page.evaluate(() => {
    const viewer = (window as any).viewer;
    const planner = viewer?.getPlugin?.('layout-planner');
    if (!planner) return 0;
    return [...planner.store.getSnapshot().catalogs.values()]
      .flatMap((catalog: any) => catalog.entries)
      .filter((entry: any) => entry.category === 'Paint Line').length;
  }), { timeout: 45_000, message: 'configured Paint Line catalog did not load' }).toBe(16);
  return diagnostics;
}

function runtimeState(page: Page) {
  return page.evaluate(() => {
    const viewer = (window as any).viewer;
    const signals = viewer?.signalStore?.getAll?.() as Map<string, boolean | number> | undefined;
    const bySuffix = (suffix: string): boolean | number | null => {
      if (!signals) return null;
      const pair = [...signals.entries()].find(([name]) => name.endsWith(suffix));
      return pair?.[1] ?? null;
    };
    const planner = viewer?.getPlugin?.('layout-planner');
    const placements = planner?.snapshotPlacements?.().placements ?? [];
    let runtime: Record<string, unknown> | null = null;
    viewer?.scene?.traverse?.((node: any) => {
      const value = node.userData?.realvirtual?.PaintLineRuntime;
      if (value) runtime = value;
    });
    return {
      placements: placements.map((item: any) => ({ id: item.id, label: item.label })),
      valid: bySuffix('PaintLine.AssemblyValid'),
      moving: bySuffix('PaintLine.Moving'),
      position: Number(bySuffix('PaintLine.Position') ?? 0),
      paintedPieces: Number(bySuffix('PaintLine.PaintedPieces') ?? 0),
      paintedVisuals: (() => {
        let count = 0;
        viewer?.scene?.traverse?.((node: any) => {
          if (!node?.isMesh || !/^Workpiece(?:-|$)/i.test(node.name)) return;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          if (materials.some((material: any) => material?.color?.getHex?.() === 0x2f78c4)) count++;
        });
        return count;
      })(),
      runtime,
    };
  });
}

test('Library drag → stable-port loop → runtime → saved rehydrate', async ({ page }) => {
  await openEmptyPlanner(page);

  // The shipped catalog is visible to a normal user, not merely present in a
  // source file or reachable through a private API.
  const search = page.getByPlaceholder('Search...');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill('Spray Booth');
  const firstCard = page.getByRole('button', { name: /Spray Booth/ }).first();
  await expect(firstCard).toBeVisible();

  // Real HTML5 Library drag/drop. The remainder uses the same public snap API
  // as the UI picker, because that gives the test an unambiguous PortId target.
  const canvas = page.locator('canvas').first();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await firstCard.dispatchEvent('dragstart', { dataTransfer: transfer });
  await canvas.dispatchEvent('dragover', {
    dataTransfer: transfer, clientX: 500, clientY: 430,
  });
  await canvas.dispatchEvent('drop', {
    dataTransfer: transfer, clientX: 500, clientY: 430,
  });
  await firstCard.dispatchEvent('dragend', { dataTransfer: transfer });
  await transfer.dispose();

  await expect.poll(() => page.evaluate(() => {
    const viewer = (window as any).viewer;
    const planner = viewer?.getPlugin?.('layout-planner');
    const registry = viewer?.getPlugin?.('snap-point')?.getRegistry?.();
    const placed = planner?.snapshotPlacements?.().placements ?? [];
    const first = placed.find((item: any) => item.label === 'Spray Booth');
    const root = first && planner.getPlacedRootById(first.id);
    const ports = root && registry?.getByOwnerRoot(root);
    return ports ? ports.map((port: any) => port.portId).sort().join(',') : '';
  }), { timeout: 45_000, message: 'dragged module geometry/ports did not materialise' })
    .toBe('robot.mount,track.in,track.out');

  const assembled = await page.evaluate(async () => {
    const viewer = (window as any).viewer;
    const planner = viewer.getPlugin('layout-planner');
    const registry = viewer.getPlugin('snap-point').getRegistry();
    const entries = [...planner.store.getSnapshot().catalogs.values()]
      .flatMap((catalog: any) => catalog.entries);
    const entry = (name: string) => {
      const found = entries.find((item: any) => item.name === name);
      if (!found) throw new Error(`missing catalog entry: ${name}`);
      return found;
    };
    const first = planner.snapshotPlacements().placements
      .find((item: any) => item.label === 'Spray Booth');
    if (!first) throw new Error('the dragged spray booth is missing');

    const attachAfter = async (previousId: string, name: string): Promise<string> => {
      const root = planner.getPlacedRootById(previousId);
      const target = registry.getByOwnerRoot(root)
        .find((port: any) => port.portId === 'track.out');
      if (!target) throw new Error(`${previousId} has no stable track.out`);
      const id = await planner.placeAtSnap(entry(name), target, 'track.in');
      if (!id) throw new Error(`failed to attach ${name}`);
      return id;
    };

    const turnA = await attachAfter(first.id, 'Paint Track Return 180');
    const buffer = await attachAfter(turnA, 'Paint Track Buffer 6m');
    const turnB = await attachAfter(buffer, 'Paint Track Return 180');
    const controller = await planner.placeComponent(entry('Paint Line Controller'), [6, 0, 0]);
    return { ids: [first.id, turnA, buffer, turnB, controller].sort() };
  });

  // The final unoccupied ends coincide. The coalesced proximity rebuild must
  // close them automatically; the topology-driven controller then starts.
  await expect.poll(async () => {
    const state = await runtimeState(page);
    return state.valid === true ? 'valid' : JSON.stringify(state.runtime);
  }, {
    timeout: 45_000,
    message: 'the four-module closed loop was not accepted',
  }).toBe('valid');
  await expect.poll(async () => (await runtimeState(page)).moving, {
    timeout: 30_000,
    message: 'the valid assembled line did not run',
  }).toBe(true);

  const before = await runtimeState(page);
  expect(before.runtime).toMatchObject({ AssemblyValid: true, ModuleCount: 4 });
  await expect.poll(async () => {
    const state = await runtimeState(page);
    return state.paintedPieces > 0 && state.paintedVisuals > 0;
  }, {
    timeout: 30_000,
    message: 'the assembled spray booth did not process and recolor a workpiece',
  }).toBe(true);
  await page.waitForTimeout(2_000);
  expect((await runtimeState(page)).position).toBeGreaterThan(before.position);

  // Read the real autosave, tear every live object/behavior/port out, reload the
  // persisted records through LayoutStore, and invoke the same applyPlacements
  // path used during scene boot. Keeping one WebGL document is intentional:
  // SwiftShader loses its tiny context on page.reload in this CI host, which
  // would test the renderer process rather than planner persistence.
  const persistedIds = await page.evaluate(async () => {
    const viewer = (window as any).viewer;
    const planner = viewer.getPlugin('layout-planner');
    const raw = localStorage.getItem('rv-layout-autosave');
    if (!raw) throw new Error('planner autosave is missing');
    const layout = JSON.parse(raw);
    if (!Array.isArray(layout.components) || layout.components.length !== 5) {
      throw new Error(`planner autosave has ${layout.components?.length ?? 0} components`);
    }
    const ids = layout.components.map((item: any) => item.id).sort();
    for (const item of [...planner.snapshotPlacements().placements]) {
      planner.removePlacementById(item.id);
    }
    if (planner.snapshotPlacements().placements.length !== 0) {
      throw new Error('live planner teardown left placements behind');
    }
    planner.store.loadAutoSave();
    await planner.applyPlacements({
      placements: [...planner.store.placed],
      catalogUrls: [],
      gridSizeMm: layout.gridSizeMm,
    });
    return ids;
  });
  await expect.poll(async () => (await runtimeState(page)).placements.length, {
    timeout: 60_000,
    message: 'saved assembly did not restore through the boot rehydrate path',
  }).toBe(5);
  await expect.poll(async () => (await runtimeState(page)).valid, { timeout: 45_000 }).toBe(true);
  await expect.poll(async () => (await runtimeState(page)).moving, { timeout: 30_000 }).toBe(true);

  const reopened = await runtimeState(page);
  expect(persistedIds).toEqual(assembled.ids);
  expect(reopened.placements.map((item) => item.id).sort()).toEqual(assembled.ids);
  expect(reopened.runtime).toMatchObject({ AssemblyValid: true, ModuleCount: 4 });
  await expect.poll(async () => (await runtimeState(page)).paintedPieces, {
    timeout: 30_000,
    message: 'spray processing did not resume after saved rehydrate',
  }).toBeGreaterThan(0);
  await page.waitForTimeout(2_000);
  expect((await runtimeState(page)).position).toBeGreaterThan(reopened.position);
});
