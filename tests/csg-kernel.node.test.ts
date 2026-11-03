// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0026: the built-in CSG kernel — stock, tools, subtraction volumes and a watertight, outward mesh. */
import { describe, expect, it } from 'vitest';
import { allChunks, countSolid, createGrid, resetGrid, subtract, tessellateChunk, toolSdf, type CsgGrid } from '../src/core/engine/machining-builtin/csg-kernel';
import type { MachiningGridDesc, MachiningToolSegment } from '../src/core/engine/rv-machining-registry';

const box = (res: number, size = 100): MachiningGridDesc => ({
  resolution: { x: res, y: res, z: res }, sizeMm: { x: size, y: size, z: size }, shape: 'Box', cylinderAxis: 0, meshing: 'MarchingCubes', creaseAngleDeg: 35,
});

const I = { x: 0, y: 0, z: 0, w: 1 };
function seg(grid: CsgGrid, local: { x: number; y: number; z: number }, extra: Partial<MachiningToolSegment> = {}): MachiningToolSegment {
  const p = { x: local.x - grid.origin.x, y: local.y - grid.origin.y, z: local.z - grid.origin.z };
  return { posStart: p, posEnd: p, rotStart: I, rotEnd: I, substeps: 1, radius: 10, height: 30, cornerRadius: 2, coneRadiusTop: 2, shape: 0, boundingRadius: 10, ...extra };
}

function fullMesh(grid: CsgGrid) {
  const tris: number[][] = [];
  const verts: number[][] = [];
  const normals: number[][] = [];
  for (const c of allChunks(grid)) {
    const m = tessellateChunk(grid, c);
    const base = verts.length;
    for (let v = 0; v < m.vertexCount; v++) {
      verts.push([m.positions[v * 3] + grid.origin.x, m.positions[v * 3 + 1] + grid.origin.y, m.positions[v * 3 + 2] + grid.origin.z]);
      normals.push([m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]]);
    }
    for (let t = 0; t < m.indexCount; t += 3) tris.push([base + m.indices[t], base + m.indices[t + 1], base + m.indices[t + 2]]);
  }
  return { tris, verts, normals };
}

/** Every undirected edge (by position) used exactly twice, once in each direction → closed and consistently oriented. */
function assertClosedOriented(mesh: ReturnType<typeof fullMesh>) {
  const key = (v: number[]) => v.map((x) => Math.round(x * 1e4)).join(',');
  const directed = new Map<string, number>();
  for (const t of mesh.tris) for (let e = 0; e < 3; e++) {
    const a = key(mesh.verts[t[e]]), b = key(mesh.verts[t[(e + 1) % 3]]);
    directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1);
  }
  let bad = 0;
  for (const [k, n] of directed) {
    const [a, b] = k.split('>');
    if (n !== 1 || directed.get(`${b}>${a}`) !== 1) bad++;
  }
  expect(bad).toBe(0);
}

describe('built-in CSG kernel', () => {
  it('initialises Box stock on the contract lattice (voxel = size/(res−3), origin = min − 1.5 voxel)', () => {
    const g = createGrid(box(32));
    expect(g.voxel.x).toBeCloseTo(100 / 29, 12);
    expect(g.origin.x).toBeCloseTo(-50 - 1.5 * (100 / 29), 12);
    expect(g.initialSolid).toBe(29 ** 3);
    expect(g.chunkRes).toEqual({ x: 2, y: 2, z: 2 });
  });

  it('voxelizes a closed Mesh stock like the equivalent Box', () => {
    const v = [-50, -50, -50, 50, -50, -50, 50, 50, -50, -50, 50, -50, -50, -50, 50, 50, -50, 50, 50, 50, 50, -50, 50, 50];
    const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
    const g = createGrid({ ...box(32), shape: 'Mesh', meshVerticesMm: new Float32Array(v), meshTriangles: new Int32Array(f), meshBoundsMinMm: { x: -50, y: -50, z: -50 }, meshBoundsSizeMm: { x: 100, y: 100, z: 100 } });
    expect(g.initialSolid).toBe(29 ** 3);
  });

  it('removes the volume of a sphere and of a swept capsule, and a repeated cut removes nothing', () => {
    const g = createGrid(box(64));
    const vox = g.voxel.x ** 3;
    const r = 15;
    const removed = subtract(g, [seg(g, { x: 0, y: 0, z: 0 }, { radius: r, boundingRadius: r })], new Set());
    expect(removed * vox / ((4 / 3) * Math.PI * r ** 3)).toBeGreaterThan(0.93);
    expect(removed * vox / ((4 / 3) * Math.PI * r ** 3)).toBeLessThan(1.07);
    expect(subtract(g, [seg(g, { x: 0, y: 0, z: 0 }, { radius: r, boundingRadius: r })], new Set())).toBe(0);
    expect(countSolid(g)).toBe(g.initialSolid - removed);

    const h = createGrid(box(64));
    const a = seg(h, { x: -25, y: 0, z: 0 }, { radius: 8, boundingRadius: 8 });
    const b = seg(h, { x: 25, y: 0, z: 0 });
    const groove = subtract(h, [{ ...a, posEnd: b.posEnd, substeps: 64 }], new Set());
    const capsule = Math.PI * 8 ** 2 * 50 + (4 / 3) * Math.PI * 8 ** 3;
    expect(groove * h.voxel.x ** 3 / capsule).toBeGreaterThan(0.9);
    expect(groove * h.voxel.x ** 3 / capsule).toBeLessThan(1.1);
    resetGrid(h);
    expect(countSolid(h)).toBe(h.initialSolid);
  });

  it('evaluates the tool shapes on their documented frame (axis +Y, centred, cutting end −Y)', () => {
    const base = { radius: 5, height: 40, cornerRadius: 2, coneRadiusTop: 1.5 };
    expect(toolSdf({ ...base, shape: 1 }, 0, 21, 0)).toBeCloseTo(1, 9); // cylinder cap
    expect(toolSdf({ ...base, shape: 1 }, 4, 0, 0)).toBeCloseTo(-1, 9); // cylinder wall
    expect(toolSdf({ ...base, shape: 0 }, 0, 6, 0)).toBeCloseTo(1, 9); // sphere
    expect(toolSdf({ ...base, shape: 2, cornerRadius: 5 }, 0, -20, 0)).toBeCloseTo(0, 6); // ball nose tip
    expect(toolSdf({ ...base, shape: 2, cornerRadius: 5 }, 5, 0, 0)).toBeCloseTo(0, 6); // ball nose wall
    expect(toolSdf({ ...base, shape: 2, cornerRadius: 2 }, 5, -20, 0)).toBeGreaterThan(0.5); // rounded corner
    expect(toolSdf({ ...base, shape: 3 }, 3, 0, 0)).toBeCloseTo(-2, 9); // torus tube centre
    expect(toolSdf({ ...base, shape: 3 }, 0, 0, 0)).toBeGreaterThan(0); // torus hole
    expect(toolSdf({ ...base, shape: 4 }, 5, -20, 0)).toBeCloseTo(0, 6); // cone: radius 5 at the cutting end
    expect(toolSdf({ ...base, shape: 4 }, 1.5, 20, 0)).toBeCloseTo(0, 6); // cone: coneRadiusTop at the shank
  });

  it('tessellates a closed, outward-oriented surface on the stock and after a cut', () => {
    const g = createGrid(box(40));
    let mesh = fullMesh(g);
    expect(mesh.tris.length).toBeGreaterThan(0);
    assertClosedOriented(mesh);
    for (let i = 0; i < mesh.verts.length; i++) {
      const [x, y, z] = mesh.verts[i];
      expect(Math.max(Math.abs(x), Math.abs(y), Math.abs(z))).toBeCloseTo(50, 0); // on the box surface
      const n = mesh.normals[i];
      expect(n[0] * x + n[1] * y + n[2] * z).toBeGreaterThan(0); // outward
    }
    // A sphere cut into a face corner opens a pocket; the surface stays closed.
    subtract(g, [seg(g, { x: 50, y: 50, z: 0 }, { radius: 20, boundingRadius: 20 })], new Set());
    mesh = fullMesh(g);
    assertClosedOriented(mesh);
  });

  it('marks exactly the chunks a cut touches', () => {
    const g = createGrid(box(64)); // 4×4×4 chunks
    const dirty = new Set<number>();
    subtract(g, [seg(g, { x: -40, y: -40, z: -40 }, { radius: 3, boundingRadius: 3 })], dirty);
    expect([...dirty]).toEqual([0]);
  });
});
