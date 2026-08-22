// SPDX-License-Identifier: AGPL-3.0-only

import { SEED_STRIDE, type ParamOverride } from './rv-des-experiment-model';

export const CRN_BASE = 0x40000000;
export function batchSlotSeed(baseSeed: number, index: number, crn: boolean): number {
  return ((crn ? CRN_BASE : baseSeed) + index * SEED_STRIDE) >>> 0;
}
export interface BatchExperimentSpec {
  model: string; exp: string; baseSeed: number; endTime: number; replicationCount: number;
  paramOverrides: ParamOverride[]; paramScript?: string; enabled: boolean;
}
export interface BatchHost {
  readSpec(model: string, exp: string): Promise<BatchExperimentSpec | null>;
  listEnabledExperiments(model: string): Promise<Array<{ model: string; exp: string }>>;
  applyParams(overrides: ParamOverride[]): void;
  applyScript(script: string): Promise<{ ok: boolean; message?: string }>;
  setSeed(seed: number): void;
  beginRun(endTime: number): void;
  fastForward(): Promise<boolean>;
  setScope(scope: { model: string; exp: string } | null): void;
  suppressAutoSeed(): () => void;
}

export class DesBatchRunner {
  private cancelled = false;
  private progress: Record<string, unknown> | null = null;
  constructor(private readonly host: BatchHost) {}
  progressJson(): string | null { return this.progress ? JSON.stringify(this.progress) : null; }
  cancel(): void { this.cancelled = true; }

  async runExperiment(model: string, exp: string, opts: { replications?: number; crn: boolean }): Promise<void> {
    const spec = await this.host.readSpec(model, exp);
    if (!spec) { this.progress = { exp, replIndex: 0, total: 0, phase: 'aborted' }; return; }
    const total = Math.max(1, Math.floor(opts.replications ?? spec.replicationCount));
    if (!(spec.endTime > 0) || !Number.isFinite(spec.endTime)) {
      this.progress = { exp, replIndex: 0, total, phase: 'aborted' }; return;
    }
    this.cancelled = false;
    const restore = this.host.suppressAutoSeed();
    this.host.setScope({ model, exp });
    try {
      for (let index = 0; index < total; index++) {
        if (this.cancelled) { this.progress = { exp, replIndex: index, total, phase: 'aborted' }; return; }
        this.progress = { exp, replIndex: index, total, phase: 'configuring' };
        try {
          this.host.applyParams(spec.paramOverrides);
        } catch (error) {
          this.progress = {
            exp, replIndex: index, total, phase: 'aborted',
            message: error instanceof Error ? error.message : String(error),
          };
          return;
        }
        if (spec.paramScript) {
          const result = await this.host.applyScript(spec.paramScript);
          if (!result.ok) { this.progress = { exp, replIndex: index, total, phase: 'aborted', message: result.message }; return; }
        }
        this.host.setSeed(batchSlotSeed(spec.baseSeed, index, opts.crn));
        this.host.beginRun(spec.endTime);
        this.progress = { exp, replIndex: index, total, phase: 'running' };
        try {
          if (!await this.host.fastForward()) { this.progress = { exp, replIndex: index, total, phase: 'aborted' }; return; }
        } catch {
          this.progress = { exp, replIndex: index, total, phase: 'aborted' }; return;
        }
      }
      this.progress = { exp, replIndex: total, total, phase: 'done' };
    } finally {
      this.host.setScope(null); restore();
    }
  }

  async runAll(model: string, opts: { crn: boolean }): Promise<void> {
    for (const item of await this.host.listEnabledExperiments(model)) {
      if (this.cancelled) break;
      await this.runExperiment(item.model, item.exp, opts);
    }
  }
}
