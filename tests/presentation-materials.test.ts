// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Texture } from 'three';
import type { RVViewer } from '../src/core/rv-viewer';
import { NodeRegistry } from '../src/core/engine/rv-node-registry';
import { setAssetReference } from '../src/core/engine/rv-asset-reference';
import { AssetDocument } from '../src/core/editor/rv-asset-document';
import { __clearDraftStoresForTests } from '../src/core/ops/rv-document-drafts';
import { applyMaterialToSelection, MATERIAL_PRESETS, restoreOriginalMaterials } from '../src/core/presentation/materials';
function fixture() {
  const scene = new Scene(), root = new Group(), shared = new MeshStandardMaterial({ color: '#345678' });
  root.name = 'Equipment'; scene.add(root);
  const first = new Mesh(new BoxGeometry(), shared), second = new Mesh(new BoxGeometry(), shared);
  first.name = 'First'; second.name = 'Second'; root.add(first, second);
  const registry = new NodeRegistry(); root.traverse(n => registry.registerNode(NodeRegistry.computeNodePath(n), n));
  const viewer = { scene, registry, currentModelRoot: root, signalStore: null, transportManager: null,
    markRenderDirty() {}, markShadowsDirty() {}, emit() {}, rebuildGroupedBvh() {} } as unknown as RVViewer;
  const doc = AssetDocument.newUntitled(viewer);
  return { doc, root, first, second, shared, path: NodeRegistry.computeNodePath(first) };
}
beforeEach(async () => { await __clearDraftStoresForTests(); });
describe('presentation material editing', () => {
  it('clones shared material on write, undo/redo and original restore are document operations', async () => {
    const f = fixture();
    try {
      await applyMaterialToSelection(f.doc, [f.first], [f.path], MATERIAL_PRESETS[3].value);
      expect(f.first.material.color.getHexString()).toBe('b97850'); expect(f.second.material).toBe(f.shared);
      expect(f.shared.color.getHexString()).toBe('345678');
      await f.doc.undo(); expect(f.first.material.color.getHexString()).toBe('345678');
      await f.doc.redo(); expect(f.first.material.color.getHexString()).toBe('b97850');
      await restoreOriginalMaterials(f.doc, [f.first]); expect(f.first.material.color.getHexString()).toBe('345678');
      await f.doc.undo(); expect(f.first.material.color.getHexString()).toBe('b97850');
    } finally { f.doc.dispose(); }
  });
  it('rejects a mixed selection atomically, including textured, multislotted, referenced and runtime parts', async () => {
    const f = fixture(), rootPath = NodeRegistry.computeNodePath(f.root);
    try {
      for (const incompatible of ['texture', 'multi', 'reference', 'runtime']) {
        f.second.material = incompatible === 'multi' ? [f.shared, f.shared] as unknown as MeshStandardMaterial : f.shared;
        f.shared.map = incompatible === 'texture' ? new Texture() : null;
        f.second.userData = incompatible === 'runtime' ? { realvirtual: { Lamp: { IsOn: true } } } : {};
        if (incompatible === 'reference') setAssetReference(f.second, { assetId: 'library-other' });
        await expect(applyMaterialToSelection(f.doc, [f.root], [rootPath], MATERIAL_PRESETS[0].value)).rejects.toThrow();
        expect(f.first.material).toBe(f.shared); expect(f.doc.getSnapshot().canUndo).toBe(false);
      }
    } finally { f.doc.dispose(); }
  });
  it('does not paint meshes nested in helper groups', async () => {
    const f = fixture(), helper = new Group(); helper.name = '_Helper'; f.root.add(helper); helper.add(f.second);
    try {
      await applyMaterialToSelection(f.doc, [f.root], [NodeRegistry.computeNodePath(f.root)], MATERIAL_PRESETS[0].value);
      expect(f.first.material).not.toBe(f.shared); expect(f.second.material).toBe(f.shared);
    } finally { f.doc.dispose(); }
  });
});
