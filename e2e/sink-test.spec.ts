// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { test, expect, type Page } from 'playwright/test';

/**
 * Verify that the Sink consumes MUs after they travel through the demo line.
 *
 * EP-E2E-001 #6. The first part reaches the sink only after the robot has
 * played its recorded Loading + Unloading cycle (the first "Unloading"
 * sequence ends at frame 4,300 of 4,329; measured headless at 50 frames/s, the
 * first part is consumed near frame 4,110, about 90 s after load). The old fixed
 * 5 s + 60 s window therefore always ended before the first part could arrive.
 * The wait is now anchored to the robot's cycle instead of to a guess: by the
 * time one full Loading + Unloading cycle has played (the playback frame wraps
 * back after the Unloading sequence started), the sink MUST have consumed a
 * part.
 *
 * Counters are read from THIS page's viewer. The dev server's
 * `/__api/debug/transport` serves one snapshot that every open page overwrites
 * once a second, so under parallel workers it answered for other tests.
 */

interface LineState {
  spawned: number;
  consumed: number;
  frame: number;
  unloadingStart: number | null;
}

async function lineState(page: Page): Promise<LineState> {
  return page.evaluate(() => {
    const viewer = (window as unknown as {
      __rvViewer: {
        transportManager: { totalSpawned: number; totalConsumed: number } | null;
        playback: { frame: number; sequences: Array<{ name: string; startFrame: number }> } | null;
      };
    }).__rvViewer;
    const unloading = viewer.playback?.sequences.find((sequence) => sequence.name === 'Unloading');
    return {
      spawned: viewer.transportManager?.totalSpawned ?? 0,
      consumed: viewer.transportManager?.totalConsumed ?? 0,
      frame: viewer.playback?.frame ?? 0,
      unloadingStart: unloading?.startFrame ?? null,
    };
  });
}

test('sink consumes MUs from conveyor end', async ({ page }) => {
  // Software-rendered CI runners advance the simulation more slowly than a
  // desktop GPU; the budget covers one full robot cycle at ~20 fps.
  test.setTimeout(330_000);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const viewer = (window as unknown as { __rvViewer?: { transportManager?: unknown } }).__rvViewer;
    return !!viewer?.transportManager
      && !!document.getElementById('loading-overlay')?.classList.contains('hidden');
  }, undefined, { timeout: 90_000 });

  const initial = await lineState(page);
  expect(initial.unloadingStart, 'the demo robot recording has an Unloading sequence').not.toBeNull();

  // Poll until a part is consumed or one full robot cycle has played. The
  // playback restarts at frame 0 after the cycle, so "the cycle finished" is
  // the frame going BACKWARDS after it had entered the Unloading sequence.
  let previous = initial.frame;
  let enteredUnloading = false;
  let cycleCompleted = false;
  let state = initial;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    state = await lineState(page);
    if (state.consumed > 0) break;
    if (state.frame >= initial.unloadingStart!) enteredUnloading = true;
    if (enteredUnloading && state.frame < previous) { cycleCompleted = true; break; }
    previous = state.frame;
    await page.waitForTimeout(1_000);
  }
  expect(state.consumed > 0 || cycleCompleted, 'one full robot cycle played within 240 s').toBe(true);
  expect(state.consumed, 'the sink consumed at least one MU within the first robot cycle').toBeGreaterThan(0);

  const final = await lineState(page);
  console.log(`Final: Spawned=${final.spawned}, Consumed=${final.consumed}, Frame=${final.frame}`);
  expect(final.spawned).toBeGreaterThan(0);

  // No critical errors
  const critical = errors.filter(
    e => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('net::ERR_'),
  );
  expect(critical).toHaveLength(0);
});
