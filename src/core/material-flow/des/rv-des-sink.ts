// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import type { DESMU } from './rv-des-mu';

export class DESSink extends DESComponent {
  totalConsumed = 0;
  onMUDestroyed?: (mu: DESMU) => void;

  constructor(node: Object3D) { super(node); this.MaxCapacity = Number.POSITIVE_INFINITY; }
  override canAccept(mu: DESMU): boolean { return !this.isFailure && (this.onCanAccept?.(mu) ?? true); }
  override acceptMU(mu: DESMU): boolean {
    if (!this.canAccept(mu) || !this.manager) return false;
    const previous = mu.currentComponent;
    if (!super.acceptMU(mu)) return false;
    this.totalConsumed++;
    this.totalProcessed++;
    this.statistics.output();
    this.onMUDestroyed?.(mu);
    this.heldMUs = this.heldMUs.filter((held) => held !== mu);
    mu.currentComponent = null;
    mu.totalTimeInSystem = this.manager.currentTime - mu.creationTime;
    this.manager.retireMU(mu);
    previous?.onDownstreamReady(this);
    this.setState('Empty');
    return true;
  }
  override resetStatistics(): void { super.resetStatistics(); this.totalConsumed = 0; }
  override snapshotState(): unknown { return { ...(super.snapshotState() as object), totalConsumed: this.totalConsumed }; }
  override restoreState(raw: unknown, mus?: Map<number, DESMU>): void {
    super.restoreState(raw, mus);
    this.totalConsumed = raw && typeof raw === 'object' && typeof (raw as { totalConsumed?: unknown }).totalConsumed === 'number'
      ? (raw as { totalConsumed: number }).totalConsumed : 0;
  }
}
