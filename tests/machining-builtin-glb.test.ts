// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0026: the built-in CSG kernel in a REAL module worker, on the volumes of
 * the demo model (a 128×32×128 Box stock requesting DualContouring and a
 * 48×128×48 Mesh stock voxelized from its own render geometry).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { loadGLB, type LoadResult } from '../src/core/engine/rv-scene-loader';
import type { RVMachiningVolume } from '../src/core/engine/rv-machining-volume';
import { BuiltinMachiningProvider } from '../src/core/engine/machining-builtin/builtin-machining-provider';
import { isIdleAck, type MachiningChunkMeshBatch, type MachiningGridHandle, type MachiningSubtractAck } from '../src/core/engine/rv-machining-registry';
import { DEV_GLB } from './fixtures/glb-paths.mjs';

let result: LoadResult | null = null;
let volumes: RVMachiningVolume[] = [];
const provider = new BuiltinMachiningProvider();

beforeAll(async () => {
  const url = DEV_GLB.csgMachining;
  const bytes = await (await fetch(url)).arrayBuffer();
  result = await loadGLB(url, new Scene(), { data: bytes, preserveHierarchy: true });
  volumes = result.registry.getAll<RVMachiningVolume>('MachiningVolume').map((v) => v.instance);
  await provider.init();
}, 60000);

afterAll(() => provider.dispose());

/** Collect batches/acks until the worker reports idle. */
function untilIdle(grid: MachiningGridHandle, timeoutMs = 30000) {
  const batches: MachiningChunkMeshBatch[] = [];
  const acks: MachiningSubtractAck[] = [];
  const offB = provider.onChunkMeshes(grid, (b) => batches.push(b));
  let offA = () => {};
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker did not go idle')), timeoutMs);
    offA = provider.onAck(grid, (a) => { acks.push(a); if (isIdleAck(a)) { clearTimeout(timer); resolve(); } });
  });
  return { batches, acks, done: done.finally(() => { offB(); offA(); }) };
}

describe('built-in machining in a real worker on the demo volumes', () => {
  it('finds the two demo volumes', () => {
    expect(volumes.map((v) => v.Shape).sort()).toEqual(['Box', 'Mesh']);
  });

  for (const shape of ['Box', 'Mesh'] as const) {
    it(`${shape} stock: builds the grid, meshes the workpiece and cuts where the tool goes`, async () => {
      const volume = volumes.find((v) => v.Shape === shape)!;
      const desc = volume.buildGridDesc();
      const grid = await provider.createGrid(desc);
      const initial = untilIdle(grid);
      await initial.done;
      const chunks = initial.batches.flatMap((b) => b.chunks);
      expect(chunks.length).toBeGreaterThan(0);
      expect(initial.batches.every((b) => b.epoch === 0)).toBe(true);
      expect(grid.initialSolidVoxels).toBeGreaterThan(0);
      if (shape === 'Box') {
        const r = grid.resolution;
        expect(grid.initialSolidVoxels).toBe((r.x - 3) * (r.y - 3) * (r.z - 3));
      } else {
        // Every vertex lies within the stock's own bounds (plus one voxel).
        const min = desc.meshBoundsMinMm!, size = desc.meshBoundsSizeMm!;
        const o = grid.gridOriginMm, v = grid.voxelSizeMm;
        for (const c of chunks) for (let i = 0; i < c.vertexCount; i++) {
          const x = c.positions[i * 3] + o.x, y = c.positions[i * 3 + 1] + o.y, z = c.positions[i * 3 + 2] + o.z;
          expect(x).toBeGreaterThan(min.x - v.x); expect(x).toBeLessThan(min.x + size.x + v.x);
          expect(y).toBeGreaterThan(min.y - v.y); expect(y).toBeLessThan(min.y + size.y + v.y);
          expect(z).toBeGreaterThan(min.z - v.z); expect(z).toBeLessThan(min.z + size.z + v.z);
        }
      }

      // Plunge a Ø20 cylinder into the middle of the stock.
      const centre = {
        x: (shape === 'Mesh' ? desc.meshBoundsMinMm!.x + desc.meshBoundsSizeMm!.x / 2 : 0) - grid.gridOriginMm.x,
        y: (shape === 'Mesh' ? desc.meshBoundsMinMm!.y + desc.meshBoundsSizeMm!.y / 2 : 0) - grid.gridOriginMm.y,
        z: (shape === 'Mesh' ? desc.meshBoundsMinMm!.z + desc.meshBoundsSizeMm!.z / 2 : 0) - grid.gridOriginMm.z,
      };
      const cut = untilIdle(grid);
      const I = { x: 0, y: 0, z: 0, w: 1 };
      expect(provider.submitSubtract(grid, { segments: [{ posStart: centre, posEnd: centre, rotStart: I, rotEnd: I, substeps: 1, radius: 10, height: 60, cornerRadius: 2, coneRadiusTop: 0, shape: 1, boundingRadius: Math.hypot(10, 30) }] }).accepted).toBe(true);
      await cut.done;
      const ack = cut.acks.find((a) => a.seq >= 0)!;
      expect(ack.removedVoxels).toBeGreaterThan(0);
      expect(cut.batches.flatMap((b) => b.chunks).length).toBeGreaterThan(0);
      expect(await provider.countSolid(grid)).toBe(grid.initialSolidVoxels - ack.removedVoxels);
      await provider.destroyGrid(grid);
    }, 60000);
  }
});
