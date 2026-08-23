// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-002 — a scheduled path tween must resolve its `pathRef`.
 *
 * `self.pathTween()` emits `pathRef` INSTEAD of an inline sampler whenever the
 * path carries a stable id, which is what every registered `RVPath` does — that
 * is the JSON-safe form the snapshot contract depends on. `registerTweenSpec`
 * only read the inline `path`, so it handed `TweenRegistry.addPath` a null
 * sampler, which `addPath` drops silently. The DES leg still ran its events and
 * the model still reached the right state, but nothing ever moved along the
 * path — the visual sat at the origin for the whole run.
 *
 * Only `restoreFrozenTween` resolved the ref, so the defect surfaced solely on
 * the failure/resume path and never on a plain run.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { DESRunner } from '../../src/plugins/des/des-runner';
import { resetDESMUCounter } from '../../src/core/material-flow/des/rv-des-mu';
import { getDefaultPathNetwork } from '../../src/core/engine/rv-path-network';
import { parsePathExtras } from '../../src/core/engine/rv-path';
import { createBindContext, type BindContextHost, type KinematicsSpec } from '../../src/core/behavior-runtime';
import { ContextMenuStore } from '../../src/core/hmi/context-menu-store';
import { defineMaterialFlow, type MaterialFlowDefinition } from '../../src/core/material-flow/define-material-flow';
import { createSelf, type MaterialFlowSelf, type MU } from '../../src/core/material-flow/material-flow-self';
import type { MaterialFlowAdapter } from '../../src/plugins/des/material-flow-adapter';

const TICK = 1 / 60;
const PATH_ID = 'PathTweenRefFixture';
const LENGTH = 4;

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

/** Schedules one path leg over its own root, exactly like the Agv DES leg. */
const PathLeg = defineMaterialFlow<MaterialFlowSelf>({
  type: 'PathTweenRefFixture', kind: 'conveyor', schema: {}, capacity: () => 4, continuous: {},
  des: {
    onGenerate(self) {
      const path = getDefaultPathNetwork().get(PATH_ID);
      // `path` has a string id, so pathTween emits `pathRef` and no sampler.
      self.in(LENGTH, 'Arrival', null, self.pathTween(path, 0, LENGTH));
    },
    onArrival() { /* the leg's end state is the tween's final value */ },
  },
});

describe('EP-DES-002 — scheduled path tweens resolve pathRef', () => {
  beforeEach(() => {
    resetDESMUCounter();
    getDefaultPathNetwork().clear();
    getDefaultPathNetwork().register(parsePathExtras({
      type: 'Path', id: PATH_ID,
      segments: [{ kind: 'line', from: [0, 0, 0], to: [0, 0, LENGTH] }],
    }, PATH_ID)!);
  });

  it('moves the root along the referenced path instead of leaving it at the origin', () => {
    const runner = new DESRunner({ subMode: 'animated' });
    const root = new Object3D(); root.name = 'PathLeg';
    const accum: KinematicsSpec = {};
    const { ctx } = createBindContext(root, host(), accum);
    let adapter!: MaterialFlowAdapter;
    const def = PathLeg as MaterialFlowDefinition;
    const self = createSelf(ctx, def, {
      mode: 'des',
      scheduler: runner.makeScheduler(def, () => adapter.entityId),
      mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
      onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
      canAcceptDownstream: () => false,
      spawnMU: () => runner.createMU(),
    });
    adapter = runner.addInstance(def, self, root);
    runner.start([def], { root: new Object3D() });

    try {
      expect(root.position.distanceTo(new Vector3(0, 0, 0))).toBeLessThan(1e-9);

      // Half the leg: the visual must be sampled ON the path, not parked.
      for (let i = 0; i < 120; i++) { runner.tick(TICK); runner.lateTick(TICK); }
      const midway = root.position.clone();
      expect(midway.z).toBeGreaterThan(1.5);
      expect(midway.z).toBeLessThan(2.5);

      // End of the leg: the arc-length end position.
      for (let i = 0; i < 180; i++) { runner.tick(TICK); runner.lateTick(TICK); }
      expect(root.position.distanceTo(new Vector3(0, 0, LENGTH))).toBeLessThan(1e-6);
    } finally {
      runner.dispose();
      getDefaultPathNetwork().clear();
    }
  });
});
