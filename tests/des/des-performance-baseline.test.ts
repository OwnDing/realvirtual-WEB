// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-001 M7 scale baselines.
 *
 * Wall-clock values are evidence, not CI pass/fail budgets: shared browser
 * workers vary too much for a stable millisecond gate. Semantic completion,
 * ordering, snapshot size and round-trip counts remain hard assertions.
 */
import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { DESEventQueue } from '../../src/core/material-flow/des/rv-des-event-queue';
import { DESManager } from '../../src/core/material-flow/des/rv-des-manager';
import { DESStation } from '../../src/core/material-flow/des/rv-des-station';
import { createDESMU, resetDESMUCounter, type DESMU } from '../../src/core/material-flow/des/rv-des-mu';
import { createSnapshot, restoreSnapshot } from '../../src/core/material-flow/des/rv-des-snapshot';

function eventQueueBaseline(eventCount: number): { enqueueMs: number; dequeueMs: number } {
  const queue = new DESEventQueue(256);
  let seed = 0x1234abcd;
  const enqueueStart = performance.now();
  for (let index = 0; index < eventCount; index++) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    queue.enqueue(seed / 0x1_0000_0000 * 86_400, 0, index, -1);
  }
  const enqueueMs = performance.now() - enqueueStart;

  let ordered = true;
  let previous = Number.NEGATIVE_INFINITY;
  let drained = 0;
  const dequeueStart = performance.now();
  while (!queue.isEmpty) {
    const event = queue.dequeue();
    if (!event) break;
    if (event.time < previous) ordered = false;
    previous = event.time;
    drained++;
  }
  const dequeueMs = performance.now() - dequeueStart;
  expect(ordered).toBe(true);
  expect(drained).toBe(eventCount);
  return { enqueueMs, dequeueMs };
}

function makeWorld(componentCount: number, muCount: number): {
  manager: DESManager;
  components: DESStation[];
} {
  resetDESMUCounter();
  const manager = new DESManager(Math.max(256, muCount));
  const components: DESStation[] = [];
  for (let index = 0; index < componentCount; index++) {
    const node = new Object3D();
    node.name = `ScaleStation-${index}`;
    const component = manager.registerComponent(new DESStation(node));
    component.MaxCapacity = Math.ceil(muCount / componentCount) + 1;
    components.push(component);
  }
  for (let index = 0; index < muCount; index++) {
    const mu = createDESMU();
    manager.registerMU(mu);
    expect(components[index % componentCount].acceptMU(mu)).toBe(true);
  }
  return { manager, components };
}

function snapshotBaseline(componentCount: number, muCount: number): {
  bytes: number;
  snapshotMs: number;
  restoreMs: number;
} {
  const source = makeWorld(componentCount, muCount);
  const snapshotStart = performance.now();
  const json = JSON.stringify(createSnapshot(
    source.manager,
    source.components,
    [...source.manager.mus.values()],
  ));
  const snapshotMs = performance.now() - snapshotStart;

  resetDESMUCounter();
  const targetManager = new DESManager(Math.max(256, muCount));
  const targetComponents: DESStation[] = [];
  for (let index = 0; index < componentCount; index++) {
    const node = new Object3D();
    node.name = `ScaleStation-${index}`;
    targetComponents.push(targetManager.registerComponent(new DESStation(node)));
  }
  const restoredMUs: DESMU[] = [];
  const restoreStart = performance.now();
  restoreSnapshot(
    JSON.parse(json),
    targetManager,
    targetComponents,
    restoredMUs,
  );
  const restoreMs = performance.now() - restoreStart;

  expect(targetManager.components).toHaveLength(componentCount);
  expect(restoredMUs).toHaveLength(muCount);
  expect(targetManager.muCount).toBe(muCount);
  expect(json.length).toBeLessThan(128 * 1024 * 1024);
  return { bytes: json.length, snapshotMs, restoreMs };
}

describe('DES public runtime scale baselines', () => {
  it('orders and drains 100k and 1M events', () => {
    for (const eventCount of [100_000, 1_000_000]) {
      const result = eventQueueBaseline(eventCount);
      console.info(
        `[EP-DES-001 baseline] ${eventCount.toLocaleString('en-US')} events: `
        + `enqueue ${result.enqueueMs.toFixed(1)} ms, dequeue ${result.dequeueMs.toFixed(1)} ms`,
      );
    }
  }, 120_000);

  it('snapshots and restores configurable MU loads at 500 and 5,000 components', () => {
    for (const scale of [
      { components: 500, mus: 5_000 },
      { components: 5_000, mus: 10_000 },
    ]) {
      const result = snapshotBaseline(scale.components, scale.mus);
      console.info(
        `[EP-DES-001 baseline] ${scale.components.toLocaleString('en-US')} components / `
        + `${scale.mus.toLocaleString('en-US')} MUs: ${(result.bytes / 1024 / 1024).toFixed(2)} MiB, `
        + `snapshot ${result.snapshotMs.toFixed(1)} ms, restore ${result.restoreMs.toFixed(1)} ms`,
      );
    }
  }, 120_000);
});
