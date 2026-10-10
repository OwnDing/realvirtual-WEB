// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, vi } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { gltfLoader } from '../src/core/engine/rv-glb-parse';
import { loadGLB } from '../src/core/engine/rv-scene-loader';
import { ModelLoadState } from '../src/core/engine/rv-load-session';
import { objectToGlb } from '../src/core/import/rv-import-object';
import { framePerformancePreview } from '../src/core/hmi/performance-preview';

describe('overview framing', () => {
  it.each([
    { size: [10, 30, 3], aspect: 16 / 9 },
    { size: [100, 2, 3], aspect: 9 / 16 },
    { size: [2, 100, 3], aspect: 9 / 16 },
    { size: [3, 2, 100], aspect: 16 / 9 },
    { size: [0.01, 0.01, 0.01], aspect: 1 },
    { size: [100, 100, 100], aspect: 1 / 1080 },
  ])('keeps all model bounds visible for $size at aspect $aspect', ({ size, aspect }) => {
    const bounds = new Box3().setFromCenterAndSize(new Vector3(35, -21, 8), new Vector3(...size)),
      camera = new PerspectiveCamera(45);
    framePerformancePreview(camera, bounds, aspect);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(Math.abs(projected.z)).toBeLessThan(1);
        }
  });
});

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
