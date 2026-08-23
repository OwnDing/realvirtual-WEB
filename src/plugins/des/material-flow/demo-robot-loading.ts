// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Robot-loading reference layout (plan-297 Phase 7, hardened by EP-DES-002 M2).
 *
 * This is a REFERENCE LOAD: its job is to put a known, reproducible amount of
 * work through the public DES engine. Every stage therefore consumes simulated
 * time and every hand-over goes through the event queue.
 *
 * The previous shape emitted all 2,110 MUs inside `runner.start()` and walked
 * them to the sink in one synchronous call stack, leaving a single no-op
 * horizon event on the heap. The totals looked right while
 * `totalEventsProcessed` was 1 — the engine was never exercised, so the layout
 * proved nothing about scheduling, blocking or back-pressure.
 *
 * The layout now models a single-server robot feeding a capacity-limited
 * indexing conveyor and a single-server station, so the run exercises the
 * blocked → `onDownstreamReady` → retry path that a real line depends on.
 */

import { Object3D } from 'three';
import type { BindContextHost, KinematicsSpec } from '../../../core/behavior-runtime';
import { createBindContext } from '../../../core/behavior-runtime';
import { defineMaterialFlow, type MaterialFlowDefinition } from '../../../core/material-flow/define-material-flow';
import { createSelf, type MaterialFlowSelf, type MU } from '../../../core/material-flow/material-flow-self';
import type { MaterialFlowAdapter } from '../material-flow-adapter';
import { DESRunner } from '../des-runner';

export const ROBOT_LOADING_REFERENCE_DURATION_SECONDS = 8 * 60 * 60;
export const ROBOT_LOADING_REFERENCE_SEED = 297;

/**
 * Stage timings, in simulated seconds.
 *
 * The station is the intended bottleneck (5 s × 2,000 parts = 10,000 s), which
 * keeps the 8 h reference horizon comfortably drainable while still forcing
 * back-pressure all the way to the source.
 */
export const ROBOT_LOADING_TIMINGS = {
  sourceInterval: 4,
  sourceRetry: 1,
  robotCycle: 4,
  indexCycle: 3,
  stationProcess: 5,
  transportTravel: 6,
  bufferDwell: 2,
} as const;

const INDEXING_SLOTS = 5;
const FREE_FLOW_CAPACITY = 1_000_000;

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

interface SourceLocal { pending: MU | null }

/** Carrier composition is positional: pallets, then blisters, then parts. */
function carrierTypeAt(index: number, pallets: number, blisters: number): string {
  if (index < pallets) return 'pallet';
  return index < pallets + blisters ? 'blister' : 'part';
}

const DemoSource = defineMaterialFlow<MaterialFlowSelf<SourceLocal>>({
  type: 'RobotLoadingDemoSource', kind: 'source', schema: {}, continuous: {},
  state: () => ({ pending: null }),
  des: {
    onGenerate(self) {
      const pallets = Number(self.prop.palletCount ?? 0);
      const blisters = pallets * Number(self.prop.blistersPerPallet ?? 0);
      const parts = blisters * Number(self.prop.partsPerBlister ?? 0);
      const total = pallets + blisters + parts;
      if (self.prop.horizonArmed !== true) {
        self.prop.horizonArmed = true;
        self.prop.generatedPallets = pallets;
        // One model event on the horizon keeps the run's end observable even
        // when the layout drains early; it is never the only event in flight.
        self.at(Number(self.prop.durationSeconds ?? 0), 'Horizon');
      }
      const emitted = Number(self.prop.createdMUs ?? 0);
      if (emitted >= total) return;

      // Reuse the MU that could not be handed over, so a blocked robot does not
      // inflate the MU id sequence and break run-to-run reproducibility.
      const mu = self.local.pending ?? self.spawn();
      mu.carrierType = carrierTypeAt(emitted, pallets, blisters);
      if (!self.downstreamCanAccept(mu)) {
        self.local.pending = mu;
        self.in(ROBOT_LOADING_TIMINGS.sourceRetry, 'Generate');
        return;
      }
      self.local.pending = null;
      self.prop.createdMUs = emitted + 1;
      self.transfer(mu);
      if (emitted + 1 < total) self.in(ROBOT_LOADING_TIMINGS.sourceInterval, 'Generate');
    },
    onHorizon() { /* explicit end-of-horizon model event */ },
  },
});

/** MUs whose processing finished but whose hand-over found no free downstream. */
interface StageLocal { waiting: number[] }

/**
 * Route by carrier (parts continue down the line, empties leave at the buffer)
 * and hand over. Returns false when every downstream was full: the MU stays
 * held and must be retried on the next `onDownstreamReady`.
 */
function tryHandOver(self: MaterialFlowSelf<StageLocal>, mu: MU, routed: boolean): boolean {
  if (routed) {
    mu.prop ??= {};
    mu.prop.routeIndex = mu.carrierType === 'part' ? 0 : 1;
  }
  self.transfer(mu);
  return !self.mus.some((held) => held.id === mu.id);
}

/**
 * One staged server: accept, hold for `seconds`, then hand over.
 *
 * Blocked MUs are queued by id rather than re-scanning `self.mus`, because a
 * held MU may equally be one that is still inside its processing time — moving
 * that one early would silently erase the stage's cycle.
 */
function stagedDefinition(
  type: string,
  kind: 'station' | 'conveyor' | 'storage',
  capacity: number,
  seconds: number,
  routed = false,
): MaterialFlowDefinition {
  return defineMaterialFlow<MaterialFlowSelf<StageLocal>>({
    type, kind, schema: {}, capacity: () => capacity, continuous: {},
    state: () => ({ waiting: [] }),
    des: {
      onAccept(self, mu) {
        self.in(seconds, 'ProcessComplete', mu);
        return true;
      },
      onProcessComplete(self, mu) {
        if (mu && !tryHandOver(self, mu, routed)) self.local.waiting.push(mu.id);
      },
      onDownstreamReady(self) {
        const waiting = self.local.waiting;
        while (waiting.length > 0) {
          const held = self.mus.find((candidate) => candidate.id === waiting[0]);
          if (!held) { waiting.shift(); continue; }
          // Keep strict arrival order: if the head is still blocked, so is the
          // rest of the queue for this stage.
          if (!tryHandOver(self, held, routed)) break;
          waiting.shift();
        }
      },
    },
  }) as unknown as MaterialFlowDefinition;
}

/** Bound for topology coverage but intentionally not wired into the flow. */
const DemoIdle = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoIdle', kind: 'storage', schema: {}, continuous: {}, des: {},
});

const DemoRobot = stagedDefinition(
  'RobotLoadingDemoRobot', 'station', 1, ROBOT_LOADING_TIMINGS.robotCycle, true,
);
const DemoIndex = stagedDefinition(
  'RobotLoadingDemoIndex', 'conveyor', INDEXING_SLOTS, ROBOT_LOADING_TIMINGS.indexCycle,
);
const DemoStation = stagedDefinition(
  'RobotLoadingDemoStation', 'station', 1, ROBOT_LOADING_TIMINGS.stationProcess,
);
const DemoPath = stagedDefinition(
  'RobotLoadingDemoPath', 'conveyor', FREE_FLOW_CAPACITY, ROBOT_LOADING_TIMINGS.transportTravel,
);
const DemoBuffer = stagedDefinition(
  'RobotLoadingDemoBuffer', 'storage', FREE_FLOW_CAPACITY, ROBOT_LOADING_TIMINGS.bufferDwell,
);

const DemoPartSink = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoPartSink', kind: 'sink', schema: {}, continuous: {},
  des: { onAccept(self) { self.prop.throughput = Number(self.prop.throughput ?? 0) + 1; return true; } },
});
const DemoEmptySink = defineMaterialFlow<MaterialFlowSelf>({
  type: 'RobotLoadingDemoEmptySink', kind: 'sink', schema: {}, continuous: {},
  des: { onAccept(self) { self.prop.throughput = Number(self.prop.throughput ?? 0) + 1; return true; } },
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
      local: (def.state ?? def.local)?.() ?? {},
      scheduler: runner.makeScheduler(def, () => adapter.entityId),
      mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
      onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
      canAcceptDownstream: (mu) => adapter.nextComponents.some((target) => target.canAccept(mu as never)),
      spawnMU: () => runner.createMU(),
    });
    adapter = runner.addInstance(def, self, node);
    adapters.set(name, adapter);
    return adapter;
  };

  const source = bind('PalletInput-01', DemoSource as unknown as MaterialFlowDefinition);
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
