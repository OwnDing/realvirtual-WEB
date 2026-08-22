// SPDX-License-Identifier: AGPL-3.0-only

import { Object3D } from 'three';
import type { BindContextHost, KinematicsSpec } from '../../../core/behavior-runtime';
import { createBindContext } from '../../../core/behavior-runtime';
import { defineMaterialFlow, type MaterialFlowDefinition } from '../../../core/material-flow/define-material-flow';
import { createSelf, type MaterialFlowSelf, type MU } from '../../../core/material-flow/material-flow-self';
import type { MaterialFlowAdapter } from '../material-flow-adapter';
import { DESRunner } from '../des-runner';

export const ROBOT_LOADING_REFERENCE_DURATION_SECONDS = 8 * 60 * 60;
export const ROBOT_LOADING_REFERENCE_SEED = 297;

export interface RobotLoadingDemoOptions {
  palletCount: number;
  blistersPerPallet: number;
  partsPerBlister: number;
  masterSeed: number;
  durationSeconds: number;
}

export interface RobotLoadingDemoRuntime {
  runner: DESRunner;
  boundCount: number;
  nodes: Map<string, Object3D>;
  logicalConnections: Array<{ from: string; to: string; port: string }>;
  source: MaterialFlowAdapter;
  partSink: MaterialFlowAdapter;
  emptySink: MaterialFlowAdapter;
  expectedCreated: number;
}

export interface RobotLoadingDemoResult {
  simTime: number;
  generatedPallets: number;
  createdMUs: number;
  partThroughput: number;
  emptyCarrierThroughput: number;
  liveMUs: number;
  pendingEvents: number;
  activeReservations: number;
  horizonReached: boolean;
  totalEventsProcessed: number;
  componentLoads: Record<string, number>;
}

const DemoSource = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoSource', kind: 'source', schema: {}, continuous: {},
  des: {
    onGenerate(self) {
      const pallets = Number(self.prop.palletCount ?? 0);
      const blisters = pallets * Number(self.prop.blistersPerPallet ?? 0);
      const parts = blisters * Number(self.prop.partsPerBlister ?? 0);
      for (let index = 0; index < pallets + blisters; index++) {
        const mu = self.spawn(); mu.carrierType = index < pallets ? 'pallet' : 'blister';
        self.transfer(mu);
      }
      for (let index = 0; index < parts; index++) {
        const mu = self.spawn(); mu.carrierType = 'part'; self.transfer(mu);
      }
      self.prop.generatedPallets = pallets;
      self.prop.createdMUs = pallets + blisters + parts;
      self.at(Number(self.prop.durationSeconds ?? 0), 'Horizon');
    },
    onHorizon() { /* explicit end-of-horizon model event */ },
  },
});

function passDefinition(type: string, kind: 'station' | 'conveyor' | 'storage' = 'station'): MaterialFlowDefinition {
  return defineMaterialFlow<MaterialFlowSelf>({
    type, kind, schema: {}, capacity: () => 1_000_000_000, continuous: {},
    des: {
      onAccept(self, mu) {
        if (type === 'RobotLoadingDemoRobot') {
          mu.prop ??= {};
          mu.prop.routeIndex = mu.carrierType === 'part' ? 0 : 1;
        }
        self.transfer(mu);
        return true;
      },
    },
  }) as MaterialFlowDefinition;
}

const DemoRobot = passDefinition('RobotLoadingDemoRobot');
const DemoIndex = passDefinition('RobotLoadingDemoIndex', 'conveyor');
const DemoStation = passDefinition('RobotLoadingDemoStation');
const DemoPath = passDefinition('RobotLoadingDemoPath', 'conveyor');
const DemoBuffer = passDefinition('RobotLoadingDemoBuffer', 'storage');
const DemoPartSink = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoPartSink', kind: 'sink', schema: {}, continuous: {},
  des: { onAccept(self) { self.prop.throughput = Number(self.prop.throughput ?? 0) + 1; return true; } },
});
const DemoEmptySink = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoEmptySink', kind: 'sink', schema: {}, continuous: {},
  des: { onAccept(self) { self.prop.throughput = Number(self.prop.throughput ?? 0) + 1; return true; } },
});
const DemoIdle = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoIdle', kind: 'storage', schema: {}, continuous: {}, des: {},
});

export function createRobotLoadingDemoRuntime(
  host: BindContextHost,
  options: RobotLoadingDemoOptions,
): RobotLoadingDemoRuntime {
  const runner = new DESRunner({ durationSeconds: options.durationSeconds, masterSeed: options.masterSeed });
  const root = new Object3D(); root.name = 'RobotLoadingReference';
  const nodes = new Map<string, Object3D>();
  const names = [
    'PalletInput-01', 'RobotHandling', 'IndexingConveyor', 'Station', 'PathTransport',
    'Sink', 'EmptyCarrierBuffer', 'PreBuffer', 'QualityGate', 'PalletReturn', 'Diagnostics',
  ];
  for (const name of names) {
    const node = new Object3D(); node.name = name;
    node.userData.realvirtual = { LayoutObject: { virtual: true } };
    root.add(node); nodes.set(name, node);
  }
  for (let index = 1; index <= 20; index++) {
    const carrier = new Object3D(); carrier.name = index === 1 ? 'Carrier' : `Carrier-${index}`;
    nodes.get('IndexingConveyor')!.add(carrier);
  }
  const path = new Object3D(); path.name = 'Path-Reference'; nodes.get('PathTransport')!.add(path);

  const adapters = new Map<string, MaterialFlowAdapter>();
  const bind = (name: string, def: MaterialFlowDefinition): MaterialFlowAdapter => {
    const node = nodes.get(name)!;
    const accum: KinematicsSpec = {};
    const { ctx } = createBindContext(node, host, accum);
    let adapter!: MaterialFlowAdapter;
    const self = createSelf(ctx, def, {
      mode: 'des',
      scheduler: runner.makeScheduler(def, () => adapter.entityId),
      mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
      onTransfer: (mu) => runner.makeTransfer(adapter)(mu),
      canAcceptDownstream: (mu) => adapter.nextComponents.some((target) => target.canAccept(mu as never)),
      spawnMU: () => runner.createMU(),
    });
    adapter = runner.addInstance(def, self, node);
    adapters.set(name, adapter);
    return adapter;
  };

  const source = bind('PalletInput-01', DemoSource as MaterialFlowDefinition);
  const robot = bind('RobotHandling', DemoRobot);
  const indexing = bind('IndexingConveyor', DemoIndex);
  const station = bind('Station', DemoStation);
  const transport = bind('PathTransport', DemoPath);
  const partSink = bind('Sink', DemoPartSink as MaterialFlowDefinition);
  const emptySink = bind('EmptyCarrierBuffer', DemoEmptySink as MaterialFlowDefinition);
  bind('PreBuffer', DemoBuffer); bind('QualityGate', DemoIdle as MaterialFlowDefinition);
  bind('PalletReturn', DemoIdle as MaterialFlowDefinition); bind('Diagnostics', DemoIdle as MaterialFlowDefinition);

  const connect = (from: MaterialFlowAdapter, ...to: MaterialFlowAdapter[]): void => {
    from.nextComponents = to;
    for (const target of to) target.previousComponents.push(from);
  };
  connect(source, robot);
  connect(robot, indexing, emptySink);
  connect(indexing, station);
  connect(station, transport);
  connect(transport, partSink);

  Object.assign(source.self.prop, {
    palletCount: options.palletCount,
    blistersPerPallet: options.blistersPerPallet,
    partsPerBlister: options.partsPerBlister,
    durationSeconds: options.durationSeconds,
  });
  runner.start([...new Set([...adapters.values()].map((adapter) => adapter.def))], { root, host });
  return {
    runner, boundCount: adapters.size, nodes,
    logicalConnections: [
      { from: 'RobotHandling', to: 'IndexingConveyor', port: 'out' },
      { from: 'RobotHandling', to: 'EmptyCarrierBuffer', port: 'empty' },
      { from: 'IndexingConveyor', to: 'Station', port: 'out' },
      { from: 'Station', to: 'PathTransport', port: 'out' },
      { from: 'PathTransport', to: 'Sink', port: 'out' },
    ],
    source, partSink, emptySink,
    expectedCreated: options.palletCount
      + options.palletCount * options.blistersPerPallet
      + options.palletCount * options.blistersPerPallet * options.partsPerBlister,
  };
}

export function robotLoadingDemoResult(runtime: RobotLoadingDemoRuntime): RobotLoadingDemoResult {
  runtime.runner.lateTick(0);
  const manager = runtime.runner.getManager();
  const componentLoads = Object.fromEntries(runtime.runner.componentStates().map((state) => [state.name, state.load]));
  return {
    simTime: runtime.runner.simTime,
    generatedPallets: Number(runtime.source.self.prop.generatedPallets ?? 0),
    createdMUs: Number(runtime.source.self.prop.createdMUs ?? 0),
    partThroughput: Number(runtime.partSink.self.prop.throughput ?? 0),
    emptyCarrierThroughput: Number(runtime.emptySink.self.prop.throughput ?? 0),
    liveMUs: manager.muCount,
    pendingEvents: manager.pendingEventCount,
    activeReservations: manager.activeReservationCount,
    horizonReached: runtime.runner.simTime >= runtime.runner.endTime,
    totalEventsProcessed: manager.totalEventsProcessed,
    componentLoads,
  };
}
