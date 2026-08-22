// SPDX-License-Identifier: AGPL-3.0-only

import { freshRunId, type RunScope } from '../../core/material-flow/rv-run-history-store';
import {
  desRunSettingsStore, getDesRunSettings, rollSeed,
} from '../../core/hmi/des-run-settings-store';
import type { SimDesStatistics } from '../../core/material-flow/simulation-kernel';
import type { DESManager } from './rv-des-manager';
import type { SnapshotStore } from './rv-des-experiment-store';
import type { RunResult } from './rv-des-experiment-model';
import type { DESSnapshot } from './rv-des-snapshot';

export interface RunLifecycleOptions {
  manager: DESManager;
  getStatistics(): SimDesStatistics | null;
  store: SnapshotStore;
  getScope(): RunScope | null;
  emit?(event: string, data: unknown): void;
}

export const CHECKPOINT_LABEL = 'autosave';

export function nextCheckpointBoundary(time: number, interval: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(interval) || interval <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (Math.floor(time / interval) + 1) * interval;
}

export class RunLifecycleController {
  activeRun: { runId: string; seed: number; startedAt: number } | null = null;
  private detachReset: (() => void) | null = null;
  private restoring = 0;
  constructor(private readonly options: RunLifecycleOptions) {}

  attach(): void {
    this.detachReset ??= this.options.manager.onReset(() => { this.handleReset(); });
  }
  dispose(): void { this.detachReset?.(); this.detachReset = null; this.activeRun = null; }
  startRun(): void {
    this.activeRun = { runId: freshRunId(), seed: this.options.manager.masterSeed, startedAt: Date.now() };
    this.options.emit?.('simulation-run-started', { ...this.activeRun });
  }
  completeRun(reason = 'duration-reached'): void { this.archive('completed', reason); }
  beginRestore(): void { this.restoring++; }
  endRestore(): void { this.restoring = Math.max(0, this.restoring - 1); }

  private handleReset(): void {
    if (this.restoring > 0) return;
    if (this.activeRun && this.options.manager.totalEventsProcessed > 0) {
      const status = this.options.manager.currentTime >= this.options.manager.duration ? 'completed' : 'aborted';
      this.archive(status, 'reset');
    } else if (this.activeRun) this.activeRun = null;
    if (getDesRunSettings().seedMode === 'auto') this.options.manager.setMasterSeed(rollSeed());
  }

  private archive(status: RunResult['status'], reason: string): void {
    const active = this.activeRun;
    if (!active) return;
    const simTime = this.options.manager.currentTime;
    this.options.emit?.('simulation-run-ending', { runId: active.runId, simTime, status, reason });
    this.activeRun = null;
    const scope = this.options.getScope();
    if (!scope) return;
    const stats = this.options.getStatistics();
    const run: RunResult = {
      runId: active.runId, status, startedAt: active.startedAt, endedAt: Date.now(),
      simTimeReached: simTime, reason,
      ...(stats ? { stats } : {}),
    };
    void this.options.store.recordRun(scope.model, scope.exp, active.seed, run, {
      maxRuns: getDesRunSettings().retentionMax,
    });
  }
}

export interface CheckpointControllerOptions {
  manager: DESManager;
  lifecycle: RunLifecycleController;
  store: SnapshotStore;
  getSnapshot(): DESSnapshot;
  getScope(): RunScope | null;
  /** Minimum elapsed wall time between writes; zero disables throttling. */
  minWallMs?: number;
}

/**
 * Owns the single grid-aligned checkpoint system-event chain. Snapshot capture
 * happens synchronously at the boundary; persistence is serialized so slow
 * IndexedDB writes cannot reorder checkpoints.
 */
export class CheckpointController {
  private detachSettings: (() => void) | null = null;
  private detachAdvance: (() => void) | null = null;
  private previousCheckpoint: ((time: number) => void) | null = null;
  private readonly checkpointHandler = (time: number) => { this.handleCheckpoint(time); };
  private writes: Promise<void> = Promise.resolve();
  private lastSaveWall = 0;

  constructor(private readonly options: CheckpointControllerOptions) {}

  attach(): void {
    if (this.detachSettings) return;
    this.previousCheckpoint = this.options.manager.onCheckpoint;
    this.options.manager.onCheckpoint = this.checkpointHandler;
    this.detachSettings = desRunSettingsStore.subscribe(() => this.replan());
    this.detachAdvance = this.options.manager.onTimeAdvanced(() => {
      if (!this.options.manager.hasScheduledCheckpoint) this.arm();
    });
    this.arm();
  }

  dispose(): void {
    this.detachSettings?.();
    this.detachSettings = null;
    this.detachAdvance?.();
    this.detachAdvance = null;
    this.options.manager.cancelCheckpoint();
    if (this.options.manager.onCheckpoint === this.checkpointHandler) {
      this.options.manager.onCheckpoint = this.previousCheckpoint;
    }
    this.previousCheckpoint = null;
  }

  private replan(): void {
    this.options.manager.cancelCheckpoint();
    this.arm();
  }

  private arm(fromTime = this.options.manager.currentTime): void {
    const interval = getDesRunSettings().autoSaveInterval;
    if (interval <= 0 || this.options.manager.hasScheduledCheckpoint) return;
    const boundary = nextCheckpointBoundary(fromTime, interval);
    if (Number.isFinite(boundary)) this.options.manager.scheduleCheckpoint(boundary);
  }

  private handleCheckpoint(simTime: number): void {
    const settings = getDesRunSettings();
    const now = Date.now();
    const rateLimited = this.lastSaveWall !== 0
      && now - this.lastSaveWall < Math.max(0, this.options.minWallMs ?? 0);
    const scope = this.options.getScope();

    if (!rateLimited && scope) {
      this.lastSaveWall = now;
      const snapshot = this.options.getSnapshot();
      const seed = this.options.lifecycle.activeRun?.seed ?? this.options.manager.masterSeed;
      this.writes = this.writes
        .then(async () => {
          await this.options.store.writeSnapshot(scope.model, scope.exp, 0, simTime, snapshot, {
            replicationSeed: seed,
            label: CHECKPOINT_LABEL,
          });
          const autosaves = (await this.options.store.listSnapshots(scope.model, scope.exp, 0))
            .filter((entry) => entry.label === CHECKPOINT_LABEL)
            .sort((a, b) => a.simTime - b.simTime);
          const excess = autosaves.slice(0, Math.max(0, autosaves.length - settings.checkpointMax));
          for (const entry of excess) {
            await this.options.store.deleteSnapshot(scope.model, scope.exp, 0, entry.simTime);
          }
        })
        .catch((error: unknown) => {
          console.error('[DES] checkpoint persistence failed:', error);
        });
    }

    // A skipped save still advances the system-event chain.
    this.arm(simTime);
  }
}
