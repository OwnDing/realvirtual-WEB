// SPDX-License-Identifier: AGPL-3.0-only

import type { SignalStore } from '../../engine/rv-signal-store';
import type { DESComponent } from './rv-des-component';
import type { DESManager, DESManagerSnapshot } from './rv-des-manager';
import { snapshotMU, type DESMU, type DESMUSnapshot } from './rv-des-mu';
import type { ReservationRecord } from '../material-flow-self';

export interface ScriptStateSnapshot { rng: number; fsmState?: string; state?: unknown }
export interface ScriptSnapshotBinding {
  path: string;
  adapter: {
    captureScriptState(): ScriptStateSnapshot | null;
    restoreScriptState(saved: ScriptStateSnapshot): void;
  };
}

export interface DESComponentSnapshot {
  path: string;
  prop: Record<string, unknown>;
  state: unknown;
  currentLoad: number;
  totalProcessed: number;
  muIds: number[];
  rngState?: number[];
  statBaselineTime?: number;
  processedBaseline?: number;
  isFailure?: boolean;
  statistics?: ReturnType<DESComponent['getStatistics']>;
  [key: string]: unknown;
}

export interface DESSnapshot {
  version: number;
  simTime: number;
  duration?: number;
  totalEventsProcessed?: number;
  masterSeed: number;
  eventQueue: DESManagerSnapshot['events'];
  components: Record<string, DESComponentSnapshot>;
  mus: DESMUSnapshot[];
  rngStates: Record<string, number[]>;
  signals?: Record<string, boolean | number>;
  scriptStates?: Record<string, ScriptStateSnapshot>;
  statBaselineTime?: number;
  muGenerationCounters?: number[];
  reservations?: ReservationRecord[];
  nextReservationId?: number;
  tweens?: unknown;
  [key: string]: unknown;
}

export function createSnapshot(
  manager: DESManager,
  components: readonly DESComponent[],
  mus: readonly DESMU[],
  _drives: readonly unknown[] = [],
  _signalStore: SignalStore | null = null,
  scriptSources: Record<string, ScriptStateSnapshot> | readonly ScriptSnapshotBinding[] = {},
): DESSnapshot {
  const runtime = manager.snapshot();
  const componentMap: Record<string, DESComponentSnapshot> = {};
  const rngStates: Record<string, number[]> = { __manager__: [...manager.rng.getState()] };
  for (const component of components) {
    const raw = component.toSnapshot() as DESComponentSnapshot;
    componentMap[component.path] = raw;
    rngStates[component.path] = [...(raw.rngState ?? [0, 0, 0, 1])];
  }
  const sourceMUs = mus.length > 0 ? mus : [...manager.mus.values()];
  const unique = new Map(sourceMUs.map((mu) => [mu.id, mu]));
  const scriptStates: Record<string, ScriptStateSnapshot> = Array.isArray(scriptSources)
    ? Object.fromEntries(scriptSources.flatMap(({ path, adapter }) => {
      const state = adapter.captureScriptState();
      return state ? [[path, state] as const] : [];
    }))
    : JSON.parse(JSON.stringify(scriptSources)) as Record<string, ScriptStateSnapshot>;
  return {
    version: 3,
    simTime: runtime.currentTime,
    duration: runtime.duration,
    totalEventsProcessed: runtime.processedEventCount,
    masterSeed: runtime.masterSeed,
    eventQueue: runtime.events,
    components: componentMap,
    mus: [...unique.values()].map(snapshotMU),
    rngStates,
    signals: {},
    scriptStates,
    statBaselineTime: manager.statResetTime,
    muGenerationCounters: manager.getMuGenerationCounters(),
    reservations: manager.listReservations(),
    nextReservationId: manager.getNextReservationId(),
  };
}

export function restoreSnapshot(
  snapshot: DESSnapshot,
  manager: DESManager,
  components: readonly DESComponent[],
  mus: DESMU[],
  _drives: readonly unknown[] = [],
  _signalStore: SignalStore | null = null,
  _muFactory?: (snapshot: DESMUSnapshot) => DESMU,
  scriptSources: readonly ScriptSnapshotBinding[] = [],
): void {
  const migrated = migrateSnapshotToV3(snapshot);
  const componentStates: DESManagerSnapshot['componentStates'] = [];
  for (const [path, state] of Object.entries(migrated.components)) {
    if (!components.some((component) => component.path === path)) {
      console.warn(`[DES] Unknown component path in snapshot: ${path}`);
      continue;
    }
    componentStates.push({
      path,
      state: {
        ...state,
        prop: state.prop, state: state.state, totalProcessed: state.totalProcessed,
        heldMuIds: state.muIds, rngState: state.rngState, isFailure: state.isFailure,
        statBaselineTime: state.statBaselineTime ?? 0,
        processedBaseline: state.processedBaseline ?? 0,
        statistics: state.statistics,
      },
    });
  }
  manager.restore({
    version: 3,
    currentTime: migrated.simTime,
    duration: migrated.duration ?? Number.POSITIVE_INFINITY,
    processedEventCount: migrated.totalEventsProcessed ?? 0,
    masterSeed: migrated.masterSeed,
    rngState: migrated.rngStates.__manager__ ?? [0, 0, 0, 1],
    nextMuId: migrated.mus.reduce((highest, mu) => Math.max(highest, mu.id + 1), 0),
    muGenerationCounters: migrated.muGenerationCounters,
    events: migrated.eventQueue,
    mus: migrated.mus,
    componentStates,
  });
  manager.statResetTime = migrated.statBaselineTime ?? 0;
  manager.restoreReservations(migrated.reservations ?? [], migrated.nextReservationId);
  mus.splice(0, mus.length, ...manager.mus.values());
  const byPath = new Map(scriptSources.map((source) => [source.path, source.adapter]));
  for (const [path, state] of Object.entries(migrated.scriptStates ?? {})) {
    const adapter = byPath.get(path);
    if (!adapter) { console.warn(`[DES] Unknown script component path: ${path}`); continue; }
    adapter.restoreScriptState(state);
  }
}

/**
 * Fill in the defaults a v1/v2 snapshot may be missing, without mutating the
 * caller's object.
 *
 * This used to `JSON.parse(JSON.stringify(snapshot))` the whole thing, which
 * doubled peak memory during restore — the measured 5,000-component baseline is
 * already an 8.58 MiB snapshot. Only the two collections whose ENTRIES get
 * defaults applied need copying; the event queue, RNG states and script states
 * are read straight through, and `manager.restore()` rebuilds its own event and
 * MU objects from them anyway.
 */
export function migrateSnapshotToV3(snapshot: DESSnapshot): DESSnapshot {
  if (!snapshot || ![1, 2, 3].includes(snapshot.version)) {
    throw new Error(`unsupported DES snapshot version: ${String(snapshot?.version)}`);
  }
  const copy: DESSnapshot = { ...snapshot };
  copy.version = 3;
  copy.scriptStates ??= {};
  // JSON has no Infinity literal, so an unbounded run round-trips as null.
  copy.duration ??= Number.POSITIVE_INFINITY;
  copy.totalEventsProcessed ??= 0;
  copy.signals ??= {};
  copy.rngStates ??= { __manager__: [0, 0, 0, 1] };
  copy.eventQueue ??= [];
  copy.reservations ??= [];
  copy.nextReservationId ??= 1;
  copy.muGenerationCounters = [...(snapshot.muGenerationCounters ?? [])];
  copy.components = Object.fromEntries(
    Object.entries(snapshot.components ?? {}).map(([path, state]) => [path, {
      ...state,
      statBaselineTime: state.statBaselineTime ?? 0,
      processedBaseline: state.processedBaseline ?? 0,
      muIds: state.muIds ?? [],
      rngState: state.rngState ?? [0, 0, 0, 1],
      // Kept a copy: the restored component holds this object for diagnostics,
      // and it must not alias the caller's snapshot.
      ...(state.statistics ? { statistics: { ...state.statistics } } : {}),
    }]),
  );
  const mus = (snapshot.mus ?? []).map((mu) => ({
    ...mu,
    generation: mu.generation ?? 0,
    childMUs: mu.childMUs ?? (mu.childIds ?? []).map((id) => ({ id, gen: 0 })),
    parentMU: mu.parentMU ?? (mu.loadedOnId == null ? null : { id: mu.loadedOnId, gen: 0 }),
  }));
  copy.mus = mus;
  for (const mu of mus) copy.muGenerationCounters[mu.id] ??= mu.generation;
  return copy;
}
