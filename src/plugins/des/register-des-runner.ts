// SPDX-License-Identifier: AGPL-3.0-only

import type { CoreSubsystems } from '../../core/engine/rv-core-subsystems';
import type { MaterialFlowDefinition } from '../../core/material-flow/define-material-flow';
import type { SimulationExecutor, SimulationTopology } from '../../core/material-flow/simulation-executor';
import type { DesRunnerFactory, SimSubMode } from '../../core/material-flow/simulation-kernel';
import type { DESRunner } from './des-runner';

export type CreateDesRunner = DesRunnerFactory;

const DEFERRED_SERVICE_METHODS = new Set([
  'listExperiments', 'readManifestJson', 'saveSnapshot', 'loadSnapshot',
  'deleteSnapshot', 'deleteReplication', 'deleteExperiment', 'renameExperiment',
  'exportExperiment', 'importExperiment', 'estimateStorage',
  'activeRunInfoJson', 'patchExperimentMetaJson',
  'runExperimentBatch', 'runAllExperiments', 'cancelBatch', 'batchProgressJson',
]);

const SYNCHRONOUS_SERVICE_METHODS = new Set([
  'activeRunInfoJson', 'cancelBatch', 'batchProgressJson',
]);

/**
 * Small synchronous facade around the asynchronously loaded DES runtime.
 *
 * `SimulationKernel.setMode()` is intentionally synchronous: it clears the
 * outgoing executor, calls `start()`, then commits the new mode. Keeping this
 * facade synchronous preserves that public contract while moving the sizeable
 * event runtime out of the application entry chunk. The first DES `start()`
 * begins the import and remembers the exact topology; ticks are harmless until
 * the module arrives, then the real runner starts before the load promise is
 * resolved. Controls changed during that short window are replayed as options.
 *
 * A rapid DES -> continuous switch invalidates the pending start. The imported
 * runner may still be cached by the browser, but it cannot begin processing an
 * abandoned scene after the switch.
 */
class DeferredDESRunner implements SimulationExecutor {
  readonly mode = 'des' as const;

  private runner: DESRunner | null = null;
  private loading: Promise<DESRunner> | null = null;
  private startRequest: { defs: MaterialFlowDefinition[]; topology: SimulationTopology } | null = null;
  private lastStart: { defs: MaterialFlowDefinition[]; topology: SimulationTopology } | null = null;
  private disposed = false;
  private requestedSubMode: SimSubMode = 'animated';
  private requestedPreFastForwardSubMode: SimSubMode = 'animated';
  private requestedMultiplier = 1;
  private requestedEndTime = Number.POSITIVE_INFINITY;
  private requestedStatResetTime = 0;
  private requestedMasterSeed: number | undefined;
  private pendingRestoreJson: string | null = null;

  get muCount(): number { return this.runner?.muCount ?? 0; }
  get ready(): boolean { return this.runner !== null; }
  get subMode(): SimSubMode { return this.runner?.subMode ?? this.requestedSubMode; }
  get preFastForwardSubMode(): SimSubMode {
    return this.runner?.preFastForwardSubMode ?? this.requestedPreFastForwardSubMode;
  }
  get multiplier(): number { return this.runner?.multiplier ?? this.requestedMultiplier; }
  get simTime(): number { return this.runner?.simTime ?? 0; }
  get ffProgress(): number | undefined { return this.runner?.ffProgress; }
  get endTime(): number { return this.runner?.endTime ?? this.requestedEndTime; }
  get statResetTime(): number { return this.runner?.statResetTime ?? this.requestedStatResetTime; }
  get masterSeed(): number | undefined { return this.runner?.masterSeed ?? this.requestedMasterSeed; }

  start(defs: MaterialFlowDefinition[], topology: SimulationTopology): void {
    if (this.disposed) return;
    const request = { defs, topology };
    this.lastStart = request;
    this.startRequest = request;
    if (this.runner) {
      this.runner.start(defs, topology);
      this.applyPendingRestore();
      return;
    }
    void this.load().catch((error) => {
      console.error('[DES] Failed to load the runtime:', error);
    });
  }

  tick(dt: number): void { this.runner?.tick(dt); }
  lateTick(dt: number): void { this.runner?.lateTick(dt); }

  clearMUs(): void {
    this.startRequest = null;
    this.pendingRestoreJson = null;
    this.runner?.clearMUs();
  }

  reset(): void {
    if (this.runner) {
      this.runner.reset();
      return;
    }
    if (this.lastStart) {
      this.startRequest = this.lastStart;
      void this.load().catch((error) => {
        console.error('[DES] Failed to load the runtime:', error);
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.startRequest = null;
    this.pendingRestoreJson = null;
    this.runner?.dispose();
  }

  instances(): ReturnType<DESRunner['instances']> { return this.runner?.instances() ?? []; }

  setSubMode(mode: SimSubMode): void {
    if (mode === 'fastforward') this.requestedPreFastForwardSubMode = this.subMode;
    else if (this.requestedSubMode === 'fastforward') this.requestedPreFastForwardSubMode = mode;
    this.requestedSubMode = mode;
    this.runner?.setSubMode(mode);
  }

  setMultiplier(value: number): void {
    this.requestedMultiplier = Math.max(1, value);
    this.runner?.setMultiplier(value);
  }

  setEndTime(seconds: number): void {
    this.requestedEndTime = seconds;
    this.runner?.setEndTime(seconds);
  }

  setStatResetTime(seconds: number): void {
    this.requestedStatResetTime = Math.max(0, seconds);
    this.runner?.setStatResetTime(seconds);
  }

  setMasterSeed(seed: number): void {
    this.requestedMasterSeed = seed;
    this.runner?.setMasterSeed(seed);
  }

  step(): boolean { return this.runner?.step() ?? false; }

  async runFastForward(): Promise<boolean> {
    const runner = await this.load();
    if (!this.startRequest || this.disposed) return false;
    return runner.runFastForward();
  }

  cancelFastForward(): void { this.runner?.cancelFastForward(); }

  kpiSnapshot(): ReturnType<DESRunner['kpiSnapshot']> {
    return this.runner?.kpiSnapshot() ?? {
      simTimeSeconds: 0, throughputPerHour: 0, bottleneck: null, components: [],
    };
  }

  eventStats(): ReturnType<DESRunner['eventStats']> {
    return this.runner?.eventStats() ?? {
      currentTime: 0, processed: 0, pending: 0, nextEventTime: Number.POSITIVE_INFINITY,
    };
  }

  componentStates(): ReturnType<DESRunner['componentStates']> {
    return this.runner?.componentStates() ?? [];
  }

  statistics(): ReturnType<DESRunner['statistics']> {
    return this.runner?.statistics() ?? {
      simTime: 0, components: [], bottleneck: null, meanUtilization: 0, throughputPerHour: 0,
    };
  }

  snapshotJson(): string {
    if (!this.runner) throw new Error('[DES] Runtime is still loading');
    return this.runner.snapshotJson();
  }

  restoreJson(json: string): void {
    if (this.runner) this.runner.restoreJson(json);
    else this.pendingRestoreJson = json;
  }

  invokeService(method: string, args: unknown[]): unknown {
    if (this.runner) {
      const call = (this.runner as unknown as Record<string, unknown>)[method];
      return typeof call === 'function' ? call.apply(this.runner, args) : undefined;
    }
    if (SYNCHRONOUS_SERVICE_METHODS.has(method)) return method === 'cancelBatch' ? undefined : null;
    return this.load().then((runner) => {
      const call = (runner as unknown as Record<string, unknown>)[method];
      if (typeof call !== 'function') throw new Error(`[DES] Runtime service is unavailable: ${method}`);
      return call.apply(runner, args);
    });
  }

  private load(): Promise<DESRunner> {
    if (this.runner) return Promise.resolve(this.runner);
    if (this.loading) return this.loading;
    this.loading = import('./des-runner').then(({ DESRunner: LoadedDESRunner }) => {
      const runner = new LoadedDESRunner({
        subMode: this.requestedSubMode,
        multiplier: this.requestedMultiplier,
        durationSeconds: this.requestedEndTime,
        masterSeed: this.requestedMasterSeed,
      });
      runner.setStatResetTime(this.requestedStatResetTime);
      this.runner = runner;
      if (this.disposed) {
        runner.dispose();
        return runner;
      }
      const request = this.startRequest;
      if (request) {
        runner.start(request.defs, request.topology);
        this.applyPendingRestore();
      }
      return runner;
    });
    return this.loading;
  }

  private applyPendingRestore(): void {
    if (!this.runner || this.pendingRestoreJson === null) return;
    const json = this.pendingRestoreJson;
    this.pendingRestoreJson = null;
    this.runner.restoreJson(json);
  }
}

export const createDesRunner: Exclude<CreateDesRunner, null> = (
  _defs: MaterialFlowDefinition[],
  _topology: SimulationTopology,
  _core?: CoreSubsystems,
): SimulationExecutor => {
  const deferred = new DeferredDESRunner();
  return new Proxy(deferred, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (value !== undefined || typeof property !== 'string' || !DEFERRED_SERVICE_METHODS.has(property)) return value;
      return (...args: unknown[]) => target.invokeService(property, args);
    },
  });
};
