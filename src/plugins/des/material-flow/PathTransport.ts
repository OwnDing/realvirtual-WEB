// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import { pathFromNode, type RVPath } from '../../../core/engine/rv-path';
import { getDefaultPathNetwork } from '../../../core/engine/rv-path-network';
import type { MaterialFlowSelf, MU } from '../../../core/material-flow/material-flow-self';

interface Local { path: RVPath | null }
type Self = MaterialFlowSelf<Local>;
const value = (self: Self, key: string, fallback: number): number => Number(self.prop[key] ?? fallback);

export const PathTransport = defineMaterialFlow<Self>({
  type: 'PathTransport', kind: 'conveyor',
  schema: { capacity: { type: 'number', default: 1 }, speed: { type: 'number', default: 1000 } },
  capacity: (self) => value(self, 'capacity', 1),
  state: () => ({ path: null }),
  setup(self) {
    const speed = value(self, 'speed', 1000), capacity = value(self, 'capacity', 1);
    if (!(speed > 0)) throw new Error('speed must be greater than zero');
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('capacity must be a positive integer');
    const paths: RVPath[] = [];
    self.root.traverse((node) => {
      const candidate = pathFromNode(node);
      if (candidate) paths.push(candidate);
    });
    const path = paths[0] ?? null;
    if (!path) throw new Error('PathTransport requires a Path child');
    self.local.path = path;
    getDefaultPathNetwork().register(path);
    self.prop.travelTime = path.length / (speed * 0.001);
  },
  continuous: {},
  des: {
    onAccept(self, mu) {
      const path = self.local.path;
      if (!path) return false;
      self.setState('Transporting');
      const duration = Number(self.prop.travelTime);
      self.in(duration, 'Arrival', mu, {
        tween: {
          kind: 'path', path, pathRef: path.id, target: mu.visual ?? null,
          fromS: 0, toS: path.length, muId: mu.id,
        },
      });
      return true;
    },
    onArrival(self, mu) {
      const processing = Number(self.prop.attachedProcessingTime ?? 0);
      if (processing > 0) { self.setState('Processing'); self.in(processing, 'ProcessComplete', mu); }
      else self.transfer(mu);
    },
    onProcessComplete(self, mu) { if (mu) self.transfer(mu); },
  },
});
export default PathTransport;
