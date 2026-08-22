// SPDX-License-Identifier: AGPL-3.0-only

import { Object3D, Vector3 } from 'three';
import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf, MU, MuRef } from '../../../core/material-flow/material-flow-self';

interface Local { indexing: boolean; pendingExit: MU | null }
type Signals = { FreeSlots: 'PLCOutputInt' };
type Self = MaterialFlowSelf<Local, Signals>;
const n = (self: Self, key: string, fallback: number): number => Number(self.prop[key] ?? fallback);
const slots = (self: Self): Array<MuRef | null> => self.prop.slots as unknown as Array<MuRef | null>;
const updateFree = (self: Self): void => {
  const free = slots(self).filter((slot) => slot === null).length;
  self.sig.FreeSlots.set(free);
  self.prop.isFree = free >= n(self, 'reportFreeAt', 1);
};
const slotPosition = (self: Self, index: number, carriers: Object3D[]): Vector3 => {
  const node = carriers[index];
  if (node) return node.getWorldPosition(new Vector3());
  const count = slots(self).length;
  return self.root.getWorldPosition(new Vector3()).add(new Vector3(
    (index - (count - 1) / 2) * n(self, 'pitch', 1000) * 0.001,
    0,
    0,
  ));
};
const scheduleIndex = (self: Self): void => {
  if (self.local.indexing || self.state === 'Dwell' || self.state === 'Processing' || !slots(self).some(Boolean)) return;
  self.local.indexing = true; self.setState('Indexing');
  const carriers = self.root.children.filter((child) => /^Carrier(?:-\d+)?$/.test(child.name));
  const tweens = slots(self).flatMap((ref, index) => {
    if (!ref || index + 1 >= slots(self).length) return [];
    const mu = self.mus.find((candidate) => candidate.id === ref.id && (candidate.generation ?? 0) === ref.gen);
    const visual = mu?.visual as { node?: { getWorldPosition(out: Vector3): Vector3 }; setPosition?(value: Vector3): void } | undefined;
    if (!mu) return [];
    const from = visual?.node?.getWorldPosition(new Vector3()) ?? slotPosition(self, index, carriers);
    const to = slotPosition(self, index + 1, carriers);
    return [{
      kind: 'position' as const,
      target: visual && typeof visual.setPosition === 'function' ? visual : null,
      from: from.toArray() as [number, number, number],
      to: to.toArray() as [number, number, number],
      muId: mu.id,
    }];
  });
  self.in(
    n(self, 'pitch', 1000) / n(self, 'speed', 1000),
    'IndexComplete',
    null,
    tweens.length > 0 ? { tweens } : undefined,
  );
};

export const IndexingConveyor = defineMaterialFlow<Self, Signals>({
  type: 'IndexingConveyor', kind: 'conveyor',
  schema: {
    slotCount: { type: 'number', default: 4 }, pitch: { type: 'number', default: 1000 },
    speed: { type: 'number', default: 1000 }, dwellTime: { type: 'number', default: 0 },
    reportFreeAt: { type: 'number', default: 1 },
  },
  signals: { FreeSlots: 'PLCOutputInt' },
  capacity: (self) => n(self, 'slotCount', 4),
  state: () => ({ indexing: false, pendingExit: null }),
  setup(self) {
    const count = n(self, 'slotCount', 4), speed = n(self, 'speed', 1000), threshold = n(self, 'reportFreeAt', 1);
    if (!Number.isInteger(count) || count <= 0) throw new Error('slotCount must be a positive integer');
    if (!(speed > 0)) throw new Error('speed must be greater than zero');
    if (!Number.isInteger(threshold) || threshold <= 0 || threshold > count) throw new Error('reportFreeAt must not exceed slotCount');
    self.prop.slots = Array.from({ length: count }, () => null);
    self.prop.completedCycles = 0; updateFree(self);
  },
  continuous: {},
  des: {
    samplesLiveGeometry: true,
    canAccept(self) { return slots(self).some((slot) => slot === null); },
    onAccept(self, mu) {
      const index = slots(self).findIndex((slot) => slot === null);
      if (index < 0) return false;
      slots(self)[index] = { id: mu.id, gen: mu.generation ?? 0 };
      const carriers = self.root.children.filter((child) => /^Carrier(?:-\d+)?$/.test(child.name));
      if (mu.visual && typeof (mu.visual as { setPosition?: unknown }).setPosition === 'function') {
        (mu.visual as { setPosition(v: Vector3): void }).setPosition(slotPosition(self, index, carriers));
      }
      updateFree(self); scheduleIndex(self); return true;
    },
    onIndexComplete(self) {
      const values = slots(self);
      const outgoing = values[values.length - 1];
      for (let index = values.length - 1; index > 0; index--) values[index] = values[index - 1];
      values[0] = null; self.local.indexing = false;
      self.local.pendingExit = outgoing ? self.mus.find((mu) => mu.id === outgoing.id && (mu.generation ?? 0) === outgoing.gen) ?? null : null;
      updateFree(self);
      const attached = Number(self.prop.attachedProcessingTime ?? 0);
      const dwell = Math.max(n(self, 'dwellTime', 0), attached);
      self.prop.effectiveDwellTime = dwell;
      if (dwell > 0) { self.setState(attached > 0 ? 'Processing' : 'Dwell'); self.in(dwell, 'DwellComplete'); }
      else {
        if (self.local.pendingExit) self.transfer(self.local.pendingExit);
        self.local.pendingExit = null; self.prop.completedCycles = Number(self.prop.completedCycles ?? 0) + 1;
        scheduleIndex(self);
      }
    },
    onDwellComplete(self) {
      if (self.local.pendingExit) self.transfer(self.local.pendingExit);
      self.local.pendingExit = null; self.prop.completedCycles = Number(self.prop.completedCycles ?? 0) + 1;
      self.setState('Working'); scheduleIndex(self);
    },
    onRestore(self) {
      self.local.indexing = self.state === 'Indexing';
      if (self.state === 'Dwell' || self.state === 'Processing') {
        const occupied = new Set(slots(self).flatMap((slot) => slot ? [slot.id] : []));
        self.local.pendingExit = self.mus.find((mu) => !occupied.has(mu.id)) ?? null;
      }
      updateFree(self);
    },
  },
});
export default IndexingConveyor;
