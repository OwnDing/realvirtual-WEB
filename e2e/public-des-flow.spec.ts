// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-001 M6 — public Library/Planner authoring through FastForward, KPI
 * diagnostics and the normal Planner persistence/rehydration path.
 */
import { expect, test, type Page } from 'playwright/test';
import { pinLocale } from './helpers/pin-locale';

test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  },
});
test.setTimeout(180_000);

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('public-des-e2e-initialised') !== '1') {
      localStorage.clear();
      sessionStorage.setItem('public-des-e2e-initialised', '1');
    }
    localStorage.setItem('rv-terms-accepted', '1');
    localStorage.setItem('rv-welcome-dismissed', '1');
    localStorage.setItem('rv-auto-quality-applied', '1');
  });
  await pinLocale(page, 'en-US');
  await page.goto('/?mode=des', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForFunction(() => {
    const viewer = (window as unknown as { viewer?: any }).viewer;
    return viewer?.modes?.activeMode === 'des'
      && viewer?.simulationKernel?.mode === 'des'
      && viewer?.simulationKernel?.hasDesRunner?.() === true;
  }, null, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as { viewer?: any }).viewer?.thumbnails?.dispose?.());
}

async function switchWorkspace(page: Page, mode: 'planner' | 'des'): Promise<void> {
  await page.evaluate((next) => (window as unknown as { viewer: any }).viewer.modes.setMode(next), mode);
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { viewer: any }
  ).viewer.modes.activeMode), { timeout: 30_000 }).toBe(mode);
}

async function dismissEnvironmentNotice(page: Page): Promise<void> {
  const button = page.getByTestId('auto-quality-ok');
  if (await button.isVisible().catch(() => false)) await button.click();
  const banner = page.getByRole('button', { name: /Hide dev server banner/ });
  if (await banner.isVisible().catch(() => false)) await banner.click();
}

async function desResult(page: Page) {
  return page.evaluate(() => {
    const control = (window as unknown as { viewer: any }).viewer.simulationKernel.desControl();
    const stats = control.statistics();
    const sink = stats.components.find((row: any) => row.kind === 'sink');
    return {
      simTime: stats.simTime,
      processed: sink?.totalProcessed ?? 0,
      throughput: stats.throughputPerHour,
      bottleneck: stats.bottleneck?.name ?? null,
      componentCount: stats.components.length,
      states: control.componentStates().map((row: any) => ({ name: row.name, state: row.state, next: row.next })),
    };
  });
}

test('DES components assemble, FastForward, diagnose, save and reproduce after reopen', async ({ page }) => {
  await boot(page);
  await switchWorkspace(page, 'planner');

  const placedIds = await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: any }).viewer;
    const planner = viewer.getPlugin('layout-planner');
    const entries = [...planner.store.getSnapshot().catalogs.values()]
      .flatMap((catalog: any) => catalog.entries);
    const byId = (id: string) => {
      const entry = entries.find((candidate: any) => candidate.id === id);
      if (!entry) throw new Error(`missing public DES catalog entry ${id}`);
      return entry;
    };
    return Promise.all([
      planner.placeComponent(byId('des-pallet-source'), [0, 0, 0]),
      planner.placeComponent(byId('des-station'), [0, 0, 0.75]),
      planner.placeComponent(byId('des-storage'), [0, 0, 1.65]),
      planner.placeComponent(byId('des-sink'), [0, 0, 2.5]),
    ]);
  });
  expect(placedIds).toHaveLength(4);

  await expect.poll(() => page.evaluate(() => {
    const registry = (window as unknown as { viewer: any }).viewer.getPlugin('snap-point').getRegistry();
    return registry.getAll().filter((port: any) => port.pairedSnapId).length;
  }), { timeout: 30_000, message: 'coincident stable DES ports were not paired' }).toBe(6);

  await switchWorkspace(page, 'des');
  await expect(page.getByTestId('des-submode-fastforward')).toBeVisible({ timeout: 30_000 });
  await dismissEnvironmentNotice(page);
  await page.getByTestId('des-submode-fastforward').click();
  await page.waitForTimeout(1_000);
  const firstDebug = await page.evaluate(() => {
    const control = (window as unknown as { viewer: any }).viewer.simulationKernel.desControl();
    return {
      events: control.eventStats(),
      instances: control.instances().map((entry: any) => ({
        name: entry.adapter.node.name,
        kind: entry.def.kind,
        state: entry.self.state,
        load: entry.adapter.currentLoad,
        next: entry.adapter.nextComponents.map((next: any) => next.node.name),
        prop: entry.self.prop,
      })),
    };
  });
  if ((await desResult(page)).processed !== 1) {
    throw new Error(`the authored public DES flow produced no output: ${JSON.stringify(firstDebug)}`);
  }

  await dismissEnvironmentNotice(page);
  // The persistent software-renderer alert overlaps the far right of the
  // toolbar in headless Chromium. Exercise the button's real keyboard path;
  // this also verifies that the diagnostics entry remains accessible.
  const diagnosticsButton = page.getByTestId('des-event-queue');
  await expect(diagnosticsButton).toHaveAttribute('aria-pressed', 'false');
  await diagnosticsButton.focus();
  await diagnosticsButton.press('Enter');
  await expect(diagnosticsButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('des-event-queue-panel')).toContainText('Throughput');
  await expect(page.getByTestId('des-event-queue-panel')).toContainText('Bottleneck');
  const first = await desResult(page);
  expect(first).toMatchObject({ processed: 1, componentCount: 4 });
  expect(first.throughput).toBeGreaterThan(0);
  expect(first.bottleneck).toMatch(/^Station(?:_\d+)?$/);

  // Exercise the same persisted Planner record and rehydrate path used on boot.
  // Keeping one WebGL document avoids testing SwiftShader context loss.
  await switchWorkspace(page, 'planner');
  await page.evaluate(async () => {
    const viewer = (window as unknown as { viewer: any }).viewer;
    const planner = viewer.getPlugin('layout-planner');
    const saved = localStorage.getItem('rv-layout-autosave');
    if (!saved) throw new Error('DES Planner autosave is missing');
    for (const placement of [...planner.snapshotPlacements().placements]) {
      planner.removePlacementById(placement.id);
    }
    localStorage.setItem('rv-layout-autosave', saved);
    planner.store.loadAutoSave();
    const parsed = JSON.parse(saved);
    await planner.applyPlacements({
      placements: [...planner.store.placed],
      catalogUrls: [],
      gridSizeMm: parsed.gridSizeMm,
    });
  });
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { viewer: any }
  ).viewer.getPlugin('layout-planner').snapshotPlacements().placements.length), {
    timeout: 45_000,
  }).toBe(4);
  await switchWorkspace(page, 'des');
  await dismissEnvironmentNotice(page);
  await page.getByTestId('des-submode-fastforward').click();
  await expect.poll(async () => (await desResult(page)).processed, { timeout: 30_000 }).toBe(1);
  const reopened = await desResult(page);

  // The live animated kernel may advance by one render-frame between the
  // polling condition and this sample. Rehydration equivalence is therefore
  // asserted on durable process outcomes; exact event-clock replay is covered
  // by the manager/snapshot determinism suites without a browser frame clock.
  expect(reopened).toMatchObject({
    processed: first.processed,
    componentCount: first.componentCount,
    bottleneck: first.bottleneck,
    states: first.states,
  });
  expect(reopened.simTime).toBeCloseTo(first.simTime, 0);
  expect(reopened.throughput).toBeGreaterThan(0);
});
