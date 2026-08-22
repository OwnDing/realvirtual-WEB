// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import type { RVViewer } from '../../core/rv-viewer';
import type { AssetDocument } from '../../core/editor/rv-asset-document';
import {
  clearActiveDocumentViewFor,
  documentLocationCrumbs,
  setActiveDocumentView,
  type ActiveDocumentSaveOutcome,
  type NamePrompt,
} from '../../core/editor/active-document-view';
import { decideSaveVerb } from '../../core/editor/rv-save-document';
import { exportAssetGlb } from '../../core/editor/rv-asset-glb-export';
import { downloadAssetGlb, sanitizeAssetFileName } from '../../core/editor/rv-asset-library-save';
import { getProjectStore } from '../../core/project/project-store';
import { rvT } from '../../core/i18n';

export interface EditorDocumentActions {
  save(name?: string, saveAs?: boolean): Promise<ActiveDocumentSaveOutcome>;
  newAsset(): Promise<void>;
}

/** Publish the core document card from a public editor document. */
export function installEditorDocumentView(
  viewer: RVViewer,
  doc: AssetDocument,
  actions: EditorDocumentActions,
): () => void {
  const publish = (): void => {
    const snap = doc.getSnapshot();
    const decision = decideSaveVerb(
      { lineage: 'asset', base: doc.base, name: doc.name },
      getProjectStore().getBackend(),
    );
    const save = async (prompt?: NamePrompt): Promise<ActiveDocumentSaveOutcome> => {
      let name: string | undefined;
      if ((!doc.name || doc.name === 'Untitled') && prompt) {
        name = (await prompt('', rvT('assets', 'smartEditor.namePrompt'))) ?? undefined;
        if (!name) return { status: 'cancelled' };
      }
      return actions.save(name);
    };
    setActiveDocumentView({
      name: snap.name,
      crumbs: [{
        index: 0,
        label: snap.name,
        occurrence: '',
        referenceNodeId: null,
        dirty: snap.dirty,
        stale: false,
        current: true,
      }],
      location: documentLocationCrumbs(doc.base),
      dirty: snap.dirty,
      busy: snap.busy,
      stackDirty: snap.dirty,
      stale: false,
      saveVerb: decision.verb,
      saveReason: decision.reason,
      sourceMode: 'editor',
      canUndo: snap.canUndo,
      canRedo: snap.canRedo,
      undoLabel: snap.undoLabel,
      redoLabel: snap.redoLabel,
      actions: {
        save,
        undo: () => doc.undo(),
        redo: () => doc.redo(),
        menu: [
          {
            id: 'save-as',
            label: rvT('assets', 'smartEditor.saveAs'),
            prompt: { title: rvT('assets', 'smartEditor.saveAs'), initial: doc.name },
            run: async name => { if (name) await actions.save(name, true); },
          },
          {
            id: 'download',
            label: rvT('assets', 'smartEditor.download'),
            run: async () => { await downloadAssetGlb(viewer, doc, doc.name); },
          },
          {
            id: 'new',
            label: rvT('assets', 'smartEditor.newAsset'),
            run: () => actions.newAsset(),
          },
        ],
        share: {
          suggestedName: `${sanitizeAssetFileName(doc.name)}.glb`,
          level: 'assembly',
          getBytes: async meta => {
            const root = viewer.currentModelRoot;
            if (!root) throw new Error(rvT('assets', 'smartEditor.noAsset'));
            return exportAssetGlb(root, doc.name, meta as never);
          },
        },
        exportGlb: {
          fileName: `${sanitizeAssetFileName(doc.name)}.glb`,
          run: async () => {
            const root = viewer.currentModelRoot;
            if (!root) throw new Error(rvT('assets', 'smartEditor.noAsset'));
            return exportAssetGlb(root, doc.name);
          },
        },
      },
    });
  };
  publish();
  const unsubscribe = doc.subscribe(publish);
  return () => {
    unsubscribe();
    clearActiveDocumentViewFor('editor');
  };
}
