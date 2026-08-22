// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, Scene } from 'three';
import type { RVViewer } from '../src/core/rv-viewer';
import { NodeRegistry } from '../src/core/engine/rv-node-registry';
import {
  SmartAssetEditorPlugin,
  shouldPublishAsLibraryCopy,
} from '../src/plugins/smart-asset-editor';
import { getActiveAssetContext, setOpenDocumentBase } from '../src/core/editor/active-asset-store';
import { getActiveEditTarget } from '../src/core/hmi/rv-edit-target';
import { getActiveDocumentView, resetActiveDocumentViewForTests } from '../src/core/editor/active-document-view';
import { resetPendingAssetOpenForTests } from '../src/core/editor/pending-asset-open';
import { __clearDraftStoresForTests } from '../src/core/ops/rv-document-drafts';

function viewerFixture() {
  const scene = new Scene();
  let root: Group | null = null;
  let registry = new NodeRegistry();
  let primaryPath: string | null = null;
  let exitGuard: ((from: 'editor', to: 'planner') => boolean | Promise<boolean>) | null = null;
  const viewer = {
    scene,
    get registry() { return registry; },
    set registry(value: NodeRegistry) { registry = value; },
    get currentModelRoot() { return root; },
    modes: {
      activeMode: 'editor',
      registerExitGuard(_id: string, guard: typeof exitGuard) { exitGuard = guard; return () => { exitGuard = null; }; },
    },
    selectionManager: {
      getSnapshot: () => ({ primaryPath, selectedPaths: primaryPath ? [primaryPath] : [] }),
      select: (path: string) => { primaryPath = path; },
    },
    async loadModel() {
      scene.clear();
      root = new Group(); root.name = 'Untitled';
      const mesh = new Mesh(new BoxGeometry(1, 1, 1)); mesh.name = 'Body'; root.add(mesh);
      scene.add(root);
      registry = new NodeRegistry();
      root.traverse(node => registry.registerNode(NodeRegistry.computeNodePath(node), node));
      return {};
    },
    getPlugin: () => undefined,
    markRenderDirty() {},
    markShadowsDirty() {},
    emit() {},
    rebuildGroupedBvh() {},
    signalStore: null,
    transportManager: null,
  } as unknown as RVViewer;
  return { viewer, getRoot: () => root, getExitGuard: () => exitGuard };
}

beforeEach(async () => {
  await __clearDraftStoresForTests();
  setOpenDocumentBase(null);
  resetPendingAssetOpenForTests();
  resetActiveDocumentViewForTests();
});

describe('SmartAssetEditorPlugin public lifecycle', () => {
  it('publishes foreign sources as Library copies while preserving owned document paths', () => {
    expect(shouldPublishAsLibraryCopy({ kind: 'empty' })).toBe(false);
    expect(shouldPublishAsLibraryCopy({
      kind: 'document', documentId: 'doc', path: 'library/Custom/Pump.glb', name: 'Pump',
    })).toBe(false);
    expect(shouldPublishAsLibraryCopy({ kind: 'builtinModel', url: '/Pump.glb', name: 'Pump' })).toBe(true);
    expect(shouldPublishAsLibraryCopy({
      kind: 'providerAsset', providerId: 'remote', sourceId: 'main', assetId: 'pump', label: 'Pump',
    })).toBe(true);
    expect(shouldPublishAsLibraryCopy({ kind: 'empty' }, true)).toBe(true);
  });

  it('opens an untitled document, installs shared editor seams, authors a port, and releases them', async () => {
    const fixture = viewerFixture();
    const plugin = new SmartAssetEditorPlugin();
    plugin.init(fixture.viewer);
    plugin.onModeActivate('editor', fixture.viewer);

    await vi.waitFor(() => expect(plugin.getSnapshot().status).toBe('ready'));
    expect(plugin.document).not.toBeNull();
    expect(getActiveAssetContext()?.doc).toBe(plugin.document);
    expect(getActiveEditTarget().persistsTo).toBe('asset');
    expect(getActiveDocumentView()?.sourceMode).toBe('editor');
    expect(fixture.getExitGuard()).not.toBeNull();

    await plugin.addPort({
      portId: 'fixture.in', typeId: 'fixture-v1', flow: 'in',
      position: [0, 0, -0.5], direction: [0, 0, -1],
    });
    expect(plugin.getSnapshot().report.portCount).toBe(1);
    expect(fixture.getRoot()?.children.some(node => node.name === 'Snap-ZN-fixture-v1')).toBe(true);

    plugin.onModeDeactivate('editor', fixture.viewer);
    expect(getActiveAssetContext()).toBeNull();
    expect(getActiveDocumentView()).toBeNull();
    expect(getActiveEditTarget().persistsTo).not.toBe('asset');
    plugin.dispose();
  });
});
