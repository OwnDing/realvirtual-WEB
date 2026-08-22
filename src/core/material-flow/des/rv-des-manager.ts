// SPDX-License-Identifier: AGPL-3.0-only

import { DESEventQueue } from './rv-des-event-queue';
import { CHECKPOINT_ACTION, type DESEvent } from './rv-des-event';
import { ACTION_BY_INDEX, ensureAction, getActionIndex, getActionName } from './rv-des-named-actions';
import { SFC32 } from './rv-des-distribution';
import type { DESComponent } from './rv-des-component';
import type { MuRef, ReservationRecord } from '../material-flow-self';
import { createDESMUAt, setDESMUCounter, snapshotMU, type DESMU, type DESMUSnapshot } from './rv-des-mu';

export enum DESMode {
  Animated = 'Animated',
  HybridSynced = 'HybridSynced',
  FastForward = 'FastForward',
  Step = 'Step',
}

export interface DESManagerSnapshot {
  version: number;
  currentTime: number;
  duration: number;
  processedEventCount: number;
  masterSeed: number;
  rngState: readonly number[];
  nextMuId: number;
  muGenerationCounters?: number[];
  events: Array<Omit<DESEvent, 'actionIndex'> & { action: string }>;
  mus: DESMUSnapshot[];
  componentStates: Array<{ path: string; state: unknown }>;
  [key: string]: unknown;
}

export interface LegacyDESManagerSnapshot {
  version?: 1 | 2 | 3;
  currentTime: number;
  duration?: number;
  processedEventCount?: number;
  totalEventsProcessed?: number;
  masterSeed: number;
  rngState: readonly number[];
  nextMuId?: number;
  muGenerationCounters?: number[];
  events?: Array<{
    id?: number;
    time: number;
    action: string;
    entityId?: number;
    componentPath?: string;
    muId: number;
    priority: number;
    data?: unknown;
  }>;
  mus?: DESMUSnapshot[];
  componentStates?: Array<{ path: string; state: unknown }>;
}

export interface DESManagerComponentLike {
  entityId: number;
  path: string;
  attachManager(manager: DESManager): void;
  resetStatistics(): void;
  snapshotState?(): unknown;
  restoreState?(state: unknown, mus?: Map<number, DESMU>): void;
}

export interface DESEventQueueEntry extends DESEvent {
  actionName: string;
  cancelled: false;
}

const CHECKPOINT_PRIORITY = -0x80000000;
const CHECKPOINT_ACTION_INDEX = ensureAction(CHECKPOINT_ACTION, () => {
  // Checkpoints are dispatched by DESManager and never through the model
  // action table. Keeping a stable registered index lets them share the heap.
});

export class DESManager {
  readonly queue = new DESEventQueue();
  readonly components: DESManagerComponentLike[] = [];
  readonly mus = new Map<number, DESMU>();

  currentTime = 0;
  duration = Number.POSITIVE_INFINITY;
  mode = DESMode.Animated;
  processedEventCount = 0;
  masterSeed = 42;
  maxEventsAtSameTime = 100_000;
  rng = new SFC32(this.masterSeed);
  statResetTime = 0;
  onTimeAdvance: ((time: number) => void) | null = null;
  onMURetired: ((mu: DESMU) => void) | null = null;
  onCheckpoint: ((time: number) => void) | null = null;
  private statResetApplied = false;
  private nextMuId = 0;
  private readonly freeMuIds: number[] = [];
  private readonly generationCounters = new Map<number, number>();
  private readonly pendingMuEventRefs = new Map<number, number>();
  private readonly deferredRetire = new Set<number>();
  private readonly reservations = new Map<number, ReservationRecord>();
  private nextReservationId = 1;
  private readonly resetListeners = new Set<() => void>();
  private readonly timeAdvanceListeners = new Set<(time: number) => void>();
  private completeNotified = false;
  private checkpointEventId: number | null = null;

  constructor(_initialEventCapacity = 256) {}

  get pendingEventCount(): number { return this.queue.count; }
  get nextEventTime(): number { return this.queue.peekTime; }
  get muCount(): number { return this.mus.size; }
  get totalEventsProcessed(): number { return this.processedEventCount; }
  get activeReservationCount(): number { return this.reservations.size; }
  get hasScheduledCheckpoint(): boolean { return this.checkpointEventId !== null; }
  get nextModelEventTime(): number {
    return this.queue.snapshot().find((event) => event.actionIndex !== CHECKPOINT_ACTION_INDEX)?.time
      ?? Number.POSITIVE_INFINITY;
  }
  get isComplete(): boolean {
    return this.currentTime >= this.duration || this.nextModelEventTime > this.duration;
  }
  onReset(listener: () => void): () => void { this.resetListeners.add(listener); return () => this.resetListeners.delete(listener); }
  onTimeAdvanced(listener: (time: number) => void): () => void {
    this.timeAdvanceListeners.add(listener);
    return () => this.timeAdvanceListeners.delete(listener);
  }
  markCompleteNotified(): boolean {
    if (this.completeNotified) return false;
    this.completeNotified = true;
    return true;
  }

  registerComponent<T extends DESManagerComponentLike>(component: T): T {
    if (this.components.includes(component)) return component;
    component.entityId = this.components.length;
    this.components.push(component);
    component.attachManager(this);
    return component;
  }

  getComponent(entityId: number): DESManagerComponentLike | undefined { return this.components[entityId]; }
  getComponentByPath(path: string): DESManagerComponentLike | undefined {
    return this.components.find((component) => component.path === path || component.path.endsWith(`/${path}`));
  }

  registerMU(mu: DESMU): void {
    const existing = this.mus.get(mu.id);
    if (existing && existing !== mu) throw new Error(`duplicate DES MU id: ${mu.id}`);
    this.mus.set(mu.id, mu);
    this.nextMuId = Math.max(this.nextMuId, mu.id + 1);
    this.generationCounters.set(mu.id, Math.max(this.generationCounters.get(mu.id) ?? 0, mu.generation));
    setDESMUCounter(this.nextMuId);
  }

  registerMUAt(mu: DESMU, id: number): void {
    this.mus.delete(mu.id);
    mu.id = id;
    this.registerMU(mu);
  }

  createMU(): DESMU {
    const id = this.freeMuIds.shift() ?? this.nextMuId++;
    const generation = this.generationCounters.get(id) ?? 0;
    const mu = createDESMUAt(id, generation, this.currentTime);
    this.registerMU(mu);
    return mu;
  }

  getMU(id: number): DESMU | null { return this.mus.get(id) ?? null; }
  getMUByRef(ref: MuRef | null | undefined): DESMU | null {
    if (!ref) return null;
    const mu = this.getMU(ref.id);
    return mu?.generation === ref.gen ? mu : null;
  }
  getMuGenerationCounters(): number[] {
    const result = Array.from({ length: this.nextMuId }, (_, id) => this.generationCounters.get(id) ?? 0);
    return result;
  }
  createReservation(record: Omit<ReservationRecord, 'id' | 'state'>): ReservationRecord {
    const created: ReservationRecord = { ...record, id: this.nextReservationId++, state: 'reserved' };
    this.reservations.set(created.id, created);
    return created;
  }
  getReservation(id: number): ReservationRecord | null { return this.reservations.get(id) ?? null; }
  listReservations(): ReservationRecord[] { return [...this.reservations.values()].map((record) => structuredClone(record)); }
  releaseReservation(id: number, state: 'committed' | 'rolledback'): ReservationRecord | null {
    const record = this.reservations.get(id);
    if (!record) return null;
    record.state = state;
    this.reservations.delete(id);
    return record;
  }
  reservedForTarget(path: string): number {
    let total = 0;
    for (const record of this.reservations.values()) if (record.targetId === path) total += record.n;
    return total;
  }
  reservedCarrierSlots(ref: MuRef): number {
    let total = 0;
    for (const record of this.reservations.values()) {
      if (record.carrier?.ref.id === ref.id && record.carrier.ref.gen === ref.gen) total += record.carrier.slots;
    }
    return total;
  }
  clearReservations(): void { this.reservations.clear(); }
  restoreReservations(records: readonly ReservationRecord[], nextId?: number): void {
    this.reservations.clear();
    for (const record of records) if (record.state === 'reserved') this.reservations.set(record.id, structuredClone(record));
    this.nextReservationId = Math.max(nextId ?? 1, ...[...this.reservations.keys()].map((id) => id + 1), 1);
  }
  getNextReservationId(): number { return this.nextReservationId; }
  retireMU(mu: DESMU): void {
    if (this.getMU(mu.id) !== mu) return;
    for (const ref of [...mu.childMUs]) {
      const child = this.getMUByRef(ref);
      if (child) this.retireMU(child);
    }
    mu.childMUs = [];
    mu.runtimeChildren = [];
    const parent = this.getMUByRef(mu.parentMU);
    if (parent) {
      parent.childMUs = parent.childMUs.filter((ref) => ref.id !== mu.id || ref.gen !== mu.generation);
      parent.runtimeChildren = (parent.runtimeChildren ?? []).filter((child) => child !== mu);
    }
    mu.parentMU = null; mu.loadedOn = null; mu.isLoaded = false;
    for (const record of [...this.reservations.values()]) {
      if (record.carrier?.ref.id === mu.id && record.carrier.ref.gen === mu.generation) {
        this.releaseReservation(record.id, 'rolledback');
      }
    }
    if ((this.pendingMuEventRefs.get(mu.id) ?? 0) > 0) {
      this.deferredRetire.add(mu.id);
      return;
    }
    this.finalizeRetire(mu);
  }

  random(): number { return this.rng.next(); }
  setMasterSeed(seed: number): void {
    if (!Number.isFinite(seed)) throw new Error('DES seed must be finite');
    this.masterSeed = seed >>> 0;
    this.rng = new SFC32(this.masterSeed);
    this.statResetApplied = false;
  }

  scheduleEvent(
    time: number,
    action: string,
    entityId: number,
    muId = -1,
    priority = 0,
    data?: unknown,
  ): number {
    if (time < this.currentTime) throw new Error(`cannot schedule DES event in the past: ${time} < ${this.currentTime}`);
    const id = this.queue.enqueue(time, getActionIndex(action), entityId, muId, priority, data);
    if (muId >= 0) this.pendingMuEventRefs.set(muId, (this.pendingMuEventRefs.get(muId) ?? 0) + 1);
    return id;
  }

  scheduleByIndex(time: number, actionIndex: number, entityId: number, muId = -1, priority = 0, data?: unknown): number {
    if (time < this.currentTime) throw new Error(`cannot schedule DES event in the past: ${time} < ${this.currentTime}`);
    const id = this.queue.enqueue(time, actionIndex, entityId, muId, priority, data);
    if (muId >= 0) this.pendingMuEventRefs.set(muId, (this.pendingMuEventRefs.get(muId) ?? 0) + 1);
    return id;
  }
  scheduleInByIndex(delay: number, actionIndex: number, entityId: number, muId = -1, priority = 0, data?: unknown): number {
    if (!Number.isFinite(delay) || delay < 0) throw new Error(`invalid DES delay: ${delay}`);
    return this.scheduleByIndex(this.currentTime + delay, actionIndex, entityId, muId, priority, data);
  }

  scheduleIn(delay: number, action: string, entityId: number, muId = -1, priority = 0, data?: unknown): number {
    if (!Number.isFinite(delay) || delay < 0) throw new Error(`invalid DES delay: ${delay}`);
    return this.scheduleEvent(this.currentTime + delay, action, entityId, muId, priority, data);
  }

  /** Schedule the single non-model checkpoint event. Re-planning replaces it. */
  scheduleCheckpoint(time: number): number {
    if (!Number.isFinite(time) || time <= this.currentTime) {
      throw new Error(`checkpoint time must be after current time: ${time} <= ${this.currentTime}`);
    }
    this.cancelCheckpoint();
    this.checkpointEventId = this.queue.enqueueSystem(time, CHECKPOINT_ACTION_INDEX, -1, -1, CHECKPOINT_PRIORITY);
    return this.checkpointEventId;
  }

  cancelCheckpoint(): boolean {
    if (this.checkpointEventId === null) return false;
    const id = this.checkpointEventId;
    this.checkpointEventId = null;
    return this.queue.cancel(id);
  }

  getEventQueueSnapshot(): DESEventQueueEntry[] {
    return this.queue.snapshot().map((event) => ({
      ...event,
      actionName: getActionName(event.actionIndex),
      cancelled: false,
    }));
  }

  cancelEvent(id: number): boolean {
    const event = this.queue.snapshot().find((candidate) => candidate.id === id);
    const cancelled = this.queue.cancel(id);
    if (cancelled && event && event.muId >= 0) this.releaseEventRef(event.muId);
    return cancelled;
  }

  processAnimated(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error(`invalid DES delta: ${deltaSeconds}`);
    const target = Math.min(this.duration, this.currentTime + deltaSeconds);
    return this.processUntil(target, Number.POSITIVE_INFINITY, true);
  }

  processUntilTime(target: number, maxEvents = Number.POSITIVE_INFINITY): number {
    if (!Number.isFinite(target) || target < this.currentTime) {
      throw new Error(`invalid DES target time: ${target}`);
    }
    return this.processUntil(Math.min(this.duration, target), maxEvents, false);
  }

  /** Advance an idle runner clock after all events through `target` were drained. */
  advanceClockTo(target: number): void {
    if (!Number.isFinite(target) || target < this.currentTime || this.nextEventTime <= target) {
      throw new Error(`cannot advance DES clock to ${target} while an earlier event is pending`);
    }
    this.currentTime = Math.min(target, this.duration);
  }

  processEvents(maxEvents = Number.POSITIVE_INFINITY): number {
    return this.processUntil(this.duration, maxEvents, false);
  }

  step(): boolean {
    const event = this.queue.dequeue();
    if (!event || event.time > this.duration) return false;
    if (event.actionIndex === CHECKPOINT_ACTION_INDEX) return this.dispatchCheckpoint(event);
    this.dispatch(event);
    return true;
  }

  reset(): void {
    for (const listener of this.resetListeners) listener();
    for (const mu of this.mus.values()) this.onMURetired?.(mu);
    this.queue.clear();
    this.currentTime = 0;
    this.processedEventCount = 0;
    this.mus.clear();
    this.freeMuIds.length = 0;
    this.generationCounters.clear();
    this.pendingMuEventRefs.clear();
    this.deferredRetire.clear();
    this.reservations.clear();
    this.nextReservationId = 1;
    this.nextMuId = 0;
    this.completeNotified = false;
    this.checkpointEventId = null;
    setDESMUCounter(0);
    this.rng = new SFC32(this.masterSeed);
    for (const component of this.components) component.resetStatistics();
  }

  clearMUs(): void {
    for (const mu of this.mus.values()) this.onMURetired?.(mu);
    this.queue.clear();
    this.mus.clear();
    this.freeMuIds.length = 0;
    this.generationCounters.clear();
    this.pendingMuEventRefs.clear();
    this.deferredRetire.clear();
    this.reservations.clear();
    this.nextReservationId = 1;
    this.nextMuId = 0;
    this.checkpointEventId = null;
    setDESMUCounter(0);
  }

  snapshot(): DESManagerSnapshot {
    return {
      version: 3,
      currentTime: this.currentTime,
      duration: this.duration,
      processedEventCount: this.processedEventCount,
      masterSeed: this.masterSeed,
      rngState: this.rng.getState(),
      nextMuId: this.nextMuId,
      muGenerationCounters: this.getMuGenerationCounters(),
      events: this.queue.snapshot()
        .filter((event) => event.actionIndex !== CHECKPOINT_ACTION_INDEX)
        .map(({ actionIndex, ...event }) => ({ ...event, action: getActionName(actionIndex) })),
      mus: [...this.mus.values()].map(snapshotMU),
      componentStates: this.components.map((component) => ({ path: component.path, state: component.snapshotState?.() ?? null })),
    };
  }

  restore(snapshot: DESManagerSnapshot | LegacyDESManagerSnapshot): void {
    if (!snapshot || (snapshot.version !== undefined
      && snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3)) {
      throw new Error(`unsupported DES snapshot version: ${String(snapshot?.version)}`);
    }
    this.currentTime = finiteOr(snapshot.currentTime, 0);
    this.duration = snapshot.duration === Number.POSITIVE_INFINITY ? snapshot.duration : finiteOr(snapshot.duration, Number.POSITIVE_INFINITY);
    this.processedEventCount = finiteOr(
      snapshot.processedEventCount ?? ('totalEventsProcessed' in snapshot ? snapshot.totalEventsProcessed : undefined),
      0,
    );
    this.masterSeed = finiteOr(snapshot.masterSeed, 42) >>> 0;
    this.rng = new SFC32(this.masterSeed);
    if (Array.isArray(snapshot.rngState)) this.rng.setState(snapshot.rngState);
    this.mus.clear();
    this.freeMuIds.length = 0;
    this.generationCounters.clear();
    this.pendingMuEventRefs.clear();
    this.deferredRetire.clear();
    for (const raw of snapshot.mus ?? []) {
      const mu = createDESMUFromSnapshot(raw, this.components as DESComponent[]);
      this.mus.set(mu.id, mu);
      this.generationCounters.set(mu.id, mu.generation);
    }
    for (const mu of this.mus.values()) {
      mu.childMUs = mu.childMUs.filter((ref) => this.getMUByRef(ref) !== null);
      mu.runtimeChildren = mu.childMUs.flatMap((ref) => this.getMUByRef(ref) ?? []);
    }
    for (let id = 0; id < (snapshot.muGenerationCounters?.length ?? 0); id++) {
      this.generationCounters.set(id, snapshot.muGenerationCounters![id] ?? 0);
    }
    this.nextMuId = Math.max(snapshot.nextMuId ?? 0, ...[...this.mus.keys()].map((id) => id + 1), 0);
    for (let id = 0; id < this.nextMuId; id++) if (!this.mus.has(id)) this.freeMuIds.push(id);
    setDESMUCounter(this.nextMuId);
    for (const entry of snapshot.componentStates ?? []) {
      const component = this.getComponentByPath(entry.path);
      if (!component) { console.warn(`[DES] snapshot component not found: ${entry.path}`); continue; }
      component.restoreState?.(entry.state, this.mus);
    }
    const restoredEvents: DESEvent[] = (snapshot.events ?? [])
      .filter(({ action }) => action !== CHECKPOINT_ACTION)
      .map((raw, index) => {
        const componentPath = 'componentPath' in raw ? raw.componentPath : undefined;
        return {
          id: raw.id ?? index,
          time: raw.time,
          entityId: raw.entityId
            ?? (componentPath ? this.getComponentByPath(componentPath)?.entityId : undefined)
            ?? -1,
          muId: raw.muId,
          priority: raw.priority,
          ...('data' in raw && raw.data !== undefined ? { data: raw.data } : {}),
          actionIndex: getActionIndex(raw.action),
        };
      });
    this.checkpointEventId = null;
    this.queue.restore(restoredEvents);
    for (const event of restoredEvents) {
      if (event.muId >= 0) this.pendingMuEventRefs.set(event.muId, (this.pendingMuEventRefs.get(event.muId) ?? 0) + 1);
    }
  }

  private processUntil(target: number, maxEvents: number, advanceToTarget: boolean): number {
    let processed = 0;
    let atTime = Number.NaN;
    let sameTime = 0;
    while (processed < maxEvents && this.queue.peekTime <= target) {
      const event = this.queue.dequeue();
      if (!event) break;
      if (event.time === atTime) sameTime++;
      else { atTime = event.time; sameTime = 1; }
      if (sameTime > this.maxEventsAtSameTime) throw new Error(`DES event storm at t=${event.time}`);
      if (event.actionIndex === CHECKPOINT_ACTION_INDEX) {
        this.dispatchCheckpoint(event);
        continue;
      }
      this.dispatch(event);
      processed++;
    }
    if (advanceToTarget && Number.isFinite(target) && this.currentTime < target) this.currentTime = target;
    return processed;
  }

  private dispatch(event: DESEvent): void {
    if (!this.statResetApplied && this.statResetTime > 0 && event.time >= this.statResetTime) {
      this.currentTime = this.statResetTime;
      for (const component of this.components) {
        component.resetStatistics();
        const candidate = component as DESComponent;
        candidate.statBaselineTime = this.statResetTime;
        candidate.processedBaseline = candidate.totalProcessed;
      }
      this.statResetApplied = true;
    }
    this.currentTime = event.time;
    this.onTimeAdvance?.(event.time);
    for (const listener of this.timeAdvanceListeners) listener(event.time);
    const action = ACTION_BY_INDEX[event.actionIndex];
    if (!action) throw new Error(`DES action index ${event.actionIndex} is not registered`);
    const component = this.components[event.entityId];
    try {
      action({
        simTime: event.time,
        componentPath: component?.path ?? '',
        muId: event.muId,
        data: event.data ?? null,
        manager: this,
        entityId: event.entityId,
      });
      this.processedEventCount++;
    } finally {
      if (event.muId >= 0) this.releaseEventRef(event.muId);
    }
  }

  private dispatchCheckpoint(event: DESEvent): boolean {
    if (event.id === this.checkpointEventId) this.checkpointEventId = null;
    // A system event must never be the only reason the simulation clock moves.
    // If no in-duration model event remains, the autosave chain ends here.
    if (this.nextModelEventTime > this.duration) return false;
    this.currentTime = event.time;
    this.onCheckpoint?.(event.time);
    return true;
  }

  private releaseEventRef(muId: number): void {
    const next = (this.pendingMuEventRefs.get(muId) ?? 1) - 1;
    if (next > 0) this.pendingMuEventRefs.set(muId, next);
    else {
      this.pendingMuEventRefs.delete(muId);
      if (this.deferredRetire.delete(muId)) {
        const mu = this.getMU(muId);
        if (mu) this.finalizeRetire(mu);
      }
    }
  }

  private finalizeRetire(mu: DESMU): void {
    this.onMURetired?.(mu);
    this.mus.delete(mu.id);
    const nextGeneration = mu.generation + 1;
    this.generationCounters.set(mu.id, nextGeneration);
    if (!this.freeMuIds.includes(mu.id)) {
      this.freeMuIds.push(mu.id);
      this.freeMuIds.sort((a, b) => a - b);
    }
  }
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function createDESMUFromSnapshot(raw: DESMUSnapshot, components: DESComponent[]): DESMU {
  const byPath = (path: string | null): DESComponent | null => path
    ? components.find((component) => component.path === path) ?? null
    : null;
  return {
    id: raw.id, generation: raw.generation ?? 0, customId: raw.customId, priority: raw.priority,
    visual: null, currentComponent: byPath(raw.currentComponentPath), nextComponent: byPath(raw.nextComponentPath),
    route: [...(raw.route ?? [])], routeStep: raw.routeStep ?? 0,
    entryTime: raw.entryTime ?? 0, plannedExitTime: raw.plannedExitTime ?? -1,
    creationTime: raw.creationTime ?? 0, totalTimeInSystem: raw.totalTimeInSystem ?? 0,
    isBlocked: !!raw.isBlocked, isInTransit: !!raw.isInTransit, isProcessing: !!raw.isProcessing,
    isLoaded: !!raw.isLoaded,
    loadedOn: raw.loadedOnId == null ? null : { id: raw.loadedOnId, gen: 0 },
    loadedOnNode: null,
    childMUs: (raw.childMUs ?? raw.childIds?.map((id) => ({ id, gen: 0 })) ?? []).map((ref) => ({ ...ref })),
    runtimeChildren: [],
    parentMU: raw.parentMU ?? (raw.loadedOnId == null ? null : { id: raw.loadedOnId, gen: 0 }),
    visualTemplateId: raw.visualTemplateId,
    carrierType: raw.carrierType, carrierCapacity: raw.carrierCapacity,
    prop: JSON.parse(JSON.stringify(raw.prop ?? {})) as DESMU['prop'],
    componentsVisited: raw.componentsVisited ?? 0, blockedCount: raw.blockedCount ?? 0,
    totalBlockedTime: raw.totalBlockedTime ?? 0, totalProcessingTime: raw.totalProcessingTime ?? 0,
    totalTransitTime: raw.totalTransitTime ?? 0,
  };
}
