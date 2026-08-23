// SPDX-License-Identifier: AGPL-3.0-only

import { Box3, Object3D, Vector3 } from 'three';
import type { ComponentContext } from '../../engine/rv-component-registry';
import { StateStatistics } from '../rv-state-statistics';
import type { DESManager } from './rv-des-manager';
import { muRef, type DESMU } from './rv-des-mu';
import { SFC32 } from './rv-des-distribution';

export type DESState = 'Empty' | 'Working' | 'Setup' | 'Blocked' | 'Failure' | string;

export interface AutoConnectConfig { enabled: boolean; maxDistance: number }

export interface DESComponentRuntimeSnapshot {
  path: string;
  prop: Record<string, unknown>;
  state: DESState;
  currentStateName: string;
  currentLoad: number;
  totalProcessed: number;
  muIds: number[];
  rngState: number[];
  statBaselineTime: number;
  processedBaseline: number;
  isFailure: boolean;
  statistics: ReturnType<DESComponent['getStatistics']>;
  [key: string]: unknown;
}

export class DESComponent {
  entityId = -1;
  readonly node: Object3D;
  readonly path: string;
  manager: DESManager | null = null;
  context: ComponentContext | null = null;
  nextComponents: DESComponent[] = [];
  previousComponents: DESComponent[] = [];
  heldMUs: DESMU[] = [];
  MaxCapacity = 1;
  totalProcessed = 0;
  statBaselineTime = 0;
  processedBaseline = 0;
  prop: Record<string, unknown> = {};
  state: DESState = 'Empty';
  isFailure = false;
  autoConnect: AutoConnectConfig = { enabled: true, maxDistance: 1 };
  onSelectNext?: (candidates: DESComponent[], mu: DESMU) => DESComponent | null;
  onCanAccept?: (mu: DESMU) => boolean;
  onMUAccepted?: (mu: DESMU) => void;
  onMUEnter?: (mu: DESMU) => void;
  onMUReleased?: (mu: DESMU) => void;
  readonly statistics: StateStatistics;
  protected rng = new SFC32(42);
  private restoredStatistics: ReturnType<DESComponent['getStatistics']> | null = null;
  private frozenEvents: Array<{
    action: string; remaining: number; muId: number; priority: number; data?: unknown;
  }> = [];
  /** Public adapters provide their own richer event/tween failure policy. */
  protected freezeEventsOnFailure = true;

  constructor(node: Object3D) {
    this.node = node;
    this.path = node.name || node.uuid;
    this.statistics = new StateStatistics(() => this.manager?.currentTime ?? 0, { initialState: 'Empty' });
  }

  get currentLoad(): number { return this.heldMUs.length; }
  set currentLoad(value: number) {
    if (value === this.heldMUs.length) return;
    if (value === 0) this.heldMUs.length = 0;
  }

  attachManager(manager: DESManager): void {
    this.manager = manager;
    this.reseedRandom();
  }

  /**
   * Re-derive this component's private stream from the manager's master seed.
   *
   * Called on attach AND whenever the seed changes. Seeding only on attach meant
   * every replication of an experiment reused the component streams of the very
   * first run, so a per-replication seed changed the manager stream while the
   * component streams stayed identical.
   */
  reseedRandom(): void {
    const seed = this.manager?.masterSeed ?? 0;
    this.rng = new SFC32((seed + Math.imul(this.entityId + 1, 0x9e3779b9)) >>> 0);
  }

  init(context: ComponentContext): void { this.context = context; }
  start(): void {}
  dispose(): void { this.heldMUs.length = 0; this.manager = null; this.context = null; }

  canAccept(mu: DESMU): boolean {
    return !this.isFailure && this.currentLoad < this.MaxCapacity && (this.onCanAccept?.(mu) ?? true);
  }

  acceptMU(mu: DESMU): boolean {
    if (!this.canAccept(mu)) return false;
    if (!this.manager) throw new Error(`${this.path}: DES component is not attached to a manager`);
    this.manager.registerMU(mu);
    if (mu.currentComponent && mu.currentComponent !== this) mu.currentComponent.removeHeld(mu);
    if (!this.heldMUs.includes(mu)) this.heldMUs.push(mu);
    mu.currentComponent = this;
    mu.nextComponent = null;
    mu.entryTime = this.manager.currentTime;
    mu.componentsVisited++;
    mu.isBlocked = false;
    this.setState('Working');
    this.onMUAccepted?.(mu);
    this.onMUEnter?.(mu);
    return true;
  }

  releaseMU(mu: DESMU): boolean {
    const candidates = this.nextComponents.filter((component) => component.canAccept(mu));
    const next = this.onSelectNext?.(candidates, mu) ?? candidates[0] ?? null;
    if (!next) {
      mu.isBlocked = true;
      mu.blockedCount++;
      this.setState('Blocked');
      return false;
    }
    const accepted = next.acceptMU(mu);
    if (!accepted) return false;
    this.totalProcessed++;
    this.statistics.output();
    this.onMUReleased?.(mu);
    this.notifyCapacityAvailable();
    if (this.heldMUs.length === 0) this.setState('Empty');
    return true;
  }

  onDownstreamReady(_from: DESComponent): void {
    for (const mu of [...this.heldMUs]) if (mu.isBlocked && this.releaseMU(mu)) break;
  }

  setFailure(failed: boolean): void {
    if (this.isFailure === failed) return;
    if (this.manager && this.freezeEventsOnFailure) {
      if (failed) {
        // Targeted query: snapshotting the WHOLE queue and cancelling each hit
        // one at a time made a single failure cost O(k · n log n).
        this.frozenEvents = this.manager.getEventQueueSnapshotForEntity(this.entityId)
          .map((event) => {
            this.manager!.cancelEvent(event.id);
            return {
              action: event.actionName,
              remaining: Math.max(0, event.time - this.manager!.currentTime),
              muId: event.muId,
              priority: event.priority,
              ...(event.data === undefined ? {} : { data: event.data }),
            };
          });
      } else {
        for (const event of this.frozenEvents) {
          this.manager.scheduleIn(event.remaining, event.action, this.entityId, event.muId, event.priority, event.data);
        }
        this.frozenEvents = [];
      }
    }
    this.isFailure = failed;
    this.setState(failed ? 'Failure' : this.currentLoad > 0 ? 'Working' : 'Empty');
    if (!failed) {
      for (const previous of this.previousComponents) previous.onDownstreamReady(this);
    }
  }

  setState(state: DESState): void { this.restoredStatistics = null; this.state = state; this.statistics.setState(state); }
  resetStatistics(): void { this.totalProcessed = 0; this.statistics.reset(); }
  random(): number { return this.rng.next(); }

  get inputPosition(): Vector3 {
    const box = new Box3().setFromObject(this.node);
    if (!box.isEmpty()) return new Vector3(box.min.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    return this.node.getWorldPosition(new Vector3()).add(new Vector3(-0.5, 0, 0));
  }
  get outputPosition(): Vector3 {
    const box = new Box3().setFromObject(this.node);
    if (!box.isEmpty()) return new Vector3(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    return this.node.getWorldPosition(new Vector3()).add(new Vector3(0.5, 0, 0));
  }

  snapshotState(): unknown {
    return {
      prop: JSON.parse(JSON.stringify(this.prop)), state: this.state, totalProcessed: this.totalProcessed,
      isFailure: this.isFailure, heldMuIds: this.heldMUs.map((mu) => mu.id), rngState: this.rng.getState(),
      statBaselineTime: this.statBaselineTime, processedBaseline: this.processedBaseline,
      frozenEvents: structuredClone(this.frozenEvents),
      statistics: this.getStatistics(),
    };
  }

  restoreState(raw: unknown, mus = new Map<number, DESMU>()): void {
    if (!raw || typeof raw !== 'object') return;
    const state = raw as Record<string, unknown>;
    this.prop = JSON.parse(JSON.stringify(state.prop ?? {})) as Record<string, unknown>;
    this.state = typeof state.state === 'string' ? state.state : 'Empty';
    this.totalProcessed = typeof state.totalProcessed === 'number' ? state.totalProcessed : 0;
    this.isFailure = state.isFailure === true;
    this.statBaselineTime = typeof state.statBaselineTime === 'number' ? state.statBaselineTime : 0;
    this.processedBaseline = typeof state.processedBaseline === 'number' ? state.processedBaseline : 0;
    this.frozenEvents = Array.isArray(state.frozenEvents)
      ? structuredClone(state.frozenEvents as typeof this.frozenEvents)
      : [];
    if (state.statistics && typeof state.statistics === 'object') {
      this.restoredStatistics = state.statistics as ReturnType<DESComponent['getStatistics']>;
    }
    this.heldMUs = Array.isArray(state.heldMuIds)
      ? state.heldMuIds.flatMap((id) => typeof id === 'number' ? mus.get(id) ?? [] : [])
      : [];
    if (Array.isArray(state.rngState)) this.rng.setState(state.rngState as number[]);
    for (const mu of this.heldMUs) mu.currentComponent = this;
  }

  protected removeHeld(mu: DESMU): void {
    const index = this.heldMUs.indexOf(mu);
    if (index >= 0) this.heldMUs.splice(index, 1);
  }

  protected notifyCapacityAvailable(): void {
    for (const previous of this.previousComponents) previous.onDownstreamReady(this);
  }

  getStatistics(): {
    utilization: number;
    workingPercent: number;
    setupPercent: number;
    blockedPercent: number;
    emptyPercent: number;
    failurePercent: number;
    outputPerHour: number;
    totalProcessed: number;
    currentState: string;
    states: ReturnType<StateStatistics['getSnapshot']>['states'];
  } {
    if (this.restoredStatistics) return { ...this.restoredStatistics };
    const snapshot = this.statistics.getSnapshot();
    const pct = (name: string): number => Object.entries(snapshot.states)
      .filter(([key]) => key.toLowerCase() === name.toLowerCase())
      .reduce((sum, [, value]) => sum + value.percent, 0);
    const elapsed = Math.max(0, (this.manager?.currentTime ?? 0) - this.statBaselineTime);
    const processed = Math.max(0, this.totalProcessed - this.processedBaseline);
    return {
      utilization: snapshot.utilization * 100,
      workingPercent: pct('Working'), setupPercent: pct('Setup'), blockedPercent: pct('Blocked'),
      emptyPercent: pct('Empty') + pct('Idle'), failurePercent: pct('Failure'),
      outputPerHour: elapsed > 0 ? processed / elapsed * 3600 : 0,
      totalProcessed: this.totalProcessed, currentState: this.state, states: snapshot.states,
    };
  }

  toSnapshot(): DESComponentRuntimeSnapshot {
    return {
      path: this.path, prop: { ...this.prop }, state: this.state, currentStateName: this.state,
      currentLoad: this.currentLoad, totalProcessed: this.totalProcessed,
      muIds: this.heldMUs.map((mu) => mu.id), rngState: [...this.rng.getState()],
      statBaselineTime: this.statBaselineTime, processedBaseline: this.processedBaseline,
      isFailure: this.isFailure,
      frozenEvents: structuredClone(this.frozenEvents),
      statistics: this.getStatistics(),
    };
  }
}

export function freeCarrierSlots(carrier: DESMU): number {
  const capacity = carrier.carrierCapacity
    ?? (typeof carrier.prop.capacity === 'number' ? carrier.prop.capacity : Number.POSITIVE_INFINITY);
  return Math.max(0, capacity - carrier.childMUs.length);
}

export function loadMUOnCarrier(
  carrier: DESMU,
  mu: DESMU,
  manager: DESManager,
  node: Object3D | null = null,
): boolean {
  if (mu === carrier || freeCarrierSlots(carrier) <= 0) return false;
  let cursor: DESMU | null = carrier;
  while (cursor) {
    if (cursor === mu) return false;
    cursor = manager.getMUByRef(cursor.parentMU);
  }
  const previous = manager.getMUByRef(mu.parentMU);
  if (previous) {
    previous.childMUs = previous.childMUs.filter((child) => child.id !== mu.id || child.gen !== mu.generation);
    previous.runtimeChildren = (previous.runtimeChildren ?? []).filter((child) => child !== mu);
  }
  mu.parentMU = muRef(carrier); mu.loadedOn = muRef(carrier); mu.loadedOnNode = node; mu.isLoaded = true;
  if (!carrier.childMUs.some((child) => child.id === mu.id && child.gen === mu.generation)) carrier.childMUs.push(muRef(mu));
  carrier.runtimeChildren ??= [];
  if (!carrier.runtimeChildren.includes(mu)) carrier.runtimeChildren.push(mu);
  return true;
}

export function topmostPickable(
  mu: DESMU,
  manager: DESManager,
  predicate: (candidate: DESMU) => boolean = () => true,
): DESMU | null {
  const seen = new Set<string>();
  const visit = (candidate: DESMU): DESMU | null => {
    const key = `${candidate.id}:${candidate.generation}`;
    if (seen.has(key)) { console.warn(`[DES] carrier hierarchy cycle at ${key}`); return null; }
    seen.add(key);
    for (let index = candidate.childMUs.length - 1; index >= 0; index--) {
      const ref = candidate.childMUs[index];
      const child = manager.getMUByRef(ref);
      if (!child || child === candidate) {
        console.warn(`[DES] stale or self carrier reference ${ref.id}:${ref.gen}`);
        continue;
      }
      const nested = visit(child);
      if (nested) return nested;
    }
    return predicate(candidate) ? candidate : null;
  };
  return visit(mu);
}
