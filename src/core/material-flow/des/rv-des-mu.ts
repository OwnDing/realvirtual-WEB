// SPDX-License-Identifier: AGPL-3.0-only

import type { JsonValue, MuRef } from '../material-flow-self';
import type { RVMovingUnit } from '../../engine/rv-mu';
import type { DESComponent } from './rv-des-component';

export interface DESMU {
  id: number;
  generation: number;
  customId: string;
  priority: number;
  visual: RVMovingUnit | null;
  visualTemplateId?: string;
  currentComponent: DESComponent | null;
  nextComponent: DESComponent | null;
  route: string[];
  routeStep: number;
  entryTime: number;
  plannedExitTime: number;
  creationTime: number;
  totalTimeInSystem: number;
  isBlocked: boolean;
  isInTransit: boolean;
  isProcessing: boolean;
  isLoaded: boolean;
  loadedOn: MuRef | null;
  loadedOnNode: unknown | null;
  childMUs: MuRef[];
  /** Runtime-only convenience links. Older callers may omit them. */
  runtimeChildren?: DESMU[];
  parentMU: MuRef | null;
  carrierType?: string;
  carrierCapacity?: number;
  prop: Record<string, JsonValue>;
  componentsVisited: number;
  blockedCount: number;
  totalBlockedTime: number;
  totalProcessingTime: number;
  totalTransitTime: number;
  [key: string]: unknown;
}

export interface DESMUSnapshot {
  id: number;
  generation?: number;
  customId: string;
  priority: number;
  visualTemplateId?: string;
  currentComponentPath: string | null;
  nextComponentPath: string | null;
  route: string[];
  routeStep: number;
  entryTime: number;
  plannedExitTime: number;
  creationTime: number;
  totalTimeInSystem: number;
  isBlocked: boolean;
  isInTransit: boolean;
  isProcessing: boolean;
  isLoaded?: boolean;
  loadedOnId?: number | null;
  childIds?: number[];
  childMUs?: MuRef[];
  parentMU?: MuRef | null;
  carrierType?: string;
  carrierCapacity?: number;
  prop: Record<string, JsonValue>;
  componentsVisited: number;
  blockedCount: number;
  totalBlockedTime: number;
  totalProcessingTime: number;
  totalTransitTime: number;
}

let nextMuId = 0;

export function resetDESMUCounter(value = 0): void { nextMuId = value; }
export function setDESMUCounter(value: number): void { nextMuId = Math.max(0, Math.floor(value)); }
export function getDESMUCounter(): number { return nextMuId; }

export function createDESMU(now = 0): DESMU {
  return createDESMUAt(nextMuId++, 0, now);
}

export function createDESMUAt(id: number, generation: number, now = 0): DESMU {
  return {
    id, generation, customId: `MU-${id}`, priority: 0, visual: null,
    currentComponent: null, nextComponent: null, route: [], routeStep: 0,
    entryTime: now, plannedExitTime: -1, creationTime: now, totalTimeInSystem: 0,
    isBlocked: false, isInTransit: false, isProcessing: false,
    isLoaded: false, loadedOn: null, loadedOnNode: null, childMUs: [], runtimeChildren: [], parentMU: null,
    prop: {}, componentsVisited: 0, blockedCount: 0,
    totalBlockedTime: 0, totalProcessingTime: 0, totalTransitTime: 0,
  };
}

export function muRef(mu: Pick<DESMU, 'id' | 'generation'>): MuRef {
  return { id: mu.id, gen: mu.generation };
}

export function snapshotMU(mu: DESMU): DESMUSnapshot {
  return {
    id: mu.id, generation: mu.generation, customId: mu.customId, priority: mu.priority,
    visualTemplateId: mu.visualTemplateId,
    currentComponentPath: mu.currentComponent?.path ?? null,
    nextComponentPath: mu.nextComponent?.path ?? null,
    route: [...mu.route], routeStep: mu.routeStep,
    entryTime: mu.entryTime, plannedExitTime: mu.plannedExitTime,
    creationTime: mu.creationTime, totalTimeInSystem: mu.totalTimeInSystem,
    isBlocked: mu.isBlocked, isInTransit: mu.isInTransit, isProcessing: mu.isProcessing,
    isLoaded: mu.isLoaded, loadedOnId: mu.loadedOn?.id ?? null,
    childIds: mu.childMUs.map((child) => child.id), childMUs: mu.childMUs.map((child) => ({ ...child })),
    parentMU: mu.parentMU ? { ...mu.parentMU } : null,
    carrierType: mu.carrierType, carrierCapacity: mu.carrierCapacity,
    prop: structuredCloneSafe(mu.prop),
    componentsVisited: mu.componentsVisited, blockedCount: mu.blockedCount,
    totalBlockedTime: mu.totalBlockedTime, totalProcessingTime: mu.totalProcessingTime,
    totalTransitTime: mu.totalTransitTime,
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
