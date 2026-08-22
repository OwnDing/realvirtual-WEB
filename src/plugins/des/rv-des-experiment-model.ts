// SPDX-License-Identifier: AGPL-3.0-only

import type { SimDesStatistics } from '../../core/material-flow/simulation-kernel';

export const SEED_STRIDE = 1000;
export const replicationSeed = (baseSeed: number, index: number): number => (baseSeed + index * SEED_STRIDE) >>> 0;

export interface ParamOverride {
  path: string;
  component: string;
  field: string;
  value: string | number | boolean | null;
}
export interface SnapshotMeta { simTime: number; label?: string; savedAt: number }
export interface RunResult {
  runId: string; status: 'completed' | 'aborted'; startedAt: number; endedAt: number;
  simTimeReached: number; reason: string; stats?: SimDesStatistics;
}
export interface ReplicationMeta extends Partial<RunResult> {
  index: number; masterSeed: number; snapshots: SnapshotMeta[];
}
export interface ExperimentMeta {
  version: number; model: string; experiment: string; baseSeed: number;
  endTime: number; statResetTime: number; createdAt: number; note?: string;
  projectId?: string; glbHash?: string;
  replicationCount: number; paramOverrides: ParamOverride[]; paramScript?: string; enabled: boolean;
  replications: ReplicationMeta[];
}

export function createExperimentMeta(
  input: Pick<ExperimentMeta, 'model' | 'experiment' | 'baseSeed'> & Partial<ExperimentMeta>,
): ExperimentMeta {
  return {
    version: input.version ?? 0,
    model: input.model, experiment: input.experiment, baseSeed: input.baseSeed >>> 0,
    endTime: input.endTime ?? 0, statResetTime: input.statResetTime ?? 0,
    createdAt: input.createdAt ?? Date.now(), replications: structuredClone(input.replications ?? []),
    replicationCount: Math.max(1, Math.floor(input.replicationCount ?? 1)),
    paramOverrides: validOverrides(input.paramOverrides), enabled: input.enabled ?? true,
    ...(input.paramScript === undefined ? {} : { paramScript: input.paramScript }),
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.glbHash === undefined ? {} : { glbHash: input.glbHash }),
  };
}

export function parseExperimentMeta(json: string): ExperimentMeta | null {
  try {
    const raw = JSON.parse(json) as Partial<ExperimentMeta>;
    if (!raw || typeof raw !== 'object' || typeof raw.model !== 'string' || typeof raw.experiment !== 'string') return null;
    return createExperimentMeta({
      ...raw,
      model: raw.model,
      experiment: raw.experiment,
      baseSeed: typeof raw.baseSeed === 'number' ? raw.baseSeed : 42,
      version: typeof raw.version === 'number' ? raw.version : 0,
      replications: Array.isArray(raw.replications) ? raw.replications : [],
    });
  } catch { return null; }
}

function validOverrides(value: unknown): ParamOverride[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<ParamOverride>;
    const scalar = item.value === null || ['string', 'number', 'boolean'].includes(typeof item.value);
    return typeof item.path === 'string' && typeof item.component === 'string' && typeof item.field === 'string' && scalar
      ? [{ path: item.path, component: item.component, field: item.field, value: item.value! }]
      : [];
  });
}
