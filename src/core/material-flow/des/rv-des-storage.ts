// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import type { DESMU } from './rv-des-mu';

export type StorageStrategy = 'FIFO' | 'LIFO' | 'Priority';

export class DESStorage extends DESComponent {
  Strategy: StorageStrategy = 'FIFO';
  constructor(node: Object3D) { super(node); this.MaxCapacity = 100; }

  override acceptMU(mu: DESMU): boolean {
    if (!super.acceptMU(mu)) return false;
    if (this.nextComponents.length > 0) this.releaseNext();
    return true;
  }

  retrieveMU(): DESMU | null {
    if (this.heldMUs.length === 0) return null;
    let index = 0;
    if (this.Strategy === 'LIFO') index = this.heldMUs.length - 1;
    else if (this.Strategy === 'Priority') {
      for (let i = 1; i < this.heldMUs.length; i++) {
        if (this.heldMUs[i].priority > this.heldMUs[index].priority) index = i;
      }
    }
    return this.heldMUs[index] ?? null;
  }

  releaseNext(): boolean {
    const mu = this.retrieveMU();
    return mu ? this.releaseMU(mu) : false;
  }

  override onDownstreamReady(from: DESComponent): void { super.onDownstreamReady(from); this.releaseNext(); }
}
