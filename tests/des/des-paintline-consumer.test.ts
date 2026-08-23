// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Object3D } from 'three';
import { createBindContext, type BindContextHost, type KinematicsSpec } from '../../src/core/behavior-runtime';
import { ContextMenuStore } from '../../src/core/hmi/context-menu-store';
import { defineMaterialFlow, type MaterialFlowDefinition } from '../../src/core/material-flow/define-material-flow';
import { createSelf, type MaterialFlowSelf, type MU } from '../../src/core/material-flow/material-flow-self';
import { DESRunner } from '../../src/plugins/des/des-runner';
import { MaterialFlowAdapter } from '../../src/plugins/des/material-flow-adapter';
import { Station } from '../../src/plugins/des/material-flow/Station';
import { resetDESMUCounter } from '../../src/core/material-flow/des/rv-des-mu';

const SHIFT = 8 * 60 * 60;
const LINE_SPEED_METRES_PER_SECOND = 0.1;

interface ShiftSourceLocal { pending?: MU }

const ShiftSource = defineMaterialFlow<MaterialFlowSelf<ShiftSourceLocal>>({
  type: 'PaintFixtureSource', kind: 'source', schema: {}, continuous: {},
  des: {
    onGenerate(self) {
      const maximum = Number(self.prop.maximum ?? 0);
      const emitted = Number(self.prop.emitted ?? 0);
      if (emitted >= maximum) return;
      const pending = self.local.pending as MU | undefined;
      const mu = pending ?? self.spawn();
      if (!self.downstreamCanAccept(mu)) {
        self.local.pending = mu;
        self.in(1, 'Generate');
        return;
      }
      self.local.pending = undefined;
      self.prop.emitted = emitted + 1;
      self.transfer(mu);
      self.in(Number(self.prop.interval ?? 60), 'Generate');
    },
    onHorizon() {},
  },
});

const ShiftBuffer = defineMaterialFlow<MaterialFlowSelf>({
  type: 'PaintFixtureBuffer', kind: 'storage', schema: {}, capacity: () => 12, continuous: {},
  des: { onAccept(self, mu) { self.transfer(mu); return true; } },
});

const ShiftRouter = defineMaterialFlow<MaterialFlowSelf>({
  type: 'PaintFixtureRouter', kind: 'router', schema: {}, continuous: {},
  des: {
    onAccept(self, mu) {
      mu.prop ??= {};
      mu.prop.routeIndex = mu.id % 2;
      self.transfer(mu);
      return true;
    },
  },
});

const ShiftSink = defineMaterialFlow<MaterialFlowSelf>({
  type: 'PaintFixtureSink', kind: 'sink', schema: {}, continuous: {},
  des: { onAccept(self) { self.prop.output = Number(self.prop.output ?? 0) + 1; return true; } },
});

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

async function loadZone(file: string): Promise<{ root: Object3D; kind: string; seconds: number }> {
  const gltf = await new GLTFLoader().loadAsync(`/library/PaintLine/${file}`);
  const root = gltf.scene.children[0] ?? gltf.scene;
  const extras = root.userData.realvirtual as Record<string, unknown>;
  const zone = extras.PaintProcessZone as { Kind: string; Size: { z: number } };
  expect(extras.NodeId).toMatch(/^urn:rv:paintline:/);
  expect(zone).toBeDefined();
  return { root, kind: zone.Kind, seconds: zone.Size.z / LINE_SPEED_METRES_PER_SECOND };
}

interface Bound { adapter: MaterialFlowAdapter; self: MaterialFlowSelf }

function bind(runner: DESRunner, bindHost: BindContextHost, root: Object3D, rawDefinition: unknown): Bound {
  const def = rawDefinition as MaterialFlowDefinition;
  const accum: KinematicsSpec = {};
  const { ctx } = createBindContext(root, bindHost, accum);
  let adapter!: MaterialFlowAdapter;
  const self = createSelf(ctx, def, {
    mode: 'des', local: (def.state ?? def.local)?.() ?? {},
    scheduler: runner.makeScheduler(def, () => adapter.entityId),
    mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
    onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
    canAcceptDownstream: (mu) => adapter.nextComponents.some((next) => next.canAccept(mu as never)),
    spawnMU: () => runner.createMU(),
    onStatState: (state) => adapter?.setState(state),
  });
  adapter = runner.addInstance(def, self, root);
  return { adapter, self };
}

async function runShift(seed: number) {
  const [pretreat, spray, dry] = await Promise.all([
    loadZone('PretreatTunnel-8m.glb'),
    loadZone('SprayBooth.glb'),
    loadZone('DryOven-6m.glb'),
  ]);
  expect([pretreat.kind, spray.kind, dry.kind]).toEqual(['pretreat', 'spray', 'dry']);

  const bindHost = host();
  const runner = new DESRunner({ subMode: 'fastforward', durationSeconds: SHIFT, masterSeed: seed });
  const sourceRoot = new Object3D(); sourceRoot.name = 'ShiftSource';
  const bufferRoot = new Object3D(); bufferRoot.name = 'PaintTrackBuffer-6m';
  const routerRoot = new Object3D(); routerRoot.name = 'QualityRouter';
  const goodRoot = new Object3D(); goodRoot.name = 'GoodSink';
  const reworkRoot = new Object3D(); reworkRoot.name = 'ReworkSink';
  const source = bind(runner, bindHost, sourceRoot, ShiftSource);
  const pretreatStation = bind(runner, bindHost, pretreat.root, Station);
  const buffer = bind(runner, bindHost, bufferRoot, ShiftBuffer);
  const sprayStation = bind(runner, bindHost, spray.root, Station);
  const dryStation = bind(runner, bindHost, dry.root, Station);
  const router = bind(runner, bindHost, routerRoot, ShiftRouter);
  const good = bind(runner, bindHost, goodRoot, ShiftSink);
  const rework = bind(runner, bindHost, reworkRoot, ShiftSink);
  Object.assign(source.self.prop, { interval: 60, maximum: 1_000, emitted: 0 });
  pretreatStation.self.prop.ProcessingTime = pretreat.seconds;
  sprayStation.self.prop.ProcessingTime = spray.seconds;
  dryStation.self.prop.ProcessingTime = dry.seconds;

  const chain = [source, pretreatStation, buffer, sprayStation, dryStation, router];
  for (let index = 0; index < chain.length - 1; index++) {
    chain[index].adapter.nextComponents = [chain[index + 1].adapter];
    chain[index + 1].adapter.previousComponents = [chain[index].adapter];
  }
  router.adapter.nextComponents = [good.adapter, rework.adapter];
  good.adapter.previousComponents = [router.adapter];
  rework.adapter.previousComponents = [router.adapter];
  const definitions = [ShiftSource, Station, ShiftBuffer, ShiftRouter, ShiftSink] as unknown as MaterialFlowDefinition[];
  runner.start(definitions, { root: sourceRoot, host: bindHost });
  source.self.at(SHIFT, 'Horizon');
  expect(await runner.runFastForward()).toBe(true);
  runner.lateTick(0);
  const statistics = runner.statistics();
  const result = {
    simTime: runner.simTime,
    emitted: Number(source.self.prop.emitted ?? 0),
    output: Number(good.self.prop.output ?? 0) + Number(rework.self.prop.output ?? 0),
    good: Number(good.self.prop.output ?? 0),
    rework: Number(rework.self.prop.output ?? 0),
    wip: runner.muCount,
    bottleneck: statistics.bottleneck?.name ?? null,
    components: statistics.components.map(({ name, totalProcessed }) => ({ name, totalProcessed })),
  };
  runner.dispose();
  return result;
}

describe('paint-line assets consume the public domain-neutral DES runtime', () => {
  beforeEach(() => resetDESMUCounter());

  it('runs an 8 h shift from real public asset metadata and reproduces KPIs', async () => {
    const first = await runShift(5001);
    resetDESMUCounter();
    const second = await runShift(5001);
    expect(first).toEqual(second);
    expect(first.simTime).toBe(SHIFT);
    expect(first.output).toBeGreaterThan(300);
    expect(first.emitted - first.output).toBe(first.wip);
    expect(first.good + first.rework).toBe(first.output);
    expect(first.bottleneck).toMatch(/^PretreatTunnel-8m(?:_\d+)?$/);
  }, 120_000);
});
