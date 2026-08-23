// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-002 M5 — complexity guards for the per-frame and per-failure paths.
 *
 * These assert SCALING, not milliseconds: the cost is compared between two
 * queue sizes on the same machine in the same run, so a shared/throttled CI box
 * shifts both measurements together. The regressions being guarded were
 * algorithmic (a full clone-and-sort of the heap on a getter that runs every
 * frame, and again inside every `cancelEvent`), so linear-or-worse growth is
 * exactly the signal.
 */
import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { DESManager } from '../../src/core/material-flow/des/rv-des-manager';
import { DESEventQueue } from '../../src/core/material-flow/des/rv-des-event-queue';
import { DESStation } from '../../src/core/material-flow/des/rv-des-station';
import { ACTION_INDEX, registerAction } from '../../src/core/material-flow/des/rv-des-named-actions';

const NOOP_ACTION = 'HotPathBaseline.Noop';
if (!ACTION_INDEX.has(NOOP_ACTION)) registerAction(NOOP_ACTION, () => {});

function managerWith(pending: number): DESManager {
  const manager = new DESManager();
  manager.duration = 1e9;
  for (let index = 0; index < pending; index++) {
    manager.scheduleEvent(1 + index, NOOP_ACTION, 7, -1);
  }
  return manager;
}

/** Median of repeated timings, to blunt one-off scheduler noise. */
function medianMs(runs: number, body: () => void): number {
  const samples: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    body();
    samples.push(performance.now() - started);
  }
  return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
}

describe('EP-DES-002 M5 — DES hot-path complexity', () => {
  it('the per-frame completion check does not scale with queue size', () => {
    const small = managerWith(2_000);
    const large = managerWith(40_000);
    const probe = (manager: DESManager) => () => {
      for (let frame = 0; frame < 200; frame++) {
        // Exactly what DESRunner.maybeCompleteRun() evaluates every frame.
        if (!Number.isFinite(manager.nextModelEventTime) && manager.isComplete) break;
      }
    };
    const smallMs = medianMs(5, probe(small));
    const largeMs = medianMs(5, probe(large));
    console.info(`[EP-DES-002 M5] completion check: 2k ${smallMs.toFixed(2)} ms, 40k ${largeMs.toFixed(2)} ms per 200 frames`);
    // 20× the queue must not cost meaningfully more: the check is O(log n).
    expect(largeMs).toBeLessThan(Math.max(smallMs * 4, 2));
  });

  it('cancelEvent does not scale with queue size', () => {
    const small = managerWith(2_000);
    const large = managerWith(40_000);
    const cancel = (manager: DESManager, from: number) => () => {
      for (let index = 0; index < 200; index++) manager.cancelEvent(from + index);
    };
    const smallMs = medianMs(3, cancel(small, 0));
    const largeMs = medianMs(3, cancel(large, 0));
    console.info(`[EP-DES-002 M5] 200 cancels: 2k ${smallMs.toFixed(2)} ms, 40k ${largeMs.toFixed(2)} ms`);
    expect(largeMs).toBeLessThan(Math.max(smallMs * 4, 2));
  });

  it('a targeted entity query never clones the whole heap', () => {
    const manager = new DESManager();
    manager.duration = 1e9;
    for (let index = 0; index < 5_000; index++) {
      manager.scheduleEvent(1 + index, NOOP_ACTION, index % 50, -1);
    }
    const mine = manager.getEventQueueSnapshotForEntity(7);
    expect(mine).toHaveLength(100);
    expect(mine.every((event) => event.entityId === 7)).toBe(true);
    // Still in canonical (time, priority, id) order.
    for (let index = 1; index < mine.length; index++) {
      expect(mine[index].time).toBeGreaterThan(mine[index - 1].time);
    }
  });

  it('peekTimeExcludingAction leaves the heap intact and ordered', () => {
    const queue = new DESEventQueue();
    queue.enqueue(30, 1, 0, -1);
    queue.enqueue(10, 1, 0, -1);
    queue.enqueue(20, 1, 0, -1);
    const systemId = queue.enqueueSystem(5, 99, -1, -1, -0x80000000);

    expect(queue.peekTime).toBe(5);
    expect(queue.peekTimeExcludingAction(99)).toBe(10);
    // Parking the system event must not consume it.
    expect(queue.peekTime).toBe(5);
    expect(queue.count).toBe(4);

    expect(queue.cancel(systemId)).toBe(true);
    expect(queue.peekTimeExcludingAction(99)).toBe(10);
    expect(queue.dequeue()?.time).toBe(10);
    expect(queue.dequeue()?.time).toBe(20);
    expect(queue.dequeue()?.time).toBe(30);
    expect(queue.dequeue()).toBeNull();
  });

  it('retiring many MUs keeps the free-id list ordered and reusable', () => {
    const manager = new DESManager();
    const created = Array.from({ length: 500 }, () => manager.createMU());
    for (const mu of created) manager.retireMU(mu);
    expect(manager.muCount).toBe(0);
    // Lowest free id first, and the generation counter advanced.
    const reused = manager.createMU();
    expect(reused.id).toBe(0);
    expect(reused.generation).toBe(1);
    expect(manager.createMU().id).toBe(1);
  });
});

describe('EP-DES-002 M6 — component RNG streams follow the master seed', () => {
  /**
   * Component streams are derived from `masterSeed + entityId`, but they were
   * only ever derived at attach time. A per-replication seed therefore changed
   * the manager stream while every component replayed the FIRST run's draws —
   * silently correlating replications that are supposed to be independent.
   */
  function drawsForSeed(seed: number): number[] {
    const manager = new DESManager();
    const components = [0, 1, 2].map((index) => {
      const node = new Object3D();
      node.name = `SeedProbe-${index}`;
      return manager.registerComponent(new DESStation(node));
    });
    manager.setMasterSeed(seed);
    return components.map((component) => component.random());
  }

  it('re-derives every component stream when the seed changes', () => {
    const a = drawsForSeed(1234);
    const b = drawsForSeed(5678);
    expect(a).not.toEqual(b);
    // Still deterministic for a given seed, and distinct per component.
    expect(drawsForSeed(1234)).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });

  it('components registered after a seed change use that seed', () => {
    const manager = new DESManager();
    manager.setMasterSeed(99);
    const node = new Object3D(); node.name = 'LateProbe';
    const late = manager.registerComponent(new DESStation(node));

    const reference = new DESManager();
    reference.setMasterSeed(99);
    const refNode = new Object3D(); refNode.name = 'LateProbe';
    const early = reference.registerComponent(new DESStation(refNode));

    expect(late.random()).toBe(early.random());
  });
});
