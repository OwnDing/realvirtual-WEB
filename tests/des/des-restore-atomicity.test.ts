// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-002 M1 — snapshot restore must be all-or-nothing, and a checkpoint
 * written in an earlier session must resolve its persisted action names.
 *
 * The regression: model actions were registered lazily on first `schedule()`,
 * so reopening a checkpoint in a fresh page threw `unknown action` from the
 * MIDDLE of `restore()` — after the clock, seed and MU table had already been
 * overwritten. The runtime silently became a manager whose clock had jumped to
 * the checkpoint over an empty event queue.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { DESRunner, registerDefinitionHookActions } from '../../src/plugins/des/des-runner';
import { DESManager } from '../../src/plugins/des/rv-des-manager';
import { ACTION_INDEX } from '../../src/plugins/des/rv-des-named-actions';
import { resetDESMUCounter } from '../../src/plugins/des/rv-des-mu';
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

/** Two hooks, neither of which this test ever schedules before restoring. */
const LateHookStation = defineMaterialFlow<MaterialFlowSelf>({
  type: 'AtomicityFixtureStation', kind: 'station', schema: {}, continuous: {},
  des: {
    onAccept(self, mu) { self.in(30, 'Finish', mu); return true; },
    onFinish(self, mu) { if (mu) self.transfer(mu); },
    onNeverScheduled() { /* declared but never fired in this test */ },
  },
});

function bind(runner: DESRunner, root: Object3D, def: MaterialFlowDefinition): MaterialFlowAdapter {
  const accum: KinematicsSpec = {};
  const { ctx } = createBindContext(root, host(), accum);
  let adapter!: MaterialFlowAdapter;
  const self = createSelf(ctx, def, {
    mode: 'des',
    scheduler: runner.makeScheduler(def, () => adapter.entityId),
    mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
    onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
    canAcceptDownstream: () => true,
    spawnMU: () => runner.createMU(),
  });
  adapter = runner.addInstance(def, self, root);
  return adapter;
}

describe('EP-DES-002 M1 — DES snapshot restore atomicity', () => {
  beforeEach(() => resetDESMUCounter());

  it('registers every declared hook action when a definition is bound', () => {
    const runner = new DESRunner({ subMode: 'step' });
    const node = new Object3D(); node.name = 'AtomicityStation';
    bind(runner, node, LateHookStation as MaterialFlowDefinition);
    try {
      // Declared but never scheduled — a fresh-session restore still needs it.
      expect(ACTION_INDEX.has('AtomicityFixtureStation.Finish')).toBe(true);
      expect(ACTION_INDEX.has('AtomicityFixtureStation.NeverScheduled')).toBe(true);
      expect(ACTION_INDEX.has('AtomicityFixtureStation.Accept')).toBe(true);
    } finally {
      runner.dispose();
    }
  });

  it('registerDefinitionHookActions is idempotent', () => {
    const def = LateHookStation as MaterialFlowDefinition;
    registerDefinitionHookActions(def);
    const first = ACTION_INDEX.get('AtomicityFixtureStation.Finish');
    registerDefinitionHookActions(def);
    expect(ACTION_INDEX.get('AtomicityFixtureStation.Finish')).toBe(first);
  });

  it('leaves the manager untouched when a snapshot names an unknown action', () => {
    const manager = new DESManager();
    manager.duration = 600;
    manager.setMasterSeed(11);
    manager.currentTime = 5;
    manager.processedEventCount = 3;
    const before = {
      currentTime: manager.currentTime,
      processed: manager.processedEventCount,
      seed: manager.masterSeed,
      pending: manager.pendingEventCount,
      muCount: manager.muCount,
      duration: manager.duration,
    };

    expect(() => manager.restore({
      version: 3,
      currentTime: 1234,
      duration: 28_800,
      processedEventCount: 42,
      masterSeed: 7,
      rngState: [1, 2, 3, 4],
      nextMuId: 0,
      muGenerationCounters: [],
      events: [{ id: 0, time: 1300, action: 'NoSuchType.NoSuchHook', entityId: 0, muId: -1, priority: 0 }],
      mus: [],
      componentStates: [],
    })).toThrow(/unknown action/);

    expect({
      currentTime: manager.currentTime,
      processed: manager.processedEventCount,
      seed: manager.masterSeed,
      pending: manager.pendingEventCount,
      muCount: manager.muCount,
      duration: manager.duration,
    }).toEqual(before);
  });

  it('rejects a malformed event time without committing any state', () => {
    const manager = new DESManager();
    manager.currentTime = 9;
    expect(() => manager.restore({
      version: 3, currentTime: 100, duration: 600, processedEventCount: 0,
      masterSeed: 1, rngState: [1, 2, 3, 4], nextMuId: 0, muGenerationCounters: [],
      events: [{ id: 0, time: -1, action: 'AtomicityFixtureStation.Finish', entityId: 0, muId: -1, priority: 0 }],
      mus: [], componentStates: [],
    })).toThrow(/invalid DES event time/);
    expect(manager.currentTime).toBe(9);
    expect(manager.pendingEventCount).toBe(0);
  });

  it('re-arms the warm-up and completion latches so a rewind replays them', () => {
    const manager = new DESManager();
    manager.duration = 600;
    expect(manager.markCompleteNotified()).toBe(true);
    expect(manager.markCompleteNotified()).toBe(false);

    manager.restore({
      version: 3, currentTime: 120, duration: 600, processedEventCount: 4,
      masterSeed: 3, rngState: [1, 2, 3, 4], nextMuId: 0, muGenerationCounters: [],
      events: [], mus: [], componentStates: [],
    });

    expect(manager.currentTime).toBe(120);
    expect(manager.markCompleteNotified()).toBe(true);
  });

  it('restores a checkpoint that references a hook this session never fired', () => {
    const runner = new DESRunner({ subMode: 'step', durationSeconds: 600 });
    const node = new Object3D(); node.name = 'AtomicityStation';
    const adapter = bind(runner, node, LateHookStation as MaterialFlowDefinition);
    runner.start([LateHookStation as MaterialFlowDefinition], { root: node });
    try {
      const manager = runner.getManager();
      // Hand-written snapshot: exactly what a checkpoint from a previous page
      // session looks like when a Finish event was still pending.
      manager.restore({
        version: 3, currentTime: 10, duration: 600, processedEventCount: 1,
        masterSeed: manager.masterSeed, rngState: [...manager.rng.getState()],
        nextMuId: 0, muGenerationCounters: [],
        events: [{
          id: 0, time: 40, action: 'AtomicityFixtureStation.Finish',
          entityId: adapter.entityId, muId: -1, priority: 0,
        }],
        mus: [], componentStates: [],
      });
      expect(manager.currentTime).toBe(10);
      expect(manager.pendingEventCount).toBe(1);
      expect(manager.nextEventTime).toBe(40);
    } finally {
      runner.dispose();
    }
  });
});
