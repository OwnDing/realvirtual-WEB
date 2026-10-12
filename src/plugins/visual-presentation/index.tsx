// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useSyncExternalStore } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Palette } from '@mui/icons-material';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { presentationMessages } from '../../core/i18n/catalogs/presentation';
import { defaultLook, parseLook, PresentationError, type PresentationLook } from '../../core/presentation/look';
import { getSessionLook, setSessionLook, subscribeSessionLook } from '../../core/presentation/session-look';
import { loadVisualSettings } from '../../core/hmi/visual-settings-store';
import { isTabLocked } from '../../core/rv-app-config';
import { currentProfileId, loadProjectLook } from '../../core/presentation/project-look';
import { getProjectStore } from '../../core/project/project-store';
import { subscribeOpenDocumentBase } from '../../core/editor/active-asset-store';
const Panel = lazy(() => import('./PresentationPanel'));
interface Snapshot { open: boolean; look: PresentationLook; active: boolean; error: string | null }
function Entry({ viewer }: UISlotProps) {
  useRvTranslation('shell'); const m = presentationMessages(getLocale());
  const plugin = viewer.getPlugin('visual-presentation') as VisualPresentationPlugin;
  const state = useSyncExternalStore(plugin.subscribe, plugin.getSnapshot);
  return <Tooltip title={m.title} placement="right"><IconButton size="small" aria-label={m.title} data-testid="presentation-button" color={state.open ? 'primary' : 'inherit'} sx={{ p: 0.75 }} onClick={() => plugin.setOpen(!state.open)}><Palette fontSize="small" /></IconButton></Tooltip>;
}
function Overlay({ viewer }: UISlotProps) {
  const plugin = viewer.getPlugin('visual-presentation') as VisualPresentationPlugin;
  const state = useSyncExternalStore(plugin.subscribe, plugin.getSnapshot);
  return state.open ? <Suspense fallback={null}><Panel viewer={viewer} plugin={plugin} /></Suspense> : null;
}

export class VisualPresentationPlugin implements RVViewerPlugin {
  readonly id = 'visual-presentation';
  readonly core = true;
  readonly slots: UISlotEntry[] = [
    { slot: 'activity-bar', component: Entry, order: 65, visibilityId: 'visual-presentation', visibilityRule: { hiddenIn: ['embed'] } },
    { slot: 'overlay', component: Overlay, order: 65 },
  ];
  private viewer: RVViewer | null = null;
  private generation = 0;
  private state: Snapshot = { open: false, look: defaultLook(), active: false, error: null };
  private listeners = new Set<() => void>();
  readonly subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  readonly getSnapshot = () => this.state;
  private publish(patch: Partial<Snapshot>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }
  private disposers: (() => void)[] = [];
  init(viewer: RVViewer) {
    this.viewer = viewer;
    let projectId = getProjectStore().getProject()?.id, backend = getProjectStore().getBackend();
    this.disposers.push(viewer.leftPanelManager.subscribe(() => {
      const open = viewer.leftPanelManager.activePanel === this.id;
      if (!open) this.cancelExports(); this.publish({ open });
    }), subscribeSessionLook(() => {
      const look = getSessionLook(); this.publish({ active: !!look, ...(look ? { look } : {}) });
    }), subscribeOpenDocumentBase(() => this.onModelLoaded()), getProjectStore().subscribe(() => {
      const next = getProjectStore().getProject()?.id, nextBackend = getProjectStore().getBackend();
      if (next === projectId && backend === nextBackend) return;
      projectId = next; backend = nextBackend; this.onModelCleared(); this.onModelLoaded();
    }));
  }
  private exports = new Set<() => void>();
  registerExport(cancel: () => void): () => void { this.exports.add(cancel); return () => { this.exports.delete(cancel); }; }
  private cancelExports() { for (const cancel of this.exports) cancel(); }
  setOpen(open: boolean) {
    if (open) this.viewer?.leftPanelManager.open(this.id, 410);
    else { this.cancelExports(); this.viewer?.leftPanelManager.close(this.id); }
    this.publish({ open });
  }
  apply(input: PresentationLook) {
    if (!this.viewer) return;
    if (isTabLocked('visual')) throw new PresentationError('locked');
    const look = parseLook(input), quality = this.viewer.adaptiveQuality.getSnapshot(), previous = getSessionLook();
    this.viewer.adaptiveQuality.setMode('manual');
    try { setSessionLook(look); this.viewer.applyVisualSettings(loadVisualSettings()); }
    catch (error) { setSessionLook(previous); this.viewer.applyVisualSettings(loadVisualSettings()); throw error; }
    finally { this.viewer.adaptiveQuality.setMode(quality.mode, quality.tier); }
    this.generation++; this.viewer.markRenderDirty(); this.publish({ look, active: true, error: null });
  }
  async restoreProject() {
    const generation = ++this.generation, root = this.viewer?.currentModelRoot;
    const look = await loadProjectLook(currentProfileId());
    if (generation !== this.generation || root !== this.viewer?.currentModelRoot) return;
    if (look) this.apply(look);
    else this.onModelCleared();
  }
  onModelLoaded() {
    if (!this.viewer || isTabLocked('visual')) return;
    const pending = this.restoreProject(), generation = this.generation;
    this.viewer.trackLoadingWork(pending.catch(error => {
      if (generation === this.generation) this.publish({ error: error instanceof PresentationError ? error.code : 'storage' });
    }));
  }
  onModelCleared() {
    this.cancelExports(); this.generation++;
    setSessionLook(null);
    if (this.viewer) {
      const quality = this.viewer.adaptiveQuality.getSnapshot(); this.viewer.adaptiveQuality.setMode('manual');
      this.viewer.applyVisualSettings(loadVisualSettings()); this.viewer.adaptiveQuality.setMode(quality.mode, quality.tier);
    }
    this.publish({ look: defaultLook(), active: false, error: null });
  }
  dispose() { this.disposers.splice(0).forEach(fn => fn()); setSessionLook(null); this.generation++; this.setOpen(false); this.viewer = null; this.listeners.clear(); }
}
