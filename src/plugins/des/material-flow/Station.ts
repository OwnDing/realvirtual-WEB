// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import { readConfigNumber, type MaterialFlowSelf } from '../../../core/material-flow/material-flow-self';

interface StationLocal {
  processingTime: number;
}

export const Station = defineMaterialFlow<MaterialFlowSelf<StationLocal>>({
  type: 'Station',
  kind: 'station',
  schema: {
    ProcessingTime: { type: 'number', default: 5, scope: 'des' },
  },
  state: () => ({ processingTime: 5 }),
  setup(self) {
    self.local.processingTime = readConfigNumber(self, 'ProcessingTime', self.local.processingTime || 5);
  },
  continuous: {},
  des: {
    onAccept(self, mu) {
      self.in(Math.max(0, self.local.processingTime), 'ProcessComplete', mu);
      return true;
    },
    onProcessComplete(self, mu) {
      if (mu) self.transfer(mu);
    },
  },
});

export default Station;
