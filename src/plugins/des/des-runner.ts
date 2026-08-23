// SPDX-License-Identifier: AGPL-3.0-only

import { Object3D, Vector3 } from 'three';
import type { MaterialFlowDefinition } from '../../core/material-flow/define-material-flow';
import type {
  FrozenDescriptor, FrozenTweenDescriptor, MaterialFlowSelf, MU, MuRef, Port, SelfScheduler, TweenSpec,
} from '../../core/material-flow/material-flow-self';
import type { SimulationExecutor, SimulationTopology, MaterialFlowInstance } from '../../core/material-flow/simulation-executor';
import type { SimDesStatistics, SimKpiSnapshot, SimSubMode } from '../../core/material-flow/simulation-kernel';
import {
  TweenRegistry, type PositionTweenTarget, type DriveTweenTarget, type PathTweenSampler,
  type PathTweenTarget, type TweenDataSnapshot, type TweenHandle,
} from '../../core/material-flow/tween-registry';
import { yieldToBrowser } from '../../core/engine/rv-des-yield';
import { DESManager } from '../../core/material-flow/des/rv-des-manager';
import { ensureAction } from '../../core/material-flow/des/rv-des-named-actions';
import type { DESMU } from '../../core/material-flow/des/rv-des-mu';
import type { DESSnapshot } from '../../core/material-flow/des/rv-des-snapshot';
import { createSnapshot, restoreSnapshot } from '../../core/material-flow/des/rv-des-snapshot';
import type { RVMovingUnit } from '../../core/engine/rv-mu';
import { RVMovingUnit as MovingUnit } from '../../core/engine/rv-mu';
import { getDefaultPathNetwork } from '../../core/engine/rv-path-network';
import type { RVDrive } from '../../core/engine/rv-drive';
import { getEngineSourceForNode } from '../../core/engine/rv-source';
import { releaseAllAxes } from '../../core/engine/rv-axis-ownership';
import { MaterialFlowAdapter } from './material-flow-adapter';
import { bindSceneToRunner } from './des-scene-binding';
import { runScopeStore } from '../../core/material-flow/rv-run-history-store';
import {
  desRunSettingsStore, getDesRunSettings,
} from '../../core/hmi/des-run-settings-store';
import {
  IndexedDBSnapshotStore, type ManifestMetaPatch,
} from './rv-des-experiment-store';
import {
  CheckpointController, RunLifecycleController,
} from './rv-des-run-lifecycle';
import {
  DesBatchRunner, type BatchExperimentSpec,
} from './des-batch-runner';
import type { ParamOverride } from './rv-des-experiment-model';

export interface DESRunnerOptions {
  subMode?: SimSubMode;
  multiplier?: number;
  frameEventBudget?: number;
  durationSeconds?: number;
  seed?: number;
  masterSeed?: number;
}

interface ScheduledPayload { mu: MU | null; data: unknown; eventId?: number }
interface ScheduledRecord {
  entityId: number;
  action: string;
  muId: number;
  priority: number;
  payload: ScheduledPayload | null;
  tweenHandles: TweenHandle[];
  tweenMuIds: number[];
}
const ATTACHED_PROCESS_COMPLETE = 'DES.Attachment.ProcessComplete';
const DOWNTIME_FAIL = 'DES.Downtime.Fail';
const DOWNTIME_REPAIR = 'DES.Downtime.Repair';

ensureAction(ATTACHED_PROCESS_COMPLETE, ({ manager, entityId, muId }) => {
  const adapter = manager.getComponent(entityId ?? -1);
  const mu = manager.getMU(muId);
  if (!(adapter instanceof MaterialFlowAdapter) || !mu) return;
  adapter.self.setState('Working');
  adapter.releaseMU(mu);
});

ensureAction(DOWNTIME_FAIL, ({ manager, entityId }) => {
  const owner = manager.getComponent(entityId ?? -1);
  if (!(owner instanceof MaterialFlowAdapter)) return;
  const config = downtimeConfig(owner);
  const affected = manager.getComponentByPath(config.targetPath);
  if (!(affected instanceof MaterialFlowAdapter)) return;
  affected.setFailure(true);
  owner.self.prop.failureCount = Number(owner.self.prop.failureCount ?? 0) + 1;
  manager.scheduleIn(config.mttr, DOWNTIME_REPAIR, owner.entityId);
});

ensureAction(DOWNTIME_REPAIR, ({ manager, entityId }) => {
  const owner = manager.getComponent(entityId ?? -1);
  if (!(owner instanceof MaterialFlowAdapter)) return;
  const config = downtimeConfig(owner);
  const affected = manager.getComponentByPath(config.targetPath);
  if (affected instanceof MaterialFlowAdapter) affected.setFailure(false);
  manager.scheduleIn(config.mtbf, DOWNTIME_FAIL, owner.entityId);
});

/**
 * Register (once) the named action that fires one `${def.type}.${hook}` model
 * event and return its name.
 *
 * `ACTION_BY_INDEX` is a module-global table that is never cleared, so the
 * handler must not close over a `DESRunner`: the first runner to touch a hook
 * would otherwise be pinned for the page's lifetime AND every later runner
 * would reuse its closure, writing bookkeeping into the wrong instance. Both
 * the component and the owning runner are reached through the dispatch context.
 */
function ensureHookAction(def: MaterialFlowDefinition, hook: string): string {
  const action = `${def.type}.${hook}`;
  ensureAction(action, ({ manager, entityId: id, muId, data: raw, eventId }) => {
    const adapter = manager.getComponent(id ?? -1);
    if (!(adapter instanceof MaterialFlowAdapter)) return;
    const payload = raw as ScheduledPayload | null;
    const resolved = muId >= 0 ? manager.getMU(muId) : payload?.mu ?? null;
    // Retire the record for EVERY fired event, not only the ones that happen to
    // carry a payload: a registered MU with no data produces no payload at all,
    // so those records used to accumulate for the whole run.
    const retiring = eventId ?? payload?.eventId;
    if (retiring !== undefined) adapter.onScheduledRecordConsumed?.(retiring);
    adapter.dispatchHook(hook, resolved as unknown as MU | null, payload?.data);
    if (adapter.attachedProcessingTime > 0 && adapter.self.state === 'Processing') adapter.setState('Working');
  });
  return action;
}

/**
 * Eagerly register every hook a definition can schedule.
 *
 * Lazy registration on first `schedule()` is not enough for snapshot restore:
 * `DESManager.restore()` resolves persisted action NAMES back to indices, so a
 * checkpoint taken in an earlier session would fail to load until the very hook
 * it references happened to fire again. Definitions declare their hooks as
 * `on<Name>` keys, which is exactly the set `dispatchHook` can reach.
 */
export function registerDefinitionHookActions(def: MaterialFlowDefinition): void {
  const des = def.des as Record<string, unknown> | undefined;
  if (!des) return;
  for (const key of Object.keys(des)) {
    if (!key.startsWith('on') || key.length < 3 || typeof des[key] !== 'function') continue;
    ensureHookAction(def, key.slice(2));
  }
}

interface ScriptComponentSourceEntry {
  path: string;
  adapter: {
    captureScriptState(): unknown;
    restoreScriptState(saved: never): void;
    hasDesHooks?(): boolean;
  };
}

export type MaterializeMuResult =
  | { ok: true; created: boolean; visual: RVMovingUnit }
  | { ok: false; created: false; reason: 'missing-mu' | 'missing-template' };

export class DESRunner implements SimulationExecutor {
  readonly mode = 'des' as const;
  readonly ready = true;
  readonly liveInstances: Array<{ def: MaterialFlowDefinition; self: MaterialFlowSelf; adapter: MaterialFlowAdapter }> = [];
  private readonly visualFactories = new Map<string, {
    create: () => RVMovingUnit;
    dispose: (visual: RVMovingUnit) => void;
  }>();
  private readonly warnedVisualTemplates = new Set<string>();
  private readonly manager = new DESManager();
  private readonly tweens = new TweenRegistry();
  private readonly scheduledRecords = new Map<number, ScheduledRecord>();
  private readonly warnedUnsettledTypes = new Set<string>();
  private readonly warnedMissingDrives = new Set<string>();
  private pendingConsumed: DESMU[] = [];
  private frameEventBudget: number;
  private renderNow = 0;
  private ffRunning = false;
  private ffRunId = 0;
  private ffResolve: ((value: boolean) => void) | null = null;
  private _ffProgress: number | undefined;
  private _subMode: SimSubMode;
  private _preFastForwardSubMode: SimSubMode;
  multiplier: number;
  endTime: number;
  private scriptComponentSource: (() => readonly ScriptComponentSourceEntry[]) | null = null;
  private _topology: SimulationTopology | null = null;
  private suppressSceneRebind = false;
  private experimentStore: IndexedDBSnapshotStore | null = null;
  private runLifecycle: RunLifecycleController | null = null;
  private checkpoints: CheckpointController | null = null;
  private batchRunner: DesBatchRunner | null = null;

  constructor(opts: DESRunnerOptions = {}) {
    this._subMode = opts.subMode ?? 'animated';
    this.multiplier = Math.max(1, opts.multiplier ?? 1);
    this._preFastForwardSubMode = this._subMode === 'fastforward'
      ? this.multiplier > 1 ? 'hybrid' : 'animated'
      : this._subMode;
    this.frameEventBudget = Math.max(1, Math.floor(opts.frameEventBudget ?? 2000));
    this.endTime = opts.durationSeconds ?? Number.POSITIVE_INFINITY;
    this.manager.duration = this.endTime;
    const seed = opts.masterSeed ?? opts.seed;
    if (seed !== undefined) this.manager.setMasterSeed(seed);
    this.manager.onMURetired = (mu) => {
      this.disposeMuVisual(mu);
      this.refreshHierarchyVisuals();
    };
  }

  get subMode(): SimSubMode { return this._subMode; }
  get preFastForwardSubMode(): SimSubMode { return this._preFastForwardSubMode; }
  get simTime(): number { return this.manager.currentTime; }
  get renderClock(): number { return this.renderNow; }
  get muCount(): number { return this.manager.muCount; }
  get ffProgress(): number | undefined { return this._ffProgress; }
  get masterSeed(): number { return this.manager.masterSeed; }
  get statResetTime(): number { return this.manager.statResetTime; }
  get headlessSpawnActive(): boolean { return this._subMode === 'fastforward'; }

  getManager(): DESManager { return this.manager; }
  getTweenRegistry(): TweenRegistry { return this.tweens; }
  instances(): ReadonlyArray<MaterialFlowInstance> { return this.liveInstances; }

  makeScheduler(def: MaterialFlowDefinition, entityId: () => number): SelfScheduler {
    const runner = this;
    const schedule = (time: number, hook: string, mu?: MU | null, data?: unknown): number => {
      const action = ensureHookAction(def, hook);
      const registeredMu = mu && typeof mu.id === 'number'
        ? this.manager.getMU(mu.id)
        : null;
      const registered = registeredMu !== null && registeredMu === (mu as unknown as DESMU);
      const persistedData = toJsonData(data);
      const payload: ScheduledPayload | null = data === undefined && registered
        ? null
        : { mu: registered ? null : mu ?? null, data: persistedData ?? null };
      const id = this.manager.scheduleEvent(time, action, entityId(), registered ? mu!.id : -1, 0, payload);
      if (payload) payload.eventId = id;
      const registeredTweens = this.registerTweens(time - this.manager.currentTime, data);
      this.scheduledRecords.set(id, {
        entityId: entityId(), action, muId: registered ? mu!.id : -1, priority: 0, payload,
        tweenHandles: registeredTweens.handles,
        tweenMuIds: registeredTweens.muIds,
      });
      return id;
    };
    return {
      in: (delay, hook, mu, data) => schedule(this.manager.currentTime + delay, hook, mu, data),
      at: (time, hook, mu, data) => schedule(time, hook, mu, data),
      cancel: (eventId) => { this.manager.cancelEvent(eventId); },
      get now() { return runner.manager.currentTime; },
    } as SelfScheduler;
  }

  addInstance(def: MaterialFlowDefinition, self: MaterialFlowSelf, node: Object3D): MaterialFlowAdapter {
    const adapter = new MaterialFlowAdapter(def, self, node);
    adapter.onConsumed = (mu) => this.pendingConsumed.push(mu);
    adapter.onFailureChanged = (target, failed) => this.handleFailureChanged(target, failed);
    adapter.onBeforeDispatch = (target, hook, mu) => {
      this.warnIfUnsettled(`${target.def.type}.${hook}`, target.def, mu as DESMU | null);
    };
    adapter.onMaterialize = (mu) => { if (!this.headlessSpawnActive) void this.materializeMu(mu); };
    adapter.onScheduledRecordConsumed = (eventId) => { this.scheduledRecords.delete(eventId); };
    registerDefinitionHookActions(def);
    this.liveInstances.push({ def, self, adapter });
    if (this.manager.components.length > 0) {
      this.manager.registerComponent(adapter);
      this.configureCapacity(adapter);
      this.updateSettleGate();
    }
    return adapter;
  }

  start(_defs: MaterialFlowDefinition[], _topology: SimulationTopology): void {
    const shouldRebindScene = !this.suppressSceneRebind && Boolean(this._topology?.host && _topology.host);
    if (shouldRebindScene) {
      // Planner/model content may have changed while the cached executor was in
      // continuous mode. Scene-bound instances are projections, not durable
      // runtime identity: discard them and bind the current scene afresh.
      this.clearMUs();
      this.liveInstances.length = 0;
      this.manager.components.length = 0;
    }
    this._topology = _topology;
    if (_topology.host) this.ensureRunServices();
    this.checkpoints?.dispose();
    this.checkpoints = null;
    releaseAllAxes();
    if (this.liveInstances.length === 0 && _topology.host) bindSceneToRunner(this, _topology.root, _topology.host);
    // Register every schedulable hook BEFORE a restore can be requested, so a
    // checkpoint written in an earlier session resolves its persisted action
    // names instead of failing on a hook that has not fired yet.
    for (const def of _defs) registerDefinitionHookActions(def);
    for (const instance of this.liveInstances) registerDefinitionHookActions(instance.def);
    for (const instance of this.liveInstances) instance.def.reset?.(instance.self);
    this.manager.reset();
    this.pendingConsumed.length = 0;
    this.tweens.clear();
    this.scheduledRecords.clear();
    this.manager.duration = this.endTime;
    this.renderNow = 0;
    for (const instance of this.liveInstances) {
      instance.adapter.heldMUs = [];
      instance.adapter.frozen = [];
      if (!this.manager.components.includes(instance.adapter)) this.manager.registerComponent(instance.adapter);
      this.configureCapacity(instance.adapter);
      instance.def.setup?.(instance.self);
    }
    this.configureAttachments();
    this.updateSettleGate();
    for (const instance of this.liveInstances) {
      if (instance.def.des?.onGenerate) instance.adapter.dispatchHook('Generate', null);
    }
    if (this.runLifecycle) {
      this.checkpoints = new CheckpointController({
        manager: this.manager,
        lifecycle: this.runLifecycle,
        store: this.getExperimentStore(),
        getSnapshot: () => this.fullSnapshot(),
        getScope: () => runScopeStore.getSnapshot(),
        minWallMs: 250,
      });
      this.checkpoints.attach();
      this.runLifecycle.startRun();
    }
  }

  tick(dt: number): void {
    if (this._subMode === 'step') return;
    if (this._subMode === 'fastforward') {
      if (this.ffRunning) return;
      const deadline = performance.now() + 12;
      do {
        const count = this.manager.processEvents(this.frameEventBudget);
        if (count === 0 || this.manager.nextEventTime > this.endTime) break;
      } while (performance.now() < deadline);
      this.maybeCompleteRun();
      return;
    }
    this.renderNow = Math.min(this.endTime, this.renderNow + dt * (this._subMode === 'hybrid' ? this.multiplier : 1));
    const budget = this._subMode === 'hybrid' ? this.frameEventBudget : Number.POSITIVE_INFINITY;
    const processed = this.manager.processUntilTime(this.renderNow, budget);
    if (this.renderNow < this.endTime
      && processed < budget
      && this.manager.currentTime < this.renderNow
      && this.manager.nextEventTime > this.renderNow) {
      this.manager.advanceClockTo(this.renderNow);
    }
    this.maybeCompleteRun();
  }

  lateTick(_dt: number): void {
    const visualTime = this._subMode === 'animated' || this._subMode === 'hybrid'
      ? this.renderNow
      : this.manager.currentTime;
    this.tweens.onRender(visualTime, this._subMode);
    if (this.pendingConsumed.length === 0) return;
    const pending = this.pendingConsumed.splice(0);
    for (const mu of pending) {
      const visual = mu.visual as { dispose?: () => void } | null;
      visual?.dispose?.();
      mu.visual = null;
      const previous = mu.currentComponent;
      if (previous) previous.heldMUs = previous.heldMUs.filter((held) => held !== mu);
      this.manager.retireMU(mu);
      if (previous instanceof MaterialFlowAdapter) previous.notifyUpstream();
    }
  }

  step(): boolean {
    const stepped = this.manager.step();
    this.maybeCompleteRun();
    return stepped;
  }
  clearMUs(): void {
    for (const instance of this.liveInstances) instance.def.reset?.(instance.self);
    this.manager.clearMUs();
    this.scheduledRecords.clear();
    for (const x of this.liveInstances) x.adapter.heldMUs = [];
    this.tweens.clear();
    releaseAllAxes();
  }
  reset(): void {
    const topology = this._topology ?? { root: this.liveInstances[0]?.adapter.node ?? ({} as Object3D) };
    this.suppressSceneRebind = true;
    try {
      this.start(this.liveInstances.map((x) => x.def), topology);
    } finally {
      this.suppressSceneRebind = false;
    }
  }
  dispose(): void {
    this.cancelFastForward();
    this.checkpoints?.dispose();
    this.checkpoints = null;
    this.runLifecycle?.dispose();
    this.runLifecycle = null;
    this.batchRunner?.cancel();
    this.batchRunner = null;
    const store = this.experimentStore;
    this.experimentStore = null;
    if (store) void store.close().catch(() => {});
    this.clearMUs();
    for (const instance of this.liveInstances) {
      instance.adapter.onConsumed = null;
      instance.adapter.onFailureChanged = null;
      instance.adapter.onBeforeDispatch = null;
      instance.adapter.onMaterialize = null;
      instance.adapter.onScheduledRecordConsumed = null;
    }
    this.liveInstances.length = 0;
    this.manager.components.length = 0;
    this.manager.onTimeAdvance = null;
    this.manager.onMURetired = null;
    this.scheduledRecords.clear();
    this.tweens.clear();
    this.pendingConsumed.length = 0;
    this.visualFactories.clear();
    this.scriptComponentSource = null;
    this._topology = null;
  }

  setSubMode(mode: SimSubMode): void {
    if (mode === this._subMode) return;
    if (mode === 'fastforward') this._preFastForwardSubMode = this._subMode;
    else if (this._subMode === 'fastforward') {
      this.cancelFastForward();
      this._subMode = mode;
      this.renderNow = this.manager.currentTime;
      this.refreshHierarchyVisuals();
      this.tweens.settle(this.manager.currentTime, 'ffExit');
      for (const instance of this.liveInstances) instance.adapter.dispatchHook('FastForwardExit', null);
      return;
    }
    this._subMode = mode;
  }
  setMultiplier(value: number): void { this.multiplier = Math.max(1, value); }
  setEndTime(seconds: number): void { this.endTime = seconds; this.manager.duration = seconds; }
  setStatResetTime(seconds: number): void { this.manager.statResetTime = Math.max(0, seconds); }
  setMasterSeed(seed: number): void { this.manager.setMasterSeed(seed); }
  createMU(templateId?: string): DESMU {
    const mu = this.manager.createMU();
    if (templateId) {
      mu.visualTemplateId = templateId;
      if (!this.headlessSpawnActive) this.materializeMu(mu);
    }
    return mu;
  }
  registerMuVisualFactory(
    templateId: string,
    create: () => RVMovingUnit,
    dispose: (visual: RVMovingUnit) => void = (visual) => { visual.dispose(); },
  ): void {
    this.visualFactories.set(templateId, { create, dispose });
  }
  materializeMu(mu: DESMU | null): MaterializeMuResult {
    if (!mu || this.manager.getMU(mu.id) !== mu) return { ok: false, created: false, reason: 'missing-mu' };
    if (mu.visual) return { ok: true, created: false, visual: mu.visual };
    const templateId = mu.visualTemplateId;
    const sourcePath = typeof mu.prop.__desSourcePath === 'string' ? mu.prop.__desSourcePath : null;
    const sourceInstance = this.liveInstances.find(({ adapter, def }) => def.kind === 'source'
      && (!sourcePath || adapter.path === sourcePath));
    const engineSource = sourceInstance ? getEngineSourceForNode(sourceInstance.adapter.node) : null;
    const factory = templateId ? this.visualFactories.get(templateId) : undefined;
    if (factory) mu.visual = factory.create();
    else if (engineSource) mu.visual = engineSource.spawnMU() as RVMovingUnit | null;
    else if (!templateId) return { ok: false, created: false, reason: 'missing-template' };
    else {
      if (!this.warnedVisualTemplates.has(templateId)) {
        this.warnedVisualTemplates.add(templateId);
        console.warn(`[DES] MU visual template not registered: ${templateId}`);
      }
      const node = new Object3D();
      node.name = `MU_Fallback_${templateId}`;
      mu.visual = new MovingUnit(node, node.name);
    }
    if (!mu.visual) return { ok: false, created: false, reason: 'missing-template' };
    this.tweens.attachTargetForMu(mu.id, mu.visual);
    return { ok: true, created: true, visual: mu.visual };
  }

  setScriptComponentSource(source: (() => readonly ScriptComponentSourceEntry[]) | null): void {
    this.scriptComponentSource = source;
    this.updateSettleGate();
  }

  reconfigureFromExtras(): void {
    for (const instance of this.liveInstances) seedConfigFromExtras(instance.self, instance.def, instance.adapter.node);
  }

  async runFastForward(): Promise<boolean> {
    if (this.ffRunning) return false;
    this.setSubMode('fastforward');
    this.ffRunning = true;
    const runId = ++this.ffRunId;
    this._ffProgress = this.progress();
    const result = new Promise<boolean>((resolve) => { this.ffResolve = resolve; });
    void this.drain(runId);
    return result;
  }

  cancelFastForward(): void {
    if (!this.ffRunning) return;
    this.ffRunning = false;
    this.ffRunId++;
    this._ffProgress = undefined;
    const resolve = this.ffResolve; this.ffResolve = null; resolve?.(false);
  }

  statistics(): SimDesStatistics {
    const components = this.liveInstances.map(({ adapter, def }) => {
      const stats = adapter.getStatistics();
      return {
        path: adapter.path, name: adapter.node.name, kind: def.kind,
        working: stats.workingPercent, setup: stats.setupPercent, blocked: stats.blockedPercent,
        empty: stats.emptyPercent, failure: stats.failurePercent, utilization: stats.utilization,
        outputPerHour: stats.outputPerHour, totalProcessed: stats.totalProcessed,
        currentState: stats.currentState,
      };
    });
    const throughputPerHour = components.filter((x) => x.kind === 'sink').reduce((sum, x) => sum + x.outputPerHour, 0);
    const bottleneckRow = components.reduce<typeof components[number] | null>((best, row) => !best || row.working > best.working ? row : best, null);
    return {
      simTime: this.simTime, components,
      bottleneck: bottleneckRow ? { path: bottleneckRow.path, name: bottleneckRow.name, working: bottleneckRow.working } : null,
      meanUtilization: components.length ? components.reduce((sum, x) => sum + x.utilization, 0) / components.length : 0,
      throughputPerHour,
    };
  }

  kpiSnapshot(): SimKpiSnapshot {
    const stats = this.statistics();
    return {
      simTimeSeconds: stats.simTime, throughputPerHour: stats.throughputPerHour,
      bottleneck: stats.bottleneck ? { name: stats.bottleneck.name, utilization: stats.bottleneck.working } : null,
      components: stats.components.map((row) => ({ name: row.name, utilization: row.utilization })),
    };
  }
  eventStats() { return { currentTime: this.simTime, processed: this.manager.totalEventsProcessed, pending: this.manager.pendingEventCount, nextEventTime: this.manager.nextEventTime }; }
  componentStates(): Array<{
    name: string; path: string; state: string; type: string; kind: string;
    entityId: number; load: number; maxCapacity: number; inTransit: number;
    blocked: number; isBlocked: boolean; next: string[]; prev: string[];
  }> {
    return this.liveInstances.map(({ adapter, self, def }) => ({
      name: adapter.node.name,
      path: adapter.path,
      state: self.state,
      type: def.type,
      kind: def.kind,
      entityId: adapter.entityId,
      maxCapacity: adapter.MaxCapacity,
      inTransit: 0,
      blocked: adapter.heldMUs.filter((mu) => mu.isBlocked).length,
      isBlocked: self.state === 'Blocked',
      next: adapter.nextComponents.map((next) => next.node.name),
      prev: adapter.previousComponents.map((previous) => previous.node.name),
      load: adapter.currentLoad,
    }));
  }

  async listExperiments(model?: string): Promise<Array<{ model: string; experiment: string }>> {
    const rows = await this.getExperimentStore().listIndex();
    return model === undefined ? rows : rows.filter((row) => row.model === model);
  }

  async readManifestJson(model: string, exp: string): Promise<string | null> {
    const manifest = await this.getExperimentStore().readManifest(model, exp);
    return manifest ? JSON.stringify(manifest) : null;
  }

  async saveSnapshot(
    scope: { model: string; exp: string; repl: number },
    label?: string,
  ): Promise<void> {
    await this.getExperimentStore().writeSnapshot(
      scope.model, scope.exp, scope.repl, this.simTime, this.fullSnapshot(),
      { replicationSeed: this.masterSeed, ...(label ? { label } : {}) },
    );
  }

  async loadSnapshot(scope: { model: string; exp: string; repl: number; t: number }): Promise<void> {
    const snapshot = await this.getExperimentStore().readSnapshot(scope.model, scope.exp, scope.repl, scope.t);
    if (!snapshot) throw new Error('DES snapshot not found');
    this.runLifecycle?.beginRestore();
    try {
      this.restoreFull(snapshot);
      this.setSubMode('step');
    } finally {
      this.runLifecycle?.endRestore();
    }
  }

  deleteSnapshot(scope: { model: string; exp: string; repl: number; t: number }): Promise<void> {
    return this.getExperimentStore().deleteSnapshot(scope.model, scope.exp, scope.repl, scope.t);
  }

  deleteReplication(scope: { model: string; exp: string; repl: number }): Promise<void> {
    return this.getExperimentStore().deleteReplication(scope.model, scope.exp, scope.repl);
  }

  deleteExperiment(model: string, exp: string): Promise<void> {
    return this.getExperimentStore().deleteExperiment(model, exp);
  }

  renameExperiment(model: string, exp: string, newName: string): Promise<void> {
    return this.getExperimentStore().renameExperiment(model, exp, newName);
  }

  exportExperiment(model: string, exp: string): Promise<Blob> {
    return this.getExperimentStore().exportExperiment(model, exp);
  }

  importExperiment(file: Blob): Promise<{ model: string; exp: string }> {
    return this.getExperimentStore().importExperiment(file);
  }

  estimateStorage(): Promise<{ usedBytes: number; quotaBytes: number }> {
    return this.getExperimentStore().estimateStorage();
  }

  activeRunInfoJson(): string | null {
    return this.runLifecycle?.activeRun ? JSON.stringify(this.runLifecycle.activeRun) : null;
  }

  async patchExperimentMetaJson(model: string, exp: string, patchJson: string): Promise<void> {
    const raw = JSON.parse(patchJson) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid DES experiment metadata patch');
    await this.getExperimentStore().patchManifestMeta(model, exp, raw as ManifestMetaPatch);
  }

  runExperimentBatch(
    scope: { model: string; exp: string },
    opts: { replications: number; crn: boolean },
  ): Promise<void> {
    return this.getBatchRunner().runExperiment(scope.model, scope.exp, opts);
  }

  runAllExperiments(model: string, opts: { crn: boolean }): Promise<void> {
    return this.getBatchRunner().runAll(model, opts);
  }

  cancelBatch(): void { this.batchRunner?.cancel(); }
  batchProgressJson(): string | null { return this.batchRunner?.progressJson() ?? null; }

  fullSnapshot(): DESSnapshot {
    const snapshot = createSnapshot(
      this.manager,
      this.liveInstances.map((instance) => instance.adapter),
      [...this.manager.mus.values()],
    );
    snapshot.tweens = this.tweens.toSnapshot();
    return snapshot;
  }
  restoreFull(snapshot: DESSnapshot): void {
    restoreSnapshot(
      snapshot,
      this.manager,
      this.liveInstances.map((instance) => instance.adapter),
      [],
    );
    this.tweens.fromSnapshot(
      Array.isArray(snapshot.tweens) ? snapshot.tweens as never : [],
      (id) => this.manager.getMU(id)?.visual ?? null,
      (id) => getDefaultPathNetwork().get(id),
    );
    this.renderNow = this.manager.currentTime;
    this.refreshHierarchyVisuals();
    for (const instance of this.liveInstances) instance.adapter.dispatchHook('Restore', null);
  }
  snapshotJson(): string { return JSON.stringify(this.fullSnapshot()); }
  restoreJson(json: string): void { this.restoreFull(JSON.parse(json) as DESSnapshot); }

  makeTransfer(from: MaterialFlowAdapter): (mu: MU, port?: Port) => void {
    return (mu, port) => {
      const typed = mu as unknown as DESMU;
      if (from.def.kind === 'source' && typeof typed.prop.__desSourcePath !== 'string') {
        typed.prop.__desSourcePath = from.path;
      }
      const ownProcessing = from.attachedProcessingTime > 0
        && from.def.type !== 'PathTransport'
        && from.def.type !== 'IndexingConveyor';
      if (ownProcessing) {
        from.self.setState('Processing');
        from.setState('Working');
        this.manager.scheduleIn(from.attachedProcessingTime, ATTACHED_PROCESS_COMPLETE, from.entityId, typed.id);
        return;
      }
      const explicit = port?.partnerComponent instanceof MaterialFlowAdapter
        ? port.partnerComponent
        : port?.ownerComponent instanceof MaterialFlowAdapter
          ? port.ownerComponent
          : from.nextComponents.find((next) => next.node === port?.ownerRoot);
      const pool = explicit ? [explicit] : from.nextComponents;
      const candidates = pool.filter((next) => next.canAccept(typed));
      const routeIndex = typeof typed.prop.routeIndex === 'number' ? Math.max(0, Math.floor(typed.prop.routeIndex)) : null;
      delete typed.prop.routeIndex;
      // An explicit routeIndex names a LANE in the declared topology, so it must
      // be resolved against `pool` — never against the availability-filtered
      // list. Indexing the filtered list meant a busy lane silently diverted the
      // MU to whichever neighbour happened to be free (a part into the empty-
      // carrier sink, an empty carrier into the part line). A configured but
      // busy lane is back-pressure and must block. An OUT-OF-RANGE index still
      // falls back, because that means the lane was never wired up at all.
      const lane = routeIndex !== null && routeIndex < pool.length ? pool[routeIndex] : null;
      const target = from.onSelectNext?.(candidates, typed)
        ?? (lane ? (lane.canAccept(typed) ? lane : null) : candidates[0] ?? null);
      if (!target) { typed.isBlocked = true; from.setState('Blocked'); return; }
      if (target.acceptMU(typed)) {
        from.totalProcessed++;
        from.statistics.output();
        if (from.currentLoad === 0) from.setState('Empty');
        from.notifyUpstream();
      }
    };
  }

  private async drain(runId: number): Promise<void> {
    while (this.ffRunning && runId === this.ffRunId) {
      const count = this.manager.processEvents(2000);
      this._ffProgress = this.progress();
      if (count === 0 || this.manager.nextEventTime > this.endTime) {
        this.ffRunning = false; this._ffProgress = undefined;
        this.maybeCompleteRun();
        const resolve = this.ffResolve; this.ffResolve = null; resolve?.(true);
        return;
      }
      await yieldToBrowser();
    }
  }

  private progress(): number {
    return Number.isFinite(this.endTime) && this.endTime > 0 ? Math.min(1, this.simTime / this.endTime) : 0;
  }

  private getExperimentStore(): IndexedDBSnapshotStore {
    this.experimentStore ??= new IndexedDBSnapshotStore();
    return this.experimentStore;
  }

  private ensureRunServices(): void {
    if (this.runLifecycle) return;
    this.runLifecycle = new RunLifecycleController({
      manager: this.manager,
      getStatistics: () => this.statistics(),
      store: this.getExperimentStore(),
      getScope: () => runScopeStore.getSnapshot(),
      emit: (event, data) => {
        const host = this._topology?.host as { emit?: (name: string, payload: unknown) => void } | undefined;
        host?.emit?.(event, data);
      },
    });
    this.runLifecycle.attach();
  }

  private getBatchRunner(): DesBatchRunner {
    this.batchRunner ??= new DesBatchRunner({
      readSpec: async (model, exp) => {
        const manifest = await this.getExperimentStore().readManifest(model, exp);
        if (!manifest) return null;
        return {
          model, exp, baseSeed: manifest.baseSeed, endTime: manifest.endTime,
          replicationCount: manifest.replicationCount,
          paramOverrides: manifest.paramOverrides,
          ...(manifest.paramScript ? { paramScript: manifest.paramScript } : {}),
          enabled: manifest.enabled,
        } satisfies BatchExperimentSpec;
      },
      listEnabledExperiments: async (model) => {
        const rows = await this.listExperiments(model);
        const enabled: Array<{ model: string; exp: string }> = [];
        for (const row of rows) {
          const manifest = await this.getExperimentStore().readManifest(row.model, row.experiment);
          if (manifest?.enabled) enabled.push({ model: row.model, exp: row.experiment });
        }
        return enabled;
      },
      applyParams: (overrides) => this.applyParameterOverrides(overrides, true),
      applyScript: async (source) => {
        const { RVScriptHost } = await import('../../core/engine/rv-script-host');
        const { runParamScript } = await import('./des-param-script-runner');
        const host = await RVScriptHost.create();
        try {
          const result = runParamScript(host, source);
          if (!result.ok) return { ok: false, message: String(result.error ?? 'parameter script failed') };
          this.applyParameterOverrides(result.fields, false);
          return { ok: true };
        } finally {
          host.dispose();
        }
      },
      setSeed: (seed) => this.setMasterSeed(seed),
      beginRun: (endTime) => { this.setEndTime(endTime); this.reset(); },
      fastForward: () => this.runFastForward(),
      setScope: (scope) => {
        runScopeStore.set(() => scope
          ? { ...scope, projectId: runScopeStore.getSnapshot()?.projectId ?? null }
          : null);
      },
      suppressAutoSeed: () => {
        const previous = getDesRunSettings();
        desRunSettingsStore.set((current) => ({ ...current, seedMode: 'fixed' }));
        return () => { desRunSettingsStore.set(() => previous); };
      },
    });
    return this.batchRunner;
  }

  private applyParameterOverrides(overrides: readonly ParamOverride[], restoreBaseline: boolean): void {
    if (restoreBaseline) this.reconfigureFromExtras();
    for (const override of overrides) {
      const instance = this.liveInstances.find(({ adapter, def }) => (
        adapter.path === override.path || adapter.node.name === override.path || adapter.path.endsWith(`/${override.path}`)
      ) && (def.type === override.component || override.component === ''));
      if (!instance) throw new Error(`DES parameter target not found: ${override.path}/${override.component}`);
      const descriptor = instance.def.schema[override.field];
      const valid = descriptor?.type === 'number'
        ? typeof override.value === 'number' && Number.isFinite(override.value)
        : descriptor?.type === 'boolean'
          ? typeof override.value === 'boolean'
          : descriptor?.type === 'string'
            ? typeof override.value === 'string'
            : descriptor?.type === 'enum'
              ? typeof override.value === 'string' && Object.hasOwn(descriptor.enumMap ?? {}, override.value)
              : false;
      if (!valid) throw new Error(`DES parameter is not a compatible declared scalar: ${override.component}.${override.field}`);
      instance.self.prop[override.field] = override.value;
    }
  }

  private maybeCompleteRun(): void {
    if (!this.runLifecycle || this.manager.totalEventsProcessed === 0) return;
    const noModelEvents = !Number.isFinite(this.manager.nextModelEventTime);
    if ((this.manager.isComplete || noModelEvents) && this.manager.markCompleteNotified()) {
      this.runLifecycle.completeRun('duration-reached');
    }
  }

  private configureCapacity(adapter: MaterialFlowAdapter): void {
    const configured = adapter.def.capacity?.(adapter.self)
      ?? (typeof adapter.self.prop.MaxCapacity === 'number' ? adapter.self.prop.MaxCapacity : undefined);
    if (configured === undefined && adapter.def.kind === 'sink') {
      adapter.MaxCapacity = Number.POSITIVE_INFINITY;
      return;
    }
    if (configured === undefined) return;
    const capacity = Number(configured ?? 1);
    adapter.MaxCapacity = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : adapter.def.kind === 'sink' ? Number.POSITIVE_INFINITY : 1;
  }

  private updateSettleGate(): void {
    const scripts = this.scriptComponentSource?.() ?? [];
    const scriptNeedsSettle = scripts.some(({ adapter }) => adapter.hasDesHooks?.() !== false);
    const enabled = scriptNeedsSettle
      || this.liveInstances.some((instance) => instance.def.des?.samplesLiveGeometry === true);
    this.manager.onTimeAdvance = enabled ? (time) => this.tweens.settle(time, 'event', this._subMode === 'fastforward') : null;
  }

  private registerTweens(duration: number, raw: unknown): { handles: TweenHandle[]; muIds: number[] } {
    const one = (raw as TweenSpec | undefined)?.tween;
    const many = Array.isArray((raw as { tweens?: unknown } | undefined)?.tweens)
      ? (raw as { tweens: Array<TweenSpec['tween']> }).tweens
      : [];
    const handles: TweenHandle[] = [];
    const muIds: number[] = [];
    for (const tween of [...(one ? [one] : []), ...many]) {
      if (tween.kind === 'axes') {
        handles.push(...this.registerAxesTween(duration, tween));
        continue;
      }
      const handle = this.registerTweenSpec(duration, tween);
      if (handle >= 0) handles.push(handle);
      if ('muId' in tween && typeof tween.muId === 'number') muIds.push(tween.muId);
    }
    return { handles, muIds };
  }

  /** Compatibility hook used by existing DES behavior and contract tests. */
  _attachTweensFromData(raw: unknown, duration: number): TweenHandle[] {
    return this.registerTweens(duration, raw).handles;
  }

  private registerTweenSpec(duration: number, tween: TweenSpec['tween']): TweenHandle {
    const t0 = this.manager.currentTime;
    if (tween.kind === 'position') {
      return this.tweens.addPosition(tween.target as PositionTweenTarget | null, new Vector3(...tween.from), new Vector3(...tween.to), t0, duration, tween.muId);
    } else if (tween.kind === 'drive') {
      return this.tweens.addDrive(tween.drive as DriveTweenTarget | null, tween.from, tween.to, t0, duration);
    } else if (tween.kind === 'path') {
      // `self.pathTween()` emits `pathRef` INSTEAD of an inline sampler whenever
      // the path has a stable id — that is the JSON-safe form, and it is what
      // every registered `RVPath` produces. Failing to resolve it here handed
      // `addPath` a null sampler, which it drops silently: the DES leg still ran
      // its events, but nothing ever moved the visual along the path.
      const sampler = (tween.path as PathTweenSampler | null | undefined)
        ?? (tween.pathRef ? getDefaultPathNetwork().get(tween.pathRef) : null);
      return this.tweens.addPath(sampler ?? null, tween.target as PathTweenTarget | null, tween.fromS, tween.toS, t0, duration, tween.muId, tween.pathRef ?? '');
    }
    return -1;
  }

  private registerAxesTween(
    duration: number,
    tween: Extract<TweenSpec['tween'], { kind: 'axes' }>,
  ): TweenHandle[] {
    const handles: TweenHandle[] = [];
    const t0 = this.manager.currentTime;
    for (const phase of tween.phases) {
      for (const axis of phase.axes) {
        const drive = this.resolveDrive(axis.driveRef);
        if (!drive) {
          if (!this.warnedMissingDrives.has(axis.driveRef)) {
            this.warnedMissingDrives.add(axis.driveRef);
            console.warn(`[DES] Drive not found for axes tween: ${axis.driveRef}`);
          }
          continue;
        }
        const target = drive ? {
          setPosition(value: number): void {
            drive.currentPosition = value;
            drive.applyToNode();
          },
        } : null;
        const handle = this.tweens.addDrive(
          target,
          axis.from,
          axis.to,
          t0 + duration * phase.at0,
          duration * Math.max(0.001, phase.at1 - phase.at0),
          { writePolicy: 'finalOnly', ease: tween.ease ?? 'scurve' },
        );
        if (handle >= 0) handles.push(handle);
      }
    }
    return handles;
  }

  private resolveDrive(path: string): RVDrive | null {
    for (const instance of this.liveInstances) {
      const registry = (instance.self.viewer as { registry?: { getByPath<T>(type: string, path: string): T | null } }).registry;
      const drive = registry?.getByPath<RVDrive>('Drive', path);
      if (drive) return drive;
    }
    const registry = (this._topology?.host as { registry?: { getByPath<T>(type: string, path: string): T | null } } | undefined)?.registry;
    const drive = registry?.getByPath<RVDrive>('Drive', path);
    if (drive) return drive;
    return null;
  }

  private disposeMuVisual(mu: DESMU): void {
    const visual = mu.visual;
    if (!visual) return;
    const factory = mu.visualTemplateId ? this.visualFactories.get(mu.visualTemplateId) : undefined;
    if (factory) factory.dispose(visual);
    else (visual as { dispose?: () => void }).dispose?.();
    mu.visual = null;
  }

  private refreshHierarchyVisuals(): void {
    if (this.headlessSpawnActive) return;
    const visible = new Set<number>();
    const reveal = (mu: DESMU): void => {
      visible.add(mu.id);
      const last = [...mu.childMUs].reverse().map((ref) => this.manager.getMUByRef(ref)).find(Boolean);
      if (last) reveal(last);
    };
    for (const mu of this.manager.mus.values()) if (!this.manager.getMUByRef(mu.parentMU)) reveal(mu);
    for (const mu of this.manager.mus.values()) {
      if (visible.has(mu.id)) void this.materializeMu(mu);
      else this.disposeMuVisual(mu);
    }
  }


  private configureAttachments(): void {
    for (const attachment of this.liveInstances) {
      if (attachment.def.type === 'Processing') {
        const path = String(attachment.self.prop.targetComponentPath ?? attachment.self.prop.TargetComponentPath ?? '');
        const duration = Number(attachment.self.prop.processingTime ?? attachment.self.prop.ProcessingTime ?? 0);
        if (!(duration > 0)) throw new Error('processingTime must be greater than zero');
        const target = this.manager.getComponentByPath(path);
        if (!(target instanceof MaterialFlowAdapter)) throw new Error(`Processing target not found: ${path}`);
        target.attachedProcessingTime = duration;
        target.self.prop.attachedProcessingTime = duration;
        if (target.def.processingAttachmentPoint === 'cycle-dwell' || target.def.type === 'IndexingConveyor') {
          target.self.prop.effectiveDwellTime = Math.max(Number(target.self.prop.dwellTime ?? 0), duration);
        }
      }
      if (attachment.def.type === 'Downtime') this.armDowntime(attachment.adapter);
    }
  }

  private armDowntime(attachment: MaterialFlowAdapter): void {
    const { targetPath, mtbf, mttr } = downtimeConfig(attachment);
    const enabled = Boolean(attachment.self.prop.Enabled ?? attachment.self.prop.enabled ?? true);
    if (!enabled) return;
    if (!(mtbf > 0) || !(mttr > 0)) throw new Error('MTBF and MTTR must be greater than zero');
    const target = this.manager.getComponentByPath(targetPath);
    if (!(target instanceof MaterialFlowAdapter)) throw new Error(`Downtime target not found: ${targetPath}`);
    this.manager.scheduleIn(mtbf, DOWNTIME_FAIL, attachment.entityId);
  }

  private handleFailureChanged(adapter: MaterialFlowAdapter, failed: boolean): void {
    if (adapter.def.type === 'RobotHandling' && adapter.self.prop.cycle) return;
    if (failed) this.freezeAdapter(adapter);
    else this.resumeAdapter(adapter);
  }

  private freezeAdapter(adapter: MaterialFlowAdapter): void {
    this.tweens.settle(this.manager.currentTime, 'event', false);
    const events = this.manager.getEventQueueSnapshotForEntity(adapter.entityId);
    const activeTweens = this.tweens.toSnapshot();
    const selectedMuIds = new Set<number>();
    for (const event of events) {
      if (event.muId >= 0) selectedMuIds.add(event.muId);
      for (const id of this.scheduledRecords.get(event.id)?.tweenMuIds ?? []) selectedMuIds.add(id);
    }
    const frozenTweens = activeTweens.filter((tween) => selectedMuIds.has(tween.muId));
    const remainingTweens = activeTweens.filter((tween) => !selectedMuIds.has(tween.muId));
    this.tweens.fromSnapshot(
      remainingTweens,
      (id) => this.manager.getMU(id)?.visual ?? null,
      (id) => getDefaultPathNetwork().get(id),
    );

    adapter.frozen = events.map((event) => {
      const record = this.scheduledRecords.get(event.id);
      this.manager.cancelEvent(event.id);
      this.scheduledRecords.delete(event.id);
      const ids = new Set<number>(event.muId >= 0 ? [event.muId] : record?.tweenMuIds ?? []);
      const eventTweens = frozenTweens.filter((tween) => ids.has(tween.muId))
        .map((tween) => ({
          ...freezeTween(tween, this.manager.currentTime),
          muRef: this.muRef(tween.muId),
        }));
      const payload = {
        eventData: event.data ?? null,
        entityId: event.entityId,
        muId: event.muId,
        priority: event.priority,
      };
      return {
        action: event.actionName.startsWith('DES.') ? event.actionName : `MF.${event.actionName}`,
        muRef: event.muId >= 0 ? this.muRef(event.muId) : null,
        payload,
        remaining: Math.max(0, event.time - this.manager.currentTime),
        ...(eventTweens.length === 1 ? { tween: eventTweens[0] } : {}),
        ...(eventTweens.length > 1 ? { tweens: eventTweens } : {}),
      } satisfies FrozenDescriptor;
    });
    adapter.dispatchHook('Freeze', null, adapter.frozen);
  }

  private resumeAdapter(adapter: MaterialFlowAdapter): void {
    const frozen = [...adapter.frozen];
    adapter.frozen = [];
    for (const descriptor of frozen) {
      const payload = descriptor.payload as {
        eventData: unknown; entityId: number; muId: number; priority: number;
      };
      const action = descriptor.action.startsWith('MF.') ? descriptor.action.slice(3) : descriptor.action;
      const eventId = this.manager.scheduleEvent(
        this.manager.currentTime + Math.max(0, descriptor.remaining),
        action,
        payload.entityId,
        payload.muId,
        payload.priority,
        payload.eventData,
      );
      if (payload.eventData && typeof payload.eventData === 'object' && 'eventId' in payload.eventData) {
        (payload.eventData as ScheduledPayload).eventId = eventId;
      }
      const tweenList = descriptor.tweens ?? (descriptor.tween ? [descriptor.tween] : []);
      const handles = tweenList.map((tween) => this.restoreFrozenTween(tween, descriptor.remaining)).filter((id) => id >= 0);
      this.scheduledRecords.set(eventId, {
        entityId: payload.entityId, action, muId: payload.muId, priority: payload.priority,
        payload: payload.eventData as ScheduledPayload | null,
        tweenHandles: handles,
        tweenMuIds: tweenList.flatMap((tween) => tween.muRef ? [tween.muRef.id] : []),
      });
    }
    adapter.dispatchHook('Resume', null, frozen);
  }

  private restoreFrozenTween(tween: FrozenTweenDescriptor, duration: number): TweenHandle {
    const muId = tween.muRef?.id ?? -1;
    const target = muId >= 0 ? this.manager.getMU(muId)?.visual ?? null : null;
    if (tween.kind === 'position' && tween.from && tween.to) {
      return this.tweens.addPosition(
        target,
        new Vector3(...tween.from),
        new Vector3(...tween.to),
        this.manager.currentTime,
        duration,
        muId,
      );
    }
    if (tween.kind === 'path' && tween.pathRef) {
      return this.tweens.addPath(
        getDefaultPathNetwork().get(tween.pathRef),
        target,
        tween.fromS ?? 0,
        tween.toS ?? 0,
        this.manager.currentTime,
        duration,
        muId,
        tween.pathRef,
      );
    }
    return -1;
  }

  private muRef(id: number): MuRef | null {
    const mu = this.manager.getMU(id);
    return mu ? { id, gen: mu.generation } : null;
  }

  private warnIfUnsettled(action: string, def: MaterialFlowDefinition, mu: DESMU | null): void {
    if (!import.meta.env.DEV || this.manager.onTimeAdvance || !mu?.visual || this.warnedUnsettledTypes.has(def.type)) return;
    const active = this.tweens.devActivePositionTargets(this.manager.currentTime);
    if (!active?.has(mu.visual)) return;
    this.warnedUnsettledTypes.add(def.type);
    console.warn(`[DES] '${action}' sampled a mid-tween MU while event-time settle is disabled; declare samplesLiveGeometry`);
  }
}

function freezeTween(tween: TweenDataSnapshot, now: number): FrozenTweenDescriptor {
  const duration = Math.max(0.001, tween.t1 - tween.t0);
  const p = Math.max(0, Math.min(1, (now - tween.t0) / duration));
  if (tween.kind === 'position') {
    const from = tween.from.map((value, index) => value + (tween.to[index] - value) * p) as [number, number, number];
    return {
      kind: 'position', muRef: { id: tween.muId, gen: 0 },
      from, to: tween.to, remaining: Math.max(0, tween.t1 - now),
    };
  }
  return {
    kind: 'path', muRef: { id: tween.muId, gen: 0 }, pathRef: tween.pathRef,
    fromS: tween.fromS + (tween.toS - tween.fromS) * p,
    toS: tween.toS,
    remaining: Math.max(0, tween.t1 - now),
  };
}

function toJsonData(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonData);
  if (typeof value !== 'object') return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'target' || key === 'drive' || key === 'path' || key === 'visual' || key === 'node') continue;
    const projected = toJsonData(child);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
}

function seedConfigFromExtras(self: MaterialFlowSelf, def: MaterialFlowDefinition, node: Object3D): void {
  const raw = node.userData.realvirtual?.[def.type] as Record<string, unknown> | undefined;
  if (!raw) return;
  for (const [key, descriptor] of Object.entries(def.schema)) {
    const value = raw[key] ?? descriptor.default;
    if (value === undefined) continue;
    if (descriptor.type === 'number') self.prop[key] = Number(value);
    else if (descriptor.type === 'boolean') self.prop[key] = Boolean(value);
    else if (descriptor.type === 'componentRef') {
      self.prop[key] = typeof value === 'object' && value && typeof (value as { path?: unknown }).path === 'string'
        ? (value as { path: string }).path
        : String(value);
    } else if (descriptor.type === 'componentRefArray') {
      self.prop[key] = Array.isArray(value)
        ? value.map((entry) => typeof entry === 'object' && entry && typeof entry.path === 'string' ? entry.path : entry) as never
        : [];
    } else if (descriptor.type !== 'vector3') self.prop[key] = structuredClone(value) as never;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in self.prop) && isJson(value)) self.prop[key] = structuredClone(value);
  }
}

function downtimeConfig(owner: MaterialFlowAdapter): { targetPath: string; mtbf: number; mttr: number } {
  return {
    targetPath: String(owner.self.prop.TargetComponentPath ?? owner.self.prop.targetComponentPath ?? ''),
    mtbf: Number(owner.self.prop.MTBF ?? owner.self.prop.mtbf ?? 0),
    mttr: Number(owner.self.prop.MTTR ?? owner.self.prop.mttr ?? 0),
  };
}

function isJson(value: unknown): value is import('../../core/material-flow/material-flow-self').JsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  return typeof value === 'object' && Object.values(value as Record<string, unknown>).every(isJson);
}

declare global { var __rvThreeForDes: typeof import('three'); }
