// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-DES-002 M4 — a runner must not be pinned by the global named-action table.
 *
 * The regression: `makeScheduler` registered the `${type}.${hook}` handler as a
 * closure over `this`. `ACTION_BY_INDEX` is module-global and never cleared, so
 * the FIRST runner to touch a hook was retained for the life of the page, and
 * every LATER runner reused that closure — its scheduled-record bookkeeping was
 * written into the wrong (disposed) instance and therefore never pruned.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { DESRunner } from '../../src/plugins/des/des-runner';
import { resetDESMUCounter } from '../../src/core/material-flow/des/rv-des-mu';
import { SimulationKernel } from '../../src/core/material-flow/simulation-kernel';
import { ContinuousRunner } from '../../src/core/material-flow/continuous-runner';
import type { SimulationExecutor } from '../../src/core/material-flow/simulation-executor';
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

const Ticker = defineMaterialFlow<MaterialFlowSelf>({
  type: 'LifecycleFixtureTicker', kind: 'station', schema: {}, capacity: () => 4, continuous: {},
  des: {
    onAccept(self, mu) { self.in(5, 'ProcessComplete', mu); return true; },
    onProcessComplete() { /* the MU stays held; only the bookkeeping matters */ },
  },
});

/** `scheduledRecords` is private; the record count is observable through it. */
function scheduledRecordCount(runner: DESRunner): number {
  return (runner as unknown as { scheduledRecords: Map<number, unknown> }).scheduledRecords.size;
}

function buildRunner(): { runner: DESRunner; adapter: MaterialFlowAdapter } {
  const runner = new DESRunner({ subMode: 'step', durationSeconds: 600 });
  const node = new Object3D(); node.name = 'LifecycleTicker';
  const accum: KinematicsSpec = {};
  const { ctx } = createBindContext(node, host(), accum);
  let adapter!: MaterialFlowAdapter;
  const self = createSelf(ctx, Ticker as MaterialFlowDefinition, {
    mode: 'des',
    scheduler: runner.makeScheduler(Ticker as MaterialFlowDefinition, () => adapter.entityId),
    mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
    onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
    canAcceptDownstream: () => false,
    spawnMU: () => runner.createMU(),
  });
  adapter = runner.addInstance(Ticker as MaterialFlowDefinition, self, node);
  runner.start([Ticker as MaterialFlowDefinition], { root: node });
  return { runner, adapter };
}

describe('EP-DES-002 M4 — DES runner lifecycle', () => {
  beforeEach(() => resetDESMUCounter());

  it('prunes its own scheduled records even when another runner registered the hook first', () => {
    // The first runner registers `LifecycleFixtureTicker.ProcessComplete`.
    const first = buildRunner();
    first.adapter.acceptMU(first.runner.createMU());
    expect(scheduledRecordCount(first.runner)).toBe(1);
    first.runner.dispose();

    // The second runner reuses that registration; its own map must still drain.
    const second = buildRunner();
    second.adapter.acceptMU(second.runner.createMU());
    expect(scheduledRecordCount(second.runner)).toBe(1);
    while (second.runner.getManager().step()) { /* drain */ }
    expect(scheduledRecordCount(second.runner)).toBe(0);
    second.runner.dispose();
  });

  it('dispose() releases bookkeeping and adapter callbacks', () => {
    const { runner, adapter } = buildRunner();
    adapter.acceptMU(runner.createMU());
    expect(scheduledRecordCount(runner)).toBe(1);

    runner.dispose();

    expect(scheduledRecordCount(runner)).toBe(0);
    expect(runner.instances()).toHaveLength(0);
    expect(runner.getManager().components).toHaveLength(0);
    expect(runner.getManager().onTimeAdvance).toBeNull();
    expect(adapter.onScheduledRecordConsumed).toBeNull();
    expect(adapter.onConsumed).toBeNull();
  });

  it('SimulationKernel.disposeDesRunner tears the executor down and returns to continuous', () => {
    let disposed = 0;
    const continuousRunner = new ContinuousRunner(
      { mus: [], update() {}, reset() {} },
      { tick() {} },
    );
    const desRunner = {
      mode: 'des' as const, ready: true,
      start() {}, tick() {}, reset() {}, clearMUs() {},
      dispose() { disposed++; }, instances: () => [],
    } as unknown as SimulationExecutor;

    const kernel = new SimulationKernel({
      continuousRunner,
      topology: { root: new Object3D() },
      desRunnerFactory: () => desRunner,
    });
    kernel.setMode('des');
    expect(kernel.mode).toBe('des');

    kernel.disposeDesRunner();
    expect(disposed).toBe(1);
    expect(kernel.mode).toBe('continuous');

    // Idempotent: a second call must not re-dispose.
    kernel.disposeDesRunner();
    expect(disposed).toBe(1);
  });
});
