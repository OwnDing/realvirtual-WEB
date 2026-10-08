// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { gltfLoader } from '../src/core/engine/rv-glb-parse';
import { loadGLB } from '../src/core/engine/rv-scene-loader';
import { ModelLoadState } from '../src/core/engine/rv-load-session';
import { objectToGlb } from '../src/core/import/rv-import-object';

describe('cancellation across asynchronous GLTF decoding', () => {
  it('disposes decoded resources and never attaches a cancelled model', async () => {
    const source = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    source.add(mesh);
    const data = await objectToGlb(source);
    mesh.geometry.dispose();
    mesh.material.dispose();
    const state = new ModelLoadState(),
      session = state.begin(),
      scene = new Scene();
    const parse = gltfLoader.parseAsync.bind(gltfLoader);
    const released: ReturnType<typeof vi.fn>[] = [];
    const spy = vi.spyOn(gltfLoader, 'parseAsync').mockImplementation(async (...args) => {
      const result = await parse(...args);
      result.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        for (const resource of [
          node.geometry,
          ...(Array.isArray(node.material) ? node.material : [node.material]),
        ]) {
          const disposed = vi.fn();
          released.push(disposed);
          resource.addEventListener('dispose', disposed);
        }
      });
      session.cancel();
      return result;
    });
    try {
      await expect(
        loadGLB('memory://cancelled.glb', scene, { data, loadSession: session }),
      ).rejects.toThrow('cancelled');
      expect(scene.children).toEqual([]);
      expect(released.length).toBeGreaterThan(0);
      for (const disposed of released) expect(disposed).toHaveBeenCalledOnce();
      expect(state.getSnapshot().phase).toBe('cancelled');
    } finally {
      spy.mockRestore();
      state.dispose();
    }
  });
});
