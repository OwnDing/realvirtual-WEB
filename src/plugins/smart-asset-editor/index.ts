// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import type { Object3D } from 'three';
import { NodeRegistry } from '../../core/engine/rv-node-registry';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { PluginContext } from '../../core/rv-plugin-context';
import type { UISlotEntry } from '../../core/rv-ui-plugin';
import type { ModeId } from '../../core/rv-mode-manager';
import type { ImportResultItem } from '../../core/import/rv-import-provider';
import { importIntoAsset } from '../../core/import/rv-import-asset';
import { AssetDocument, type AssetBase } from '../../core/editor/rv-asset-document';
import {
  getOpenDocumentBase,
  setActiveAssetContext,
  setOpenDocumentBase,
} from '../../core/editor/active-asset-store';
import { setActiveEditTarget } from '../../core/hmi/rv-edit-target';
import { takePendingAssetOpen } from '../../core/editor/pending-asset-open';
import { getEmptyGlbUrl } from '../../core/hmi/scene/empty-glb';
import { getProjectStore } from '../../core/project/project-store';
import { projectAssetUrl } from '../../core/project/rv-project-asset-source';
import { resolveAsset } from '../../core/library/library-source-registry';
import { noteLoadedRevision } from '../../core/editor/rv-save-document';
import {
  listAllDocumentDrafts,
  planStackRecovery,
  clearDocumentDraft,
  rootFrame,
} from '../../core/ops/rv-document-drafts';
import {
  chooseEditorDraft,
  chooseRecoveryRoot,
} from '../../core/editor/rv-editor-draft-recovery';
import { rvT } from '../../core/i18n';
import { installEditorDocumentView } from './editor-document-view';
import { saveAssetAs } from './save-flow';
import {
  applySmartTemplate,
  createAssemblyPort,
  createPlcSignal,
  validateSmartAsset,
  type CreatePortInput,
  type CreateSignalInput,
  type SmartAssetReport,
  type SmartTemplateId,
  type SmartTemplateOptions,
} from './smart-asset-model';
import { SmartAssetEditorButton, SmartAssetEditorPanel } from './SmartAssetEditorPanel';

export interface SmartAssetEditorSnapshot {
  status: 'inactive' | 'loading' | 'ready' | 'saving' | 'error';
  message: string | null;
  report: SmartAssetReport;
  documentVersion: number;
}

const EMPTY_REPORT = validateSmartAsset(null);

/** Public asset authoring workspace backed by the existing AssetDocument. */
export class SmartAssetEditorPlugin implements RVViewerPlugin {
  readonly id = 'asset-editor';
  readonly order = 15;
  readonly modes: ModeId[] = ['editor'];
  readonly slots: UISlotEntry[] = [
    { slot: 'activity-bar', component: SmartAssetEditorButton, order: 18 },
    { slot: 'overlay', component: SmartAssetEditorPanel, order: 18 },
  ];

  private viewer: RVViewer | null = null;
  private doc: AssetDocument | null = null;
  private generation = 0;
  private stopDocumentView: (() => void) | null = null;
  private unregisterExitGuard: (() => void) | null = null;
  private lastBase: AssetBase | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SmartAssetEditorSnapshot = {
    status: 'inactive', message: null, report: EMPTY_REPORT, documentVersion: 0,
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): SmartAssetEditorSnapshot => this.snapshot;

  get document(): AssetDocument | null { return this.doc; }

  get root(): Object3D | null { return this.viewer?.currentModelRoot ?? null; }

  init(viewer: RVViewer, _context?: PluginContext): void {
    this.viewer = viewer;
    this.unregisterExitGuard = viewer.modes.registerExitGuard('editor', async () => {
      const doc = this.doc;
      if (!doc?.dirty) return true;
      const leave = typeof window === 'undefined'
        || window.confirm(rvT('assets', 'smartEditor.confirmLeave'));
      if (!leave) return false;
      await doc.flushDraft();
      return true;
    });
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKeyDown);
  }

  onModeActivate(_mode: ModeId, _viewer: RVViewer): void {
    // ModeManager publishes `activeMode` and the mode UI context only after
    // activate hooks return. Starting `loadModel()` synchronously from this
    // hook would let clearModel() preserve the OLD mode context and remove
    // `mode:editor`, hiding every editor-only slot after the model appeared.
    // One microtask makes the load begin against the committed mode.
    queueMicrotask(() => {
      if (this.viewer?.modes.activeMode === 'editor') void this.activate();
    });
  }

  onModeDeactivate(_mode: ModeId | null, _viewer: RVViewer): void {
    this.generation++;
    this.closeDocument(true);
    this.publish({ status: 'inactive', message: null, report: EMPTY_REPORT });
  }

  dispose(): void {
    this.generation++;
    this.unregisterExitGuard?.();
    this.unregisterExitGuard = null;
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKeyDown);
    this.closeDocument(true);
    this.viewer = null;
    this.listeners.clear();
  }

  async newAsset(): Promise<void> {
    if (!this.viewer) return;
    if (this.doc?.dirty && typeof window !== 'undefined'
      && !window.confirm(rvT('assets', 'smartEditor.confirmNew'))) return;
    await this.replaceWith({ kind: 'empty' }, true);
  }

  async importItems(items: ImportResultItem[]): Promise<string[]> {
    const doc = this.requireDocument();
    this.publish({ status: 'loading', message: rvT('assets', 'smartEditor.importing') });
    try {
      const paths = await importIntoAsset(doc, items);
      this.refreshStructure();
      this.runValidation();
      this.publish({ status: 'ready', message: rvT('assets', 'smartEditor.imported') });
      return paths;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  rename(name: string): void {
    const clean = name.trim();
    if (!clean || !this.doc || clean === this.doc.name) return;
    this.doc.renameDocument(clean);
    this.bumpDocument();
  }

  async undo(): Promise<void> {
    await this.requireDocument().undo();
    this.refreshStructure();
    this.runValidation();
  }

  async redo(): Promise<void> {
    await this.requireDocument().redo();
    this.refreshStructure();
    this.runValidation();
  }

  async addPort(input: CreatePortInput): Promise<string> {
    const doc = this.requireDocument();
    const root = this.requireRoot();
    const path = await createAssemblyPort(doc, root, {
      ...input,
      parentPath: input.parentPath ?? this.selectedOrRootPath(),
    });
    this.refreshStructure();
    this.runValidation();
    this.viewer?.selectionManager.select(path);
    return path;
  }

  async addSignal(input: CreateSignalInput): Promise<string> {
    const doc = this.requireDocument();
    const root = this.requireRoot();
    const path = await createPlcSignal(doc, root, {
      ...input,
      parentPath: input.parentPath ?? this.selectedOrRootPath(),
    });
    this.refreshStructure();
    this.runValidation();
    this.viewer?.selectionManager.select(path);
    return path;
  }

  async applyTemplate(template: SmartTemplateId, options: SmartTemplateOptions): Promise<void> {
    const root = this.requireRoot();
    const target = this.selectedNode() ?? root;
    await applySmartTemplate(this.requireDocument(), root, target, template, options);
    this.refreshStructure();
    this.runValidation();
  }

  runValidation(): SmartAssetReport {
    const report = validateSmartAsset(this.root);
    this.publish({ report, status: this.doc ? 'ready' : this.snapshot.status });
    return report;
  }

  selectIssue(path: string): void {
    if (path) this.viewer?.selectionManager.select(path);
  }

  openHierarchy(): void {
    const editor = this.viewer?.getPlugin('rv-extras-editor') as { togglePanel?(): void } | undefined;
    editor?.togglePanel?.();
  }

  async save(name?: string, saveAs = false) {
    const viewer = this.viewer;
    const doc = this.requireDocument();
    if (!viewer) {
      return { status: 'error', message: rvT('assets', 'smartEditor.viewerUnavailable') } as const;
    }
    const report = this.runValidation();
    if (!report.publishable) {
      const message = rvT('assets', 'smartEditor.fixErrors', { count: report.errorCount });
      this.publish({ status: 'error', message });
      return { status: 'blocked', reason: message } as const;
    }
    const finalName = name?.trim() || doc.name;
    if (!finalName || finalName === 'Untitled') {
      const message = rvT('assets', 'smartEditor.nameRequired');
      this.publish({ status: 'error', message });
      return { status: 'blocked', reason: message } as const;
    }
    this.publish({ status: 'saving', message: rvT('assets', 'smartEditor.saving') });
    const outcome = await saveAssetAs(
      { viewer, doc },
      finalName,
      shouldPublishAsLibraryCopy(doc.base, saveAs),
    );
    if (outcome.kind === 'saved' || outcome.kind === 'no-op') {
      if (outcome.kind === 'saved') this.lastBase = outcome.base;
      this.publish({ status: 'ready', message: rvT('assets', 'smartEditor.saved') });
      return { status: outcome.kind === 'saved' ? 'saved' : 'no-op' } as const;
    }
    if (outcome.kind === 'cancelled') return { status: 'cancelled' } as const;
    const message = outcome.kind === 'blocked' ? outcome.reason
      : outcome.kind === 'conflict' || outcome.kind === 'error' ? outcome.message
        : rvT('assets', 'smartEditor.saveFailed');
    this.publish({ status: 'error', message });
    return outcome.kind === 'blocked'
      ? { status: 'blocked', reason: message } as const
      : { status: 'error', message } as const;
  }

  clearMessage(): void {
    this.publish({ message: null, status: this.doc ? 'ready' : this.snapshot.status });
  }

  private async activate(): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const generation = ++this.generation;
    this.publish({ status: 'loading', message: rvT('assets', 'smartEditor.loading') });
    try {
      const pending = takePendingAssetOpen();
      const open = getOpenDocumentBase();
      const explicit = isLoadableAssetBase(pending)
        ? pending
        : isLoadableAssetBase(open) ? open : null;
      let base = explicit;
      let recovery: Awaited<ReturnType<typeof chooseRecovery>> = null;
      if (!base) recovery = await chooseRecovery();
      if (recovery && !isLoadableAssetBase(recovery.draft.shell.base)) recovery = null;
      if (!base && recovery) base = recovery.draft.shell.base;
      base ??= this.lastBase ?? { kind: 'empty' };
      if (generation !== this.generation) return;
      await this.openBase(base, recovery, generation);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  private async replaceWith(base: AssetBase, discardCurrent: boolean): Promise<void> {
    const generation = ++this.generation;
    this.publish({ status: 'loading', message: rvT('assets', 'smartEditor.loading') });
    if (discardCurrent && this.doc) {
      await clearDocumentDraft(this.doc.draftFrame);
      this.closeDocument(false);
    }
    try {
      await this.openBase(base, null, generation);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  private async openBase(
    base: AssetBase,
    recovery: Awaited<ReturnType<typeof chooseRecovery>>,
    generation: number,
  ): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    this.closeDocument(false);
    await loadAssetBase(viewer, base);
    if (generation !== this.generation) return;

    const shell = recovery?.draft.shell;
    const doc = shell
      ? new AssetDocument(viewer, { ...shell })
      : base.kind === 'empty'
        ? AssetDocument.newUntitled(viewer)
        : new AssetDocument(viewer, {
            id: `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: nameOfBase(base),
            base,
          });
    const projectId = getProjectStore().getProject()?.id ?? null;
    doc.setDraftFrame(recovery?.frame ?? rootFrame(projectId, doc.id));
    if (recovery) await doc.replayOps(recovery.draft.ops);
    if (generation !== this.generation) { doc.dispose(); return; }

    this.doc = doc;
    this.lastBase = base;
    setActiveAssetContext({ viewer, doc });
    setActiveEditTarget({
      available: true,
      persistsTo: 'asset',
      setField: (...args) => doc.setField(...args),
      unsetField: (...args) => doc.unsetField(...args),
      withTransaction: (label, fn) => doc.withTransaction(label, fn),
      addComponent: (...args) => doc.addComponent(...args),
      removeComponent: (...args) => doc.removeComponent(...args),
      setNodeVisible: (...args) => doc.setNodeVisible(...args),
    });
    setOpenDocumentBase(base);
    this.stopDocumentView = installEditorDocumentView(viewer, doc, {
      save: (name, saveAs) => this.save(name, saveAs),
      newAsset: () => this.newAsset(),
    });
    doc.subscribe(() => this.bumpDocument());
    this.refreshStructure();
    const report = validateSmartAsset(viewer.currentModelRoot);
    this.publish({ status: 'ready', message: recovery
      ? rvT('assets', 'smartEditor.draftRecovered') : null, report });
  }

  private closeDocument(flushDraft: boolean): void {
    const doc = this.doc;
    this.doc = null;
    this.stopDocumentView?.();
    this.stopDocumentView = null;
    setActiveAssetContext(null);
    setActiveEditTarget(null);
    if (!doc) return;
    if (flushDraft && doc.dirty) void doc.flushDraft().finally(() => doc.dispose());
    else doc.dispose();
  }

  private selectedNode(): Object3D | null {
    const viewer = this.viewer;
    const path = viewer?.selectionManager.getSnapshot().primaryPath;
    return path ? viewer?.registry?.getNode(path) ?? null : null;
  }

  private selectedOrRootPath(): string {
    const root = this.requireRoot();
    return this.viewer?.selectionManager.getSnapshot().primaryPath
      ?? NodeRegistry.computeNodePath(root);
  }

  private requireDocument(): AssetDocument {
    if (!this.doc) throw new Error(rvT('assets', 'smartEditor.noAsset'));
    return this.doc;
  }

  private requireRoot(): Object3D {
    const root = this.root;
    if (!root) throw new Error(rvT('assets', 'smartEditor.noAsset'));
    return root;
  }

  private refreshStructure(): void {
    const editor = this.viewer?.getPlugin('rv-extras-editor') as { refreshEditableNodes?(): void } | undefined;
    editor?.refreshEditableNodes?.();
  }

  private bumpDocument(): void {
    this.publish({ documentVersion: this.snapshot.documentVersion + 1 });
  }

  private fail(error: unknown): void {
    console.error('[smart-asset-editor]', error);
    this.publish({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  private publish(patch: Partial<SmartAssetEditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.viewer?.modes.activeMode !== 'editor') return;
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey
      || event.key.toLowerCase() !== 's') return;
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    event.preventDefault();
    void this.save();
  };
}

type Recovery = {
  draft: NonNullable<ReturnType<typeof chooseEditorDraft>>['draft'];
  frame: NonNullable<ReturnType<typeof chooseEditorDraft>>['stack'][number]['frame'];
};

async function chooseRecovery(): Promise<Recovery | null> {
  const projectId = getProjectStore().getProject()?.id ?? null;
  const root = chooseRecoveryRoot(await listAllDocumentDrafts(), projectId);
  if (!root) return null;
  const choice = chooseEditorDraft(await planStackRecovery(root));
  if (!choice) return null;
  return { draft: choice.draft, frame: choice.stack[0].frame };
}

async function loadAssetBase(viewer: RVViewer, base: AssetBase): Promise<void> {
  if (base.kind === 'empty') {
    await viewer.loadModel(getEmptyGlbUrl(), { preserveHierarchy: true, modelName: 'Untitled.glb' });
    return;
  }
  if (base.kind === 'builtinModel') {
    await viewer.loadModel(base.url, { preserveHierarchy: true, modelName: base.name });
    return;
  }
  if (base.kind === 'document' || (base.kind === 'referencedAsset' && base.path && !base.providerId)) {
    const path = base.kind === 'document' ? base.path : base.path!;
    if (!path) throw new Error(rvT('assets', 'smartEditor.sourceUnavailable'));
    const store = getProjectStore();
    const source = await store.resolveAssetSource(path);
    if (!source) throw new Error(rvT('assets', 'smartEditor.sourceUnavailable'));
    try {
      if (source.kind === 'bytes') {
        await viewer.loadModel(projectAssetUrl(path), {
          data: source.bytes, preserveHierarchy: true, modelName: nameOfBase(base),
        });
      } else {
        await viewer.loadModel(source.url, { preserveHierarchy: true, modelName: nameOfBase(base) });
      }
      await noteLoadedRevision(store.getBackend(), path);
    } finally {
      if (source.kind === 'url') source.release();
    }
    return;
  }
  const providerId = base.kind === 'providerAsset' ? base.providerId : base.providerId;
  const sourceId = base.kind === 'providerAsset' ? base.sourceId : base.sourceId;
  if (!providerId || !sourceId) throw new Error(rvT('assets', 'smartEditor.sourceUnavailable'));
  const resolved = await resolveAsset(providerId, sourceId, base.assetId, 'edit');
  try {
    await viewer.loadModel(resolved.url, { preserveHierarchy: true, modelName: nameOfBase(base) });
  } finally {
    resolved.revokeUrl?.();
  }
}

function nameOfBase(base: AssetBase): string {
  switch (base.kind) {
    case 'document': return base.name;
    case 'builtinModel': return base.name;
    case 'providerAsset': return base.label;
    case 'referencedAsset': return base.label;
    default: return 'Untitled';
  }
}

/**
 * "Publish to Project Library" keeps owned project documents in place, but
 * never writes back to catalog or deploy-served sources. Those sources become
 * a new asset under library/Custom through the core Save-as routing.
 */
export function shouldPublishAsLibraryCopy(base: AssetBase, saveAs = false): boolean {
  if (saveAs) return true;
  return base.kind === 'builtinModel'
    || base.kind === 'providerAsset'
    || (base.kind === 'referencedAsset' && (!base.path || !!base.providerId));
}

/** Slot-addressed scene documents cannot be independently loaded as assets. */
function isLoadableAssetBase(base: AssetBase | null): base is AssetBase {
  return !!base && (base.kind !== 'document' || !!base.path);
}

export * from './smart-asset-model';
export { saveAssetAs } from './save-flow';
