// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import { ensureAction } from './rv-des-named-actions';
import type { DESMU } from './rv-des-mu';

const ARRIVAL = 'DES.Conveyor.Arrival';

function ensureConveyorAction(): void {
  ensureAction(ARRIVAL, ({ manager, entityId, muId }) => {
    const conveyor = manager.getComponent(entityId ?? -1);
    const mu = manager.getMU(muId);
    if (conveyor instanceof DESConveyor && mu) conveyor.arrive(mu);
  });
}

export class DESConveyor extends DESComponent {
  ConveyorLength = 1000;
  ConveyorSpeed = 1000;
  constructor(node: Object3D) { super(node); this.MaxCapacity = 1; }

  get transportTime(): number {
    if (!(this.ConveyorSpeed > 0) || !Number.isFinite(this.ConveyorSpeed)) return 0.001;
    return Math.max(0.001, this.ConveyorLength / this.ConveyorSpeed);
  }

  override acceptMU(mu: DESMU): boolean {
    if (!super.acceptMU(mu) || !this.manager) return false;
    mu.isInTransit = true;
    mu.plannedExitTime = this.manager.currentTime + this.transportTime;
    ensureConveyorAction();
    this.manager.scheduleEvent(mu.plannedExitTime, ARRIVAL, this.entityId, mu.id);
    return true;
  }

  arrive(mu: DESMU): void {
    if (!this.heldMUs.includes(mu)) return;
    mu.isInTransit = false;
    mu.totalTransitTime += this.transportTime;
    this.releaseMU(mu);
  }
}
