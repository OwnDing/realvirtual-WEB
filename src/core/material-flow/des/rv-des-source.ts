// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import { ensureAction } from './rv-des-named-actions';
import type { DESMU } from './rv-des-mu';

const GENERATE = 'DES.Source.Generate';

function ensureSourceAction(): void {
  ensureAction(GENERATE, ({ manager, entityId }) => {
    const source = manager.getComponent(entityId ?? -1);
    if (source instanceof DESSource) source.generateOne();
  });
}

export class DESSource extends DESComponent {
  InterArrivalTime = 1;
  MaxEntities = Number.POSITIVE_INFINITY;
  generated = 0;
  onMUCreated?: (mu: DESMU) => void;
  AutomaticGeneration = true;

  constructor(node: Object3D) { super(node); this.MaxCapacity = 1; }

  reconfigureFromExtras(): void {
    const raw = this.node.userData.realvirtual?.DESSource as Record<string, unknown> | undefined;
    if (!raw) return;
    if (raw.InterArrivalTime !== undefined) {
      const value = Number(raw.InterArrivalTime);
      if (!Number.isFinite(value) || value <= 0) throw new Error('InterArrivalTime must be greater than zero');
      this.InterArrivalTime = value;
    }
    if (raw.MaxEntities !== undefined) {
      const value = Number(raw.MaxEntities);
      if (!Number.isFinite(value) || value < 0) throw new Error('MaxEntities must be non-negative');
      this.MaxEntities = value;
    }
    if (raw.AutomaticGeneration !== undefined) this.AutomaticGeneration = Boolean(raw.AutomaticGeneration);
  }

  override start(): void {
    if (!this.manager || !this.AutomaticGeneration || this.generated >= this.MaxEntities) return;
    ensureSourceAction();
    this.manager.scheduleIn(Math.max(0.001, this.InterArrivalTime), GENERATE, this.entityId);
  }

  generateOne(): void {
    if (!this.manager || this.generated >= this.MaxEntities || this.isFailure) return;
    if (this.currentLoad === 0) {
      const mu = this.manager.createMU();
      this.generated++;
      this.onMUCreated?.(mu);
      super.acceptMU(mu);
      this.releaseMU(mu);
    }
    if (this.generated < this.MaxEntities) {
      ensureSourceAction();
      this.manager.scheduleIn(Math.max(0.001, this.InterArrivalTime), GENERATE, this.entityId);
    }
  }

  override onDownstreamReady(from: DESComponent): void {
    super.onDownstreamReady(from);
  }

  override resetStatistics(): void { super.resetStatistics(); this.generated = 0; }
  override snapshotState(): unknown { return { ...(super.snapshotState() as object), generated: this.generated }; }
  override restoreState(raw: unknown, mus?: Map<number, DESMU>): void {
    super.restoreState(raw, mus);
    if (raw && typeof raw === 'object' && typeof (raw as { generated?: unknown }).generated === 'number') {
      this.generated = (raw as { generated: number }).generated;
    }
  }
}
