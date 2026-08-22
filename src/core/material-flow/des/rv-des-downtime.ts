// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { DESComponent } from './rv-des-component';
import { ensureAction } from './rv-des-named-actions';
import { erlang, exponential } from './rv-des-distribution';

const FAIL = 'DES.Downtime.Fail';
const REPAIR = 'DES.Downtime.Repair';

function ensureDowntimeActions(): void {
  ensureAction(FAIL, ({ manager, entityId }) => {
    const downtime = manager.getComponent(entityId ?? -1);
    if (downtime instanceof DESDowntime) downtime.fail();
  });
  ensureAction(REPAIR, ({ manager, entityId }) => {
    const downtime = manager.getComponent(entityId ?? -1);
    if (downtime instanceof DESDowntime) downtime.repair();
  });
}

export class DESDowntime extends DESComponent {
  MTBF = 3600;
  MTTR = 60;
  MTTRErlangK = 1;
  Enabled = true;
  TargetComponentPath = '';
  target: DESComponent | null = null;
  failureCount = 0;
  totalDowntimeSeconds = 0;
  private failureStart = 0;

  constructor(node: Object3D) { super(node); this.MaxCapacity = 0; }
  get availability(): number {
    const now = this.manager?.currentTime ?? 0;
    if (now <= 0) return 100;
    const open = this.target?.isFailure ? now - this.failureStart : 0;
    return Math.max(0, Math.min(100, (1 - (this.totalDowntimeSeconds + open) / now) * 100));
  }

  resolveTarget(): DESComponent | null {
    this.target = this.manager?.getComponentByPath(this.TargetComponentPath) as DESComponent | undefined ?? null;
    return this.target;
  }

  override start(): void {
    if (!this.Enabled || !this.manager) return;
    this.resolveTarget();
    ensureDowntimeActions();
    this.manager.scheduleIn(exponential(this.rng, this.MTBF), FAIL, this.entityId);
  }

  fail(): void {
    if (!this.Enabled || !this.manager) return;
    this.failureCount++;
    this.failureStart = this.manager.currentTime;
    this.target?.setFailure(true);
    ensureDowntimeActions();
    this.manager.scheduleIn(erlang(this.rng, this.MTTRErlangK, 1 / Math.max(0.001, this.MTTR)), REPAIR, this.entityId);
  }

  repair(): void {
    if (!this.manager) return;
    this.totalDowntimeSeconds += Math.max(0, this.manager.currentTime - this.failureStart);
    this.target?.setFailure(false);
    ensureDowntimeActions();
    this.manager.scheduleIn(exponential(this.rng, this.MTBF), FAIL, this.entityId);
  }
}
