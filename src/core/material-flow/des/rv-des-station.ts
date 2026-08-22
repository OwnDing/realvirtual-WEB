// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import { ensureAction } from './rv-des-named-actions';
import type { DESMU } from './rv-des-mu';

const COMPLETE = 'DES.Station.Complete';

function ensureStationAction(): void {
  ensureAction(COMPLETE, ({ manager, entityId, muId }) => {
    const station = manager.getComponent(entityId ?? -1);
    const mu = manager.getMU(muId);
    if (station instanceof DESStation && mu) station.complete(mu);
  });
}

export class DESStation extends DESComponent {
  ProcessingTime = 1;
  onGetProcessingTime?: (mu: DESMU) => number;
  onProcessingComplete?: (mu: DESMU) => void;

  constructor(node: Object3D) { super(node); this.MaxCapacity = 1; }

  override acceptMU(mu: DESMU): boolean {
    if (!super.acceptMU(mu) || !this.manager) return false;
    const override = this.onGetProcessingTime?.(mu);
    const duration = override === undefined || override < 0 ? this.ProcessingTime : override;
    if (duration === Number.POSITIVE_INFINITY) { mu.isProcessing = true; return true; }
    if (!Number.isFinite(duration) || duration < 0) throw new Error(`${this.path}: invalid processing time ${duration}`);
    if (duration === 0) {
      mu.isProcessing = false;
      if (this.nextComponents.length > 0) this.complete(mu);
      return true;
    }
    mu.isProcessing = true;
    mu.plannedExitTime = this.manager.currentTime + Math.max(0.001, duration);
    ensureStationAction();
    this.manager.scheduleEvent(mu.plannedExitTime, COMPLETE, this.entityId, mu.id);
    return true;
  }

  complete(mu: DESMU): void {
    if (!this.heldMUs.includes(mu)) return;
    mu.isProcessing = false;
    mu.totalProcessingTime += Math.max(0, (this.manager?.currentTime ?? 0) - mu.entryTime);
    this.onProcessingComplete?.(mu);
    this.releaseMU(mu);
  }

  releaseProcessing(): boolean {
    const mu = this.heldMUs.find((candidate) => candidate.isProcessing);
    if (!mu) return false;
    this.complete(mu);
    return true;
  }
}
