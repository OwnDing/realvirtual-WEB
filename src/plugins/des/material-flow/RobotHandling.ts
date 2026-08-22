// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf, MU } from '../../../core/material-flow/material-flow-self';
import type { NodeRegistry } from '../../../core/engine/rv-node-registry';
import type { RVRobotIK } from '../../../core/engine/rv-robot-ik';
import type { RVIKTarget } from '../../../core/engine/rv-ik-target';
import type { RVMovingUnit } from '../../../core/engine/rv-mu';
import {
  attachMuToTcp, buildAxesTween, detachMuFromTcp, snapToPose, type TcpAttachment,
} from '../../../behaviors/_shared/robot-ik-des';
import { claimAxes, releaseAxes } from '../../../core/engine/rv-axis-ownership';

interface CycleWindow { at0: number; at1: number; targetKey: TargetKey }
type TargetKey = 'home' | 'pick' | 'place' | 'approachPick' | 'approachPlace';
interface Local {
  waitingSince: number | null;
  cycleMUs: MU[];
  robot: RVRobotIK | null;
  targets: Partial<Record<TargetKey, RVIKTarget>>;
  axisOwner: object;
  attachments: Map<number, TcpAttachment>;
  warnedTimeOnly: boolean;
}
type Signals = { Busy: 'PLCOutputBool' };
type Self = MaterialFlowSelf<Local, Signals>;

interface CycleConfig {
  timePerCycle?: number;
  timePerPick?: number;
  moveTimeToPick?: number;
  moveTimePickToPlace?: number;
  moveTimeToHome?: number;
  moveTimeLoadedFactor?: number;
}

const num = (self: Self, key: string, fallback: number): number => Number(self.prop[key] ?? fallback);

/** Canonical robot-cycle duration; explicit motion fields override the legacy budget. */
export function cycleDuration(config: CycleConfig, count: number): number {
  const n = Math.max(0, Math.floor(count));
  const base = Number(config.timePerCycle ?? 1);
  const perPick = Number(config.timePerPick ?? 0);
  const hasMotion = [config.moveTimeToPick, config.moveTimePickToPlace, config.moveTimeToHome]
    .some((value) => typeof value === 'number' && Number.isFinite(value));
  if (!hasMotion) return Math.max(0, base + n * perPick);
  const toPick = finiteNonNegative(config.moveTimeToPick, base / 2);
  const pickToPlace = finiteNonNegative(config.moveTimePickToPlace, perPick);
  const toHome = finiteNonNegative(config.moveTimeToHome, base / 2);
  const loadedFactor = finiteNonNegative(config.moveTimeLoadedFactor, 1);
  return Math.max(0, toPick + n * pickToPlace * loadedFactor + toHome);
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Math.max(0, fallback);
}

function cycleConfig(self: Self): CycleConfig {
  const optional = (key: string): number | undefined => typeof self.prop[key] === 'number'
    ? Number(self.prop[key])
    : undefined;
  return {
    timePerCycle: num(self, 'timePerCycle', 1),
    timePerPick: num(self, 'timePerPick', 0),
    moveTimeToPick: optional('moveTimeToPick'),
    moveTimePickToPlace: optional('moveTimePickToPlace'),
    moveTimeToHome: optional('moveTimeToHome'),
    moveTimeLoadedFactor: optional('moveTimeLoadedFactor'),
  };
}

function makeWindows(mode: string, count: number): CycleWindow[] {
  const sequence: TargetKey[] = mode === 'load'
    ? ['place', 'place', ...Array.from({ length: Math.max(0, count - 1) }, () => ['place', 'place'] as TargetKey[]).flat(), 'pick', 'pick', 'home']
    : ['approachPick', ...Array.from({ length: count }, () => ['pick', 'approachPlace'] as TargetKey[]).flat(), 'place', 'home'];
  // Preserve the stable 3 + 2n phase budget for all modes.
  while (sequence.length < 3 + 2 * count) sequence.splice(sequence.length - 1, 0, mode === 'load' ? 'pick' : 'place');
  const total = Math.max(1, sequence.length);
  return sequence.slice(0, 3 + 2 * count).map((targetKey, index) => ({
    at0: index / total,
    at1: (index + 1) / total,
    targetKey,
  }));
}

function resolveIk(self: Self): void {
  const registry = (self.viewer as { registry?: NodeRegistry }).registry;
  if (!registry) { self.local.robot = null; self.local.targets = {}; return; }
  const robotPath = typeof self.prop.robotRef === 'string' ? self.prop.robotRef : '';
  self.local.robot = robotPath ? registry.getByPath<RVRobotIK>('RobotIK', robotPath) : null;
  const mapping: Record<TargetKey, string> = {
    home: 'waypointHome', pick: 'waypointPick', place: 'waypointPlace',
    approachPick: 'waypointApproachPick', approachPlace: 'waypointApproachPlace',
  };
  const targets: Partial<Record<TargetKey, RVIKTarget>> = {};
  for (const [key, field] of Object.entries(mapping) as Array<[TargetKey, string]>) {
    const path = self.prop[field];
    if (typeof path === 'string' && path) {
      const target = registry.getByPath<RVIKTarget>('IKTarget', path);
      if (target) targets[key] = target;
    }
  }
  self.local.targets = targets;
}

function reserveBest(self: Self, candidates: MU[], mode: string): { mus: MU[]; reservationId: number } | null {
  for (let count = candidates.length; count > 0; count--) {
    const selected = candidates.slice(0, count);
    try {
      const carrier = mode === 'load'
        ? { ref: { id: -1, gen: -1 }, slots: count }
        : undefined;
      const reservation = self.reserveDownstream(count, undefined, carrier);
      return { mus: selected, reservationId: reservation.record.id };
    } catch { /* try a smaller atomic batch */ }
  }
  return null;
}

function startCycle(self: Self, allowPartial = false): void {
  if (self.prop.cycle || self.prop.failurePending) return;
  const mode = String(self.prop.mode ?? 'transfer');
  const batchSize = Math.max(1, Math.floor(num(self, 'batchSize', 1)));
  let candidates: MU[] = [];
  const carrier = mode === 'unload' ? self.mus.find((mu) => (mu.runtimeChildren?.length ?? 0) >= 0) : undefined;
  if (mode === 'unload') {
    candidates = descendants(carrier)
      .filter((mu) => !self.prop.pickFilter || mu.carrierType === self.prop.pickFilter)
      .slice(-batchSize);
    if (candidates.length === 0 && carrier) {
      if (self.prop.removeEmptyCarriers === true) {
        carrier.prop ??= {};
        carrier.prop.routeIndex = 1;
        self.transfer(carrier);
        self.setState('Empty');
      } else {
        self.setState('Blocked');
        self.statState('Blocked');
      }
      return;
    }
  } else {
    candidates = self.mus.filter((mu) => !mu.parentMU).slice(0, batchSize);
  }
  if (candidates.length === 0) return;
  if (!allowPartial && candidates.length < batchSize) return;

  const reserved = reserveBest(self, candidates, mode);
  if (!reserved) { self.setState('Blocked'); return; }
  self.local.cycleMUs = reserved.mus;
  const duration = cycleDuration(cycleConfig(self), reserved.mus.length);
  const windows = makeWindows(mode, reserved.mus.length);
  self.prop.cycle = {
    reservationId: reserved.reservationId,
    n: reserved.mus.length,
    cycleStart: self.now,
    windows,
  } as never;
  self.prop.ffCommitted = false;
  self.sig.Busy.set(true);
  self.setState('Working');

  resolveIk(self);
  const robot = self.local.robot;
  let eventData: unknown;
  if (robot && Object.keys(self.local.targets).length > 0 && duration > 0) {
    const drives = robot.getAxisDrives();
    claimAxes(drives, self.local.axisOwner);
    const phases = windows.flatMap((window) => {
      const target = self.local.targets[window.targetKey];
      return target ? [{ at0: window.at0, at1: window.at1, targetAxisPos: target.AxisPos }] : [];
    });
    const home = self.local.targets.home;
    if (home && phases.length > 0) {
      eventData = buildAxesTween(robot, home.AxisPos, duration, {
        phases,
        anchorRef: String(self.prop.robotRef ?? ''),
        driveRefs: drives.map((drive) => registryPath(self, drive.node)),
      });
    }
    for (const mu of reserved.mus) {
      const visual = mu.visual as RVMovingUnit | null | undefined;
      const attachment = visual ? attachMuToTcp(robot, visual) : null;
      if (attachment) self.local.attachments.set(mu.id, attachment);
      else if (!self.local.warnedTimeOnly) {
        self.local.warnedTimeOnly = true;
        console.warn('[DES] RobotHandling MU visual unavailable; using time-only cycle');
      }
    }
  }
  self.in(duration, 'ProcessComplete', null, eventData);
}

function descendants(root: MU | undefined): MU[] {
  if (!root) return [];
  const result: MU[] = [];
  const visit = (mu: MU): void => {
    for (const child of mu.runtimeChildren ?? []) {
      result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function registryPath(self: Self, node: { name: string }): string {
  const registry = (self.viewer as { registry?: NodeRegistry }).registry;
  if (registry) {
    const found = registry.search(node.name).find((entry) => entry.node === node);
    if (found) return found.path;
  }
  return node.name;
}

function finishVisuals(self: Self): void {
  for (const mu of self.local.cycleMUs) {
    const attachment = self.local.attachments.get(mu.id);
    if (attachment) detachMuFromTcp(attachment, (mu as MU & { currentComponent?: { node?: unknown } }).currentComponent?.node as never);
  }
  self.local.attachments.clear();
}

function completeCycle(self: Self): void {
  const cycle = self.prop.cycle as unknown as { reservationId: number } | null;
  const reservation = cycle ? self.reservation(cycle.reservationId) : null;
  const committed = reservation?.commitMany(self.local.cycleMUs) ?? self.prop.ffCommitted === true;
  if (committed) finishVisuals(self);
  const mode = String(self.prop.mode ?? 'transfer');
  if (committed && mode === 'unload') {
    const emptyCarrier = self.mus.find((mu) => (mu.runtimeChildren?.length ?? 0) === 0 && mu.carrierType !== 'part');
    if (emptyCarrier && self.prop.removeEmptyCarriers === true) {
      emptyCarrier.prop ??= {};
      emptyCarrier.prop.routeIndex = 1;
      self.transfer(emptyCarrier);
    }
  }
  releaseAxes(self.local.axisOwner);
  self.local.cycleMUs = [];
  self.prop.cycle = null;
  self.prop.ffCommitted = false;
  self.local.waitingSince = null;
  self.sig.Busy.set(false);
  if (self.prop.failurePending) self.setState('Failure');
  else self.setState(self.currentLoad > 0 ? 'Blocked' : 'Empty');
  if (!self.prop.failurePending) startCycle(self);
}

export const RobotHandling = defineMaterialFlow<Self, Signals>({
  type: 'RobotHandling', kind: 'station',
  schema: {
    mode: { type: 'string', default: 'transfer' }, batchSize: { type: 'number', default: 1 },
    timePerPick: { type: 'number', default: 0 }, timePerCycle: { type: 'number', default: 1 },
    pickFilter: { type: 'string', default: 'part' }, removeEmptyCarriers: { type: 'boolean', default: false },
    maxWaitTime: { type: 'number', default: 0 },
    robotRef: { type: 'componentRef' }, waypointHome: { type: 'componentRef' },
    waypointPick: { type: 'componentRef' }, waypointPlace: { type: 'componentRef' },
    waypointApproachPick: { type: 'componentRef' }, waypointApproachPlace: { type: 'componentRef' },
    moveTimeToPick: { type: 'number' }, moveTimePickToPlace: { type: 'number' },
    moveTimeToHome: { type: 'number' }, moveTimeLoadedFactor: { type: 'number' },
  },
  signals: { Busy: 'PLCOutputBool' },
  capacity: (self) => Math.max(1, Math.floor(num(self, 'batchSize', 1))),
  state: () => ({
    waitingSince: null, cycleMUs: [], robot: null, targets: {}, axisOwner: {},
    attachments: new Map(), warnedTimeOnly: false,
  }),
  setup(self) {
    if (!['load', 'unload', 'transfer'].includes(String(self.prop.mode ?? 'transfer'))) throw new Error('mode must be load, unload, or transfer');
    if (!Number.isInteger(num(self, 'batchSize', 1)) || num(self, 'batchSize', 1) <= 0) throw new Error('batchSize must be a positive integer');
    self.prop.cycle = null;
    self.prop.failurePending = false;
    self.sig.Busy.set(false);
    resolveIk(self);
  },
  reset(self) {
    releaseAxes(self.local.axisOwner);
    for (const attachment of self.local.attachments.values()) detachMuFromTcp(attachment);
    self.local.attachments.clear();
    self.local.cycleMUs = [];
    self.local.waitingSince = null;
    self.prop.cycle = null;
    self.prop.failurePending = false;
    self.sig.Busy.set(false);
  },
  continuous: {},
  des: {
    onAccept(self) {
      if (self.local.waitingSince === null) self.local.waitingSince = self.now;
      startCycle(self);
      if (!self.prop.cycle && num(self, 'maxWaitTime', 0) > 0) self.in(num(self, 'maxWaitTime', 0), 'AutoRelease');
      return true;
    },
    onAutoRelease(self) { startCycle(self, true); },
    onDownstreamReady(self) { startCycle(self, true); },
    onProcessComplete(self) { completeCycle(self); },
    onRestore(self) {
      resolveIk(self);
      const cycle = self.prop.cycle as unknown as { n?: number } | null;
      if (!cycle) return;
      self.local.cycleMUs = self.mus.filter((mu) => !mu.parentMU).slice(0, cycle.n ?? 0);
      self.sig.Busy.set(true);
      const robot = self.local.robot;
      const approach = self.local.targets.approachPick;
      if (robot && approach) {
        claimAxes(robot.getAxisDrives(), self.local.axisOwner);
        snapToPose(robot, approach.AxisPos);
      }
    },
    onFastForwardExit(self) {
      const cycle = self.prop.cycle as unknown as { reservationId?: number } | null;
      if (!cycle) return;
      const reservation = cycle.reservationId === undefined ? null : self.reservation(cycle.reservationId);
      if (reservation && reservation.commitMany(self.local.cycleMUs)) self.prop.ffCommitted = true;
      finishVisuals(self);
      const robot = self.local.robot;
      const home = self.local.targets.home;
      if (robot && home) snapToPose(robot, home.AxisPos);
    },
  },
});

export default RobotHandling;
