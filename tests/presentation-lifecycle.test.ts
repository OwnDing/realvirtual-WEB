// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, expect, it } from 'vitest';
import { LeftPanelManager } from '../src/core/hmi/left-panel-manager';
import { Group } from 'three';
import type { RVViewer } from '../src/core/rv-viewer';
import { VisualPresentationPlugin } from '../src/plugins/visual-presentation';
import { defaultLook } from '../src/core/presentation/look';
import { getSessionLook } from '../src/core/presentation/session-look';
import { documentBase, setOpenDocumentBase } from '../src/core/editor/active-asset-store';
import { installFakeDocumentProject, type FakeDocumentProject } from './helpers/fake-document-project';
import { saveProjectLook } from '../src/core/presentation/project-look';
let fixture: FakeDocumentProject | undefined, plugin: VisualPresentationPlugin | undefined;
afterEach(() => { plugin?.dispose(); plugin = undefined; fixture?.restore(); fixture = undefined; setOpenDocumentBase(null); });
it('applies a document profile after identity publication, cancels on close and restores on model clear', async () => {
  fixture = installFakeDocumentProject(); await saveProjectLook(defaultLook('product'));
  fixture.writeForeign(fixture.project().settingsRef!.ref, JSON.stringify({
    $schema: 'rv-project-config/1.0', presentation: defaultLook('product'),
    modelProfiles: { doc_one: { presentation: defaultLook('technical') } },
  }));
  const pending: Promise<unknown>[] = [];
  const viewer = { leftPanelManager: new LeftPanelManager(), currentModelRoot: new Group(), markRenderDirty() {}, applyVisualSettings() {},
    adaptiveQuality: { getSnapshot: () => ({ mode: 'manual', tier: 0 }), setMode() {} },
    trackLoadingWork: (p: Promise<unknown>) => pending.push(p),
  } as unknown as RVViewer;
  plugin = new VisualPresentationPlugin(); plugin.init(viewer);
  plugin.onModelLoaded(); while (pending.length) await Promise.all(pending.splice(0));
  expect(plugin.getSnapshot().look.style).toBe('product');
  setOpenDocumentBase(documentBase('doc_one', 'Document')); while (pending.length) await Promise.all(pending.splice(0));
  expect(plugin.getSnapshot().look.style).toBe('technical');
  let cancelled = 0; plugin.registerExport(() => cancelled++); plugin.setOpen(false); expect(cancelled).toBe(1);
  plugin.onModelCleared(); expect(cancelled).toBe(2); expect(getSessionLook()).toBeNull(); expect(plugin.getSnapshot().active).toBe(false);
});
it('does not overwrite a newer user choice with an in-flight project restore', async () => {
  fixture = installFakeDocumentProject(); await saveProjectLook(defaultLook('product'));
  const viewer = { leftPanelManager: new LeftPanelManager(), currentModelRoot: new Group(), markRenderDirty() {}, applyVisualSettings() {},
    adaptiveQuality: { getSnapshot: () => ({ mode: 'manual', tier: 0 }), setMode() {} }, trackLoadingWork() {},
  } as unknown as RVViewer;
  plugin = new VisualPresentationPlugin(); plugin.init(viewer);
  const pending = plugin.restoreProject(); plugin.apply(defaultLook('dark')); await pending;
  expect(plugin.getSnapshot().look.style).toBe('dark');
});
