// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf } from '../../../core/material-flow/material-flow-self';

export const Downtime = defineMaterialFlow<MaterialFlowSelf>({
  type: 'Downtime', kind: 'downtime',
  schema: {
    targetComponentPath: { type: 'string', default: '' },
    mtbf: { type: 'number', default: 0 },
    mttr: { type: 'number', default: 0 },
  },
  continuous: {}, des: {},
});
export default Downtime;
