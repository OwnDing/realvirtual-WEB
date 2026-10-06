// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportAssetGlb } from '../src/core/editor/rv-asset-glb-export';
import { objectToGlb } from '../src/core/import/rv-import-object';
import { getAssetReference, setAssetReference } from '../src/core/engine/rv-asset-reference';
import { loadGLB } from '../src/core/engine/rv-scene-loader';
import { preflightDemoGlb } from '../src/core/demo-package/preflight';

describe('demo snapshot export', () => {
  it('embeds resolved references on the clone, preserves materials/identity and keeps live reference flags', async () => {
    const asset = new Group(); asset.name = 'Subassembly';
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#12ab34', metalness: 0.7 }));
    mesh.name = 'Housing'; mesh.userData.realvirtual = { NodeId: 'housing-stable', Custom: { author: 'roundtrip' } }; asset.add(mesh);
    const assetBytes = await objectToGlb(asset);
    const root = new Group(); root.name = 'Plant'; const reference = new Object3D(); reference.name = 'Machine'; setAssetReference(reference, { assetId: 'machine', path: 'machine.glb' }); root.add(reference);
    const loaded = await loadGLB('plant.glb', new Scene(), { data: await objectToGlb(root), preserveHierarchy: true, loadKinematicsSidecar: false,
      referenceResolver: async () => ({ bytes: assetBytes, url: 'machine.glb', sha256: 'actual-hash', signatureState: 'none', signaturePresent: false }) });
    const frames = loaded.composition!.frames; expect(frames.length).toBe(1);
    const before = JSON.stringify(getAssetReference(frames[0].referenceNode));
    const output = await exportAssetGlb(loaded.root, 'Plant', undefined, undefined, { embedReferences: frames });
    expect(JSON.stringify(getAssetReference(frames[0].referenceNode))).toBe(before);
    preflightDemoGlb(new Uint8Array(output));
    const parsed = (await new GLTFLoader().parseAsync(output, '')).scene;
    const copy = parsed.getObjectByName('Housing') as Mesh;
    expect(copy).toBeDefined(); expect(copy.userData.realvirtual.NodeId).toBe('housing-stable'); expect(copy.userData.realvirtual.Custom.author).toBe('roundtrip');
    expect((copy.material as MeshStandardMaterial).color.getHexString()).toBe('12ab34');
    expect(getAssetReference(parsed.getObjectByName('Machine')!)?.sha256).toBe('actual-hash');
    expect(getAssetReference(parsed.getObjectByName('Machine')!)?.embedded).toBe(true);
    setAssetReference(frames[0].referenceNode, { ...getAssetReference(frames[0].referenceNode)!, embedded: true });
    await exportAssetGlb(loaded.root, 'Again', undefined, undefined, { embedReferences: frames });
    expect(getAssetReference(frames[0].referenceNode)?.embedded).toBe(true);
    loaded.composition?.dispose();
  });
  it('keeps an unresolved reference observable so preflight blocks the incomplete demo', async () => {
    const root = new Group(); const node = new Object3D(); setAssetReference(node, { assetId: 'missing' }); root.add(node);
    const output = await exportAssetGlb(root, 'Missing', undefined, undefined, { embedReferences: [] });
    expect(() => preflightDemoGlb(new Uint8Array(output))).toThrow('reference');
    expect(getAssetReference(node)?.embedded).toBeUndefined();
  });
});
