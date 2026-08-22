// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf } from '../../../core/material-flow/material-flow-self';

export const Processing = defineMaterialFlow<MaterialFlowSelf>({
  type: 'Processing', kind: 'station',
  schema: {
    targetComponentPath: { type: 'string', default: '' },
    processingTime: { type: 'number', default: 1 },
  },
  continuous: {}, des: {},
});
export default Processing;
