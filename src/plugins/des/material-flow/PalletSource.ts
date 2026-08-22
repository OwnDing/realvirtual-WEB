// SPDX-License-Identifier: AGPL-3.0-only

import { defineMaterialFlow } from '../../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf, MU, MuRef } from '../../../core/material-flow/material-flow-self';

const numberProp = (self: MaterialFlowSelf, key: string, fallback: number): number => {
  const value = Number(self.prop[key] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`${key} must be finite`);
  return value;
};
const ref = (mu: MU): MuRef => ({ id: mu.id, gen: mu.generation ?? 0 });

export const PalletSource = defineMaterialFlow<MaterialFlowSelf>({
  type: 'PalletSource', kind: 'source',
  schema: {
    PalletTemplateRef: { type: 'string', default: '' }, BlisterTemplateRef: { type: 'string', default: '' },
    PartTemplateRef: { type: 'string', default: '' }, BlisterCount: { type: 'number', default: 1 },
    PartsPerBlister: { type: 'number', default: 1 }, CarrierCapacity: { type: 'number', default: 1 },
    GridRows: { type: 'number', default: 1 }, GridColumns: { type: 'number', default: 1 },
    GridPitch: { type: 'number', default: 100 },
  },
  continuous: {},
  des: {
    onGenerate(self) {
      const blisters = Math.max(0, Math.floor(numberProp(self, 'BlisterCount', 1)));
      const parts = Math.max(0, Math.floor(numberProp(self, 'PartsPerBlister', 1)));
      const columns = Math.max(1, Math.floor(numberProp(self, 'GridColumns', 1)));
      const pitch = numberProp(self, 'GridPitch', 100) * 0.001;
      const pallet = self.spawn(String(self.prop.PalletTemplateRef || '') || undefined);
      pallet.carrierType = 'pallet'; pallet.carrierCapacity = blisters;
      pallet.childMUs = []; pallet.runtimeChildren = [];
      for (let index = 0; index < blisters; index++) {
        const blister = self.spawn(String(self.prop.BlisterTemplateRef || '') || undefined);
        blister.carrierType = 'blister'; blister.carrierCapacity = numberProp(self, 'CarrierCapacity', parts);
        blister.childMUs = []; blister.runtimeChildren = []; blister.parentMU = ref(pallet);
        blister.prop ??= {};
        blister.prop.gridPosition = [(index % columns) * pitch, 0, Math.floor(index / columns) * pitch];
        pallet.childMUs.push(ref(blister));
        pallet.runtimeChildren!.push(blister);
        for (let partIndex = 0; partIndex < parts; partIndex++) {
          const part = self.spawn(String(self.prop.PartTemplateRef || '') || undefined);
          part.carrierType = 'part'; part.parentMU = ref(blister);
          blister.childMUs.push(ref(part));
          blister.runtimeChildren!.push(part);
        }
      }
      self.prop.generatedPallets = Number(self.prop.generatedPallets ?? 0) + 1;
      self.transfer(pallet);
    },
  },
});
export default PalletSource;
