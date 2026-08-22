// SPDX-License-Identifier: AGPL-3.0-only

import type { RVViewerPlugin } from '../../core/rv-plugin';
import './material-flow/Station';
import './material-flow/Downtime';
import './material-flow/Processing';
import './material-flow/PalletSource';
import './material-flow/IndexingConveyor';
import './material-flow/RobotHandling';
import './material-flow/PathTransport';
import { defineMaterialFlow } from '../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf } from '../../core/material-flow/material-flow-self';

export const Storage = defineMaterialFlow<MaterialFlowSelf>({
  type: 'Storage', kind: 'storage', schema: { MaxCapacity: { type: 'number', default: 10 } },
  capacity: (self) => Number(self.prop.MaxCapacity ?? 10), continuous: {},
  des: { onAccept(self, mu) { self.transfer(mu); return true; } },
});

export class DESPlugin implements RVViewerPlugin {
  readonly id = 'des';
  readonly order = 250;
}

export default DESPlugin;
