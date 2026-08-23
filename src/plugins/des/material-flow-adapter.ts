// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import type { MaterialFlowDefinition, DesBlock } from '../../core/material-flow/define-material-flow';
import type { MaterialFlowSelf, MU, Port, ReservationHandle, ReservationRecord } from '../../core/material-flow/material-flow-self';
import {
  DESComponent, freeCarrierSlots, loadMUOnCarrier, type DESComponentRuntimeSnapshot,
} from '../../core/material-flow/des/rv-des-component';
import type { DESMU } from '../../core/material-flow/des/rv-des-mu';
import type { FrozenDescriptor } from '../../core/material-flow/material-flow-self';

type Hook = keyof DesBlock;

export class MaterialFlowAdapter extends DESComponent {
  readonly def: MaterialFlowDefinition;
  readonly self: MaterialFlowSelf;
  onConsumed: ((mu: DESMU) => void) | null = null;
  onFailureChanged: ((adapter: MaterialFlowAdapter, failed: boolean) => void) | null = null;
  onBeforeDispatch: ((adapter: MaterialFlowAdapter, hook: string, mu: MU | null) => void) | null = null;
  onMaterialize: ((mu: DESMU) => void) | null = null;
  /**
   * Drop the owning runner's bookkeeping for a fired event. Named actions live
   * in a module-global table shared by every runner, so their handlers must
   * reach the runner through the dispatched component instead of capturing it.
   */
  onScheduledRecordConsumed: ((eventId: number) => void) | null = null;
  reservedLoad = 0;
  attachedProcessingTime = 0;
  frozen: FrozenDescriptor[] = [];

  constructor(def: MaterialFlowDefinition, self: MaterialFlowSelf, node: Object3D) {
    super(node);
    this.freezeEventsOnFailure = false;
    this.def = def;
    this.self = self;
    this.prop = self.prop as Record<string, unknown>;
  }

  override canAccept(mu: DESMU, port?: Port): boolean {
    if (this.isFailure || this.currentLoad + this.reservedLoad >= this.MaxCapacity) return false;
    return this.def.des?.canAccept?.(this.self, mu as unknown as MU, port) ?? true;
  }

  override acceptMU(mu: DESMU, port?: Port): boolean {
    if (!this.canAccept(mu, port) || !this.manager) return false;
    if (!mu.visual && mu.visualTemplateId) this.onMaterialize?.(mu);
    if (!super.acceptMU(mu)) return false;
    const accepted = this.def.des?.onAccept?.(this.self, mu as unknown as MU, port);
    if (accepted === false) {
      this.heldMUs = this.heldMUs.filter((held) => held !== mu);
      mu.currentComponent = null;
      mu.retired = true;
      return false;
    }
    if (this.def.kind === 'sink') {
      this.totalProcessed++;
      this.statistics.output();
      this.heldMUs = this.heldMUs.filter((held) => held !== mu);
      mu.currentComponent = null;
      this.onConsumed?.(mu);
      this.setState('Empty');
      this.notifyUpstream();
    }
    return true;
  }

  override releaseMU(mu: DESMU): boolean {
    const released = super.releaseMU(mu);
    return released;
  }

  override onDownstreamReady(from: DESComponent): void {
    const hook = this.def.des?.onDownstreamReady;
    if (hook) hook(this.self, from);
    else super.onDownstreamReady(from);
  }

  dispatchHook(hook: string, mu?: MU | null, data?: unknown, _eventId?: number): void {
    this.onBeforeDispatch?.(this, hook, mu ?? null);
    const key = `on${hook}` as Hook;
    const fn = this.def.des?.[key];
    if (typeof fn !== 'function') return;
    (fn as (self: MaterialFlowSelf, mu?: MU | null, data?: unknown) => unknown)(this.self, mu, data);
  }

  reconfigureCapacity(capacity: number): void {
    if (!Number.isFinite(capacity) || capacity < this.currentLoad + this.reservedLoad) {
      throw new Error('capacity cannot be below currentLoad + reservations');
    }
    this.MaxCapacity = Math.floor(capacity);
  }

  reserveDownstream(n: number, port?: Port, carrier?: ReservationRecord['carrier']): ReservationHandle {
    if (!this.manager || !Number.isInteger(n) || n <= 0) throw new Error('reservation count must be a positive integer');
    const explicit = port?.partnerComponent;
    const target = explicit instanceof MaterialFlowAdapter ? explicit : this.nextComponents[0];
    if (!(target instanceof MaterialFlowAdapter)) throw new Error('no downstream target available');
    if (target.isFailure) throw new Error('downstream target is failed');
    const available = target.MaxCapacity - target.currentLoad - target.reservedLoad;
    if (available < n) throw new Error('downstream capacity unavailable');
    let resolvedCarrier = carrier;
    if (carrier && carrier.ref.id < 0) {
      const targetCarrier = target.heldMUs.find((mu) => freeCarrierSlots(mu) > this.manager!.reservedCarrierSlots({ id: mu.id, gen: mu.generation }));
      if (!targetCarrier) throw new Error('carrier capacity unavailable');
      resolvedCarrier = {
        ref: { id: targetCarrier.id, gen: targetCarrier.generation },
        slots: carrier.slots,
      };
    }
    if (resolvedCarrier) {
      const targetCarrier = this.manager.getMUByRef(resolvedCarrier.ref);
      const availableSlots = targetCarrier
        ? freeCarrierSlots(targetCarrier) - this.manager.reservedCarrierSlots(resolvedCarrier.ref)
        : 0;
      if (availableSlots < resolvedCarrier.slots || resolvedCarrier.slots < n) throw new Error('carrier capacity unavailable');
    }
    const record = this.manager.createReservation({
      holderId: this.path,
      targetId: target.path,
      ...(port ? { port: port.id } : {}),
      n,
      ...(resolvedCarrier ? { carrier: { ref: { ...resolvedCarrier.ref }, slots: resolvedCarrier.slots } } : {}),
    });
    target.reservedLoad += n;
    return this.handleFor(record);
  }

  reservation(id: number): ReservationHandle | null {
    const record = this.manager?.getReservation(id);
    return record ? this.handleFor(record) : null;
  }

  override setFailure(failed: boolean): void {
    if (failed === this.isFailure) return;
    if (failed && this.manager) {
      for (const record of this.manager.listReservations()) {
        if (record.targetId !== this.path) continue;
        this.manager.releaseReservation(record.id, 'rolledback');
        this.reservedLoad = Math.max(0, this.reservedLoad - record.n);
        const holder = this.manager.getComponentByPath(record.holderId);
        if (holder instanceof MaterialFlowAdapter) holder.onDownstreamReady(this);
      }
    }
    this.onFailureChanged?.(this, failed);
    this.self.prop.failurePending = failed;
    super.setFailure(failed);
  }

  override snapshotState(): unknown {
    return {
      ...(super.snapshotState() as Record<string, unknown>),
      reservedLoad: this.reservedLoad,
      attachedProcessingTime: this.attachedProcessingTime,
      frozen: structuredClone(this.frozen),
      selfState: this.self.state,
    };
  }

  override toSnapshot(): DESComponentRuntimeSnapshot {
    const snapshot = super.toSnapshot();
    snapshot.prop = JSON.parse(JSON.stringify(this.prop));
    snapshot.reservedLoad = this.reservedLoad;
    snapshot.attachedProcessingTime = this.attachedProcessingTime;
    snapshot.frozen = structuredClone(this.frozen);
    snapshot.selfState = this.self.state;
    return snapshot;
  }

  override restoreState(raw: unknown, mus = new Map<number, DESMU>()): void {
    const propIdentity = this.self.prop;
    super.restoreState(raw, mus);
    for (const key of Object.keys(propIdentity)) delete propIdentity[key];
    Object.assign(propIdentity, this.prop);
    this.prop = propIdentity as Record<string, unknown>;
    this.reservedLoad = raw && typeof raw === 'object' && typeof (raw as { reservedLoad?: unknown }).reservedLoad === 'number'
      ? (raw as { reservedLoad: number }).reservedLoad
      : 0;
    this.attachedProcessingTime = raw && typeof raw === 'object'
      && typeof (raw as { attachedProcessingTime?: unknown }).attachedProcessingTime === 'number'
      ? (raw as { attachedProcessingTime: number }).attachedProcessingTime
      : Number(this.self.prop.attachedProcessingTime ?? 0);
    this.frozen = raw && typeof raw === 'object' && Array.isArray((raw as { frozen?: unknown }).frozen)
      ? structuredClone((raw as { frozen: FrozenDescriptor[] }).frozen)
      : [];
    if (raw && typeof raw === 'object' && typeof (raw as { selfState?: unknown }).selfState === 'string') {
      this.self.setState((raw as { selfState: string }).selfState);
    }
  }

  downstreamFreeCapacity(_port?: Port): number {
    const explicit = _port?.partnerComponent;
    const candidates = explicit instanceof MaterialFlowAdapter ? [explicit] : this.nextComponents;
    return candidates.reduce((best, component) => Math.max(
      best,
      component.MaxCapacity - component.currentLoad
        - (component instanceof MaterialFlowAdapter ? component.reservedLoad : 0),
    ), 0);
  }

  notifyUpstream(): void {
    for (const upstream of this.previousComponents) upstream.onDownstreamReady(this);
  }

  hasDesHooks(): boolean { return !!this.def.des; }

  private handleFor(record: ReservationRecord): ReservationHandle {
    return {
      record,
      commitMany: (mus) => this.commitReservation(record.id, mus),
      rollback: () => { this.rollbackReservation(record.id); },
    };
  }

  private commitReservation(id: number, sourceMUs: readonly MU[]): boolean {
    if (!this.manager) return false;
    const record = this.manager.getReservation(id);
    if (!record || record.state !== 'reserved' || sourceMUs.length !== record.n) return false;
    const target = this.manager.getComponentByPath(record.targetId);
    const holder = this.manager.getComponentByPath(record.holderId);
    if (!(target instanceof MaterialFlowAdapter) || !(holder instanceof MaterialFlowAdapter) || target.isFailure) {
      this.rollbackReservation(id);
      return false;
    }
    // `sourceMUs` is often the live `self.mus` projection. Copy it before
    // accepts remove entries from the holder, otherwise array iteration skips
    // every second MU in an atomic batch.
    const mus = [...sourceMUs] as unknown as DESMU[];
    const ownedByHolder = (mu: DESMU): boolean => {
      let current: DESMU | null = mu;
      while (current) {
        if (holder.heldMUs.includes(current)) return true;
        current = this.manager!.getMUByRef(current.parentMU);
      }
      return false;
    };
    if (mus.some((mu) => !ownedByHolder(mu))) return false;
    target.reservedLoad = Math.max(0, target.reservedLoad - record.n);
    const accepted: DESMU[] = [];
    const syntheticPort = record.port ? { id: record.port } as Port : undefined;
    for (const mu of mus) {
      if (!record.carrier) detachFromCarrier(mu, this.manager);
      if (!target.acceptMU(mu, syntheticPort)) {
        for (const moved of mus) {
          target.heldMUs = target.heldMUs.filter((candidate) => candidate !== moved);
          if (!holder.heldMUs.includes(moved)) holder.heldMUs.push(moved);
          moved.currentComponent = holder;
        }
        this.manager.releaseReservation(id, 'rolledback');
        return false;
      }
      accepted.push(mu);
    }
    if (record.carrier) {
      const carrier = this.manager.getMUByRef(record.carrier.ref);
      if (!carrier || accepted.some((mu) => !loadMUOnCarrier(carrier, mu, this.manager!))) {
        for (const moved of accepted) {
          target.heldMUs = target.heldMUs.filter((candidate) => candidate !== moved);
          if (!holder.heldMUs.includes(moved)) holder.heldMUs.push(moved);
          moved.currentComponent = holder;
        }
        this.manager.releaseReservation(id, 'rolledback');
        return false;
      }
    }
    this.manager.releaseReservation(id, 'committed');
    return true;
  }

  private rollbackReservation(id: number): void {
    if (!this.manager) return;
    const record = this.manager.releaseReservation(id, 'rolledback');
    if (!record) return;
    const target = this.manager.getComponentByPath(record.targetId);
    if (target instanceof MaterialFlowAdapter) target.reservedLoad = Math.max(0, target.reservedLoad - record.n);
  }
}

function detachFromCarrier(mu: DESMU, manager: NonNullable<DESComponent['manager']>): void {
  const parent = manager.getMUByRef(mu.parentMU);
  if (parent) {
    parent.childMUs = parent.childMUs.filter((ref) => ref.id !== mu.id || ref.gen !== mu.generation);
    parent.runtimeChildren = (parent.runtimeChildren ?? []).filter((child) => child !== mu);
  }
  mu.parentMU = null;
  mu.loadedOn = null;
  mu.loadedOnNode = null;
  mu.isLoaded = false;
}
