// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-002 M2 — an explicit `routeIndex` names a LANE, not a free slot.
 *
 * The regression: `makeTransfer` resolved `routeIndex` against the list of
 * downstreams that could accept RIGHT NOW. As soon as one lane filled up, the
 * index shifted and the MU was silently diverted — a part into the empty-carrier
 * sink, or an empty carrier into the part line. Back-pressure has to block.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { DESRunner } from '../../src/plugins/des/des-runner';
import { resetDESMUCounter } from '../../src/core/material-flow/des/rv-des-mu';
import { createBindContext, type BindContextHost, type KinematicsSpec } from '../../src/core/behavior-runtime';
import { ContextMenuStore } from '../../src/core/hmi/context-menu-store';
import { defineMaterialFlow, type MaterialFlowDefinition } from '../../src/core/material-flow/define-material-flow';
import { createSelf, type MaterialFlowSelf, type MU } from '../../src/core/material-flow/material-flow-self';
import type { MaterialFlowAdapter } from '../../src/plugins/des/material-flow-adapter';

function host(): BindContextHost {
  const values = new Map<string, boolean | number>();
  return {
    signalStore: {
      get: (name: string) => values.get(name),
      set: (name: string, value: boolean | number) => values.set(name, value),
      subscribe: () => () => {},
    } as never,
    on: () => () => {}, contextMenu: new ContextMenuStore(), drives: [], registry: null,
    getPlugin: () => undefined,
  } as BindContextHost;
}

const Router = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RoutingFixtureRouter', kind: 'router', schema: {}, capacity: () => 10, continuous: {},
  des: { onAccept: () => true },
});

/** Holds whatever it accepts, so its capacity can be exhausted on demand. */
function holdingLane(type: string, capacity: number): MaterialFlowDefinition {
  return defineMaterialFlow<MaterialFlowSelf>({
    type, kind: 'storage', schema: {}, capacity: () => capacity, continuous: {},
    des: { onAccept: () => true },
  }) as MaterialFlowDefinition;
}

const LaneA = holdingLane('RoutingFixtureLaneA', 1);
const LaneB = holdingLane('RoutingFixtureLaneB', 10);

interface Fixture {
  runner: DESRunner;
  router: MaterialFlowAdapter;
  laneA: MaterialFlowAdapter;
  laneB: MaterialFlowAdapter;
  send(routeIndex: number | null): MU;
}

function fixture(): Fixture {
  const runner = new DESRunner({ subMode: 'step' });
  const bind = (name: string, def: MaterialFlowDefinition): MaterialFlowAdapter => {
    const node = new Object3D(); node.name = name;
    const accum: KinematicsSpec = {};
    const { ctx } = createBindContext(node, host(), accum);
    let adapter!: MaterialFlowAdapter;
    const self = createSelf(ctx, def, {
      mode: 'des',
      scheduler: runner.makeScheduler(def, () => adapter.entityId),
      mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
      onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
      canAcceptDownstream: (mu) => adapter.nextComponents.some((next) => next.canAccept(mu as never)),
      spawnMU: () => runner.createMU(),
    });
    adapter = runner.addInstance(def, self, node);
    return adapter;
  };
  const router = bind('Router', Router as MaterialFlowDefinition);
  const laneA = bind('LaneA', LaneA);
  const laneB = bind('LaneB', LaneB);
  router.nextComponents = [laneA, laneB];
  laneA.previousComponents = [router];
  laneB.previousComponents = [router];
  runner.start([Router as MaterialFlowDefinition, LaneA, LaneB], { root: router.node });

  return {
    runner, router, laneA, laneB,
    send(routeIndex) {
      const mu = runner.createMU();
      router.acceptMU(mu);
      if (routeIndex !== null) {
        (mu as unknown as MU).prop ??= {};
        (mu as unknown as MU).prop!.routeIndex = routeIndex;
      }
      router.self.transfer(mu as unknown as MU);
      return mu as unknown as MU;
    },
  };
}

describe('EP-DES-002 M2 — routeIndex resolves against the declared topology', () => {
  beforeEach(() => resetDESMUCounter());

  it('delivers to the addressed lane while every lane is free', () => {
    const f = fixture();
    try {
      f.send(0);
      f.send(1);
      expect(f.laneA.currentLoad).toBe(1);
      expect(f.laneB.currentLoad).toBe(1);
    } finally {
      f.runner.dispose();
    }
  });

  it('blocks instead of diverting when the addressed lane is full', () => {
    const f = fixture();
    try {
      f.send(0);                       // LaneA (capacity 1) is now full
      expect(f.laneA.currentLoad).toBe(1);

      const blocked = f.send(0);       // still addressed to LaneA
      expect(f.laneB.currentLoad).toBe(0);      // must NOT be diverted
      expect(f.laneA.currentLoad).toBe(1);
      expect(f.router.heldMUs.some((held) => held.id === blocked.id)).toBe(true);
      expect(f.router.state).toBe('Blocked');
    } finally {
      f.runner.dispose();
    }
  });

  it('still uses the first available downstream when no routeIndex is set', () => {
    const f = fixture();
    try {
      f.send(null);
      expect(f.laneA.currentLoad).toBe(1);
      f.send(null);                    // LaneA full → default routing falls through
      expect(f.laneB.currentLoad).toBe(1);
    } finally {
      f.runner.dispose();
    }
  });

  it('keeps the legacy fallback for an index that names no configured lane', () => {
    const f = fixture();
    try {
      f.router.nextComponents = [f.laneB];
      f.send(1);                       // lane 1 was never wired up
      expect(f.laneB.currentLoad).toBe(1);
      expect(f.router.state).not.toBe('Blocked');
    } finally {
      f.runner.dispose();
    }
  });
});
