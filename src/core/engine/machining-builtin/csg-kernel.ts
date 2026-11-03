// SPDX-License-Identifier: AGPL-3.0-only

/**
 * csg-kernel — the community CSG material-removal kernel (ADR-0026).
 *
 * Pure TypeScript, no DOM, no Three.js: it runs inside the machining worker and
 * directly in Node tests. Same geometry conventions as the machining contract
 * (`rv-machining-registry.ts`):
 *
 * - The workpiece is a signed distance field sampled on `resolution` lattice
 *   points (negative = material). `voxel = domain / (res − 3)`, grid point
 *   (0,0,0) sits at `domainMin − 1.5·voxel` (volume-local mm). All kernel
 *   coordinates are GRID space mm (`local − gridOrigin`).
 * - Cutting is `sdf = max(sdf, −tool)` for every sampled tool pose.
 * - Tools: axis = local +Y, centred on the node origin, cutting end at −Y
 *   (BallNose rounds that end with `CornerRadius`, ConicalEnd narrows from
 *   `radius` at the cutting end to `coneRadiusTop` at the shank, Torus is a ring
 *   of outer radius `radius` and tube radius `CornerRadius` in the XZ plane).
 * - Surfaces are extracted per 16³ chunk with Marching Cubes; the 256-case
 *   table is generated at load time by tracing face segments (ambiguous faces
 *   separate the material corners on both sides, so neighbouring cells always
 *   agree and the surface is watertight). Normals are the SDF gradient and every
 *   triangle is wound outward. `DualContouring` and crease splitting are
 *   accepted in the descriptor but extracted the same way.
 */

import { MACHINING_CHUNK_SIZE, type MachiningChunkMesh, type MachiningGridDesc, type MachiningToolSegment } from '../rv-machining-registry';

export interface Int3 { x: number; y: number; z: number }
export interface Vec3 { x: number; y: number; z: number }

const C = MACHINING_CHUNK_SIZE;

// ─── Analytic SDFs ─────────────────────────────────────────────────────────

const len2 = (x: number, y: number): number => Math.sqrt(x * x + y * y);

function sdBox(px: number, py: number, pz: number, hx: number, hy: number, hz: number): number {
  const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0);
}

/** Capped cylinder along Y: radius r, half-height h. */
function sdCylinderY(x: number, y: number, z: number, r: number, h: number): number {
  const dx = len2(x, z) - r, dy = Math.abs(y) - h;
  return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0));
}

/** Capped cone along Y: radius r1 at y = −h, r2 at y = +h (Quílez). */
function sdCappedCone(x: number, y: number, z: number, h: number, r1: number, r2: number): number {
  const qx = len2(x, z), qy = y;
  const k1x = r2, k1y = h;
  const k2x = r2 - r1, k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
  const t = Math.max(0, Math.min(1, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2x * k2x + k2y * k2y)));
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

/** Tool SDF in tool-local mm. */
export function toolSdf(seg: Pick<MachiningToolSegment, 'shape' | 'radius' | 'height' | 'cornerRadius' | 'coneRadiusTop'>, x: number, y: number, z: number): number {
  const r = seg.radius;
  const h = Math.max(seg.height, 0) / 2;
  switch (seg.shape) {
    case 0: return Math.sqrt(x * x + y * y + z * z) - r; // Sphere
    case 2: { // BallNose: cylinder whose cutting end (−Y) is rounded by rc (rc = r → full ball)
      const rc = Math.max(0, Math.min(seg.cornerRadius > 0 ? seg.cornerRadius : r, r, h));
      const shaft = sdCylinderY(x, y - rc / 2, z, r, h - rc / 2);
      const yb = -h + rc;
      const ring = len2(Math.max(len2(x, z) - (r - rc), 0), y - yb) - rc;
      const tip = y < yb ? ring : Math.max(ring, sdCylinderY(x, y - yb / 2, z, r, Math.abs(yb) / 2 + rc));
      return Math.min(shaft, tip);
    }
    case 3: { // Torus in the XZ plane: outer radius r, tube radius rc
      const rc = Math.max(1e-6, Math.min(seg.cornerRadius, r));
      return len2(len2(x, z) - (r - rc), y) - rc;
    }
    case 4: return sdCappedCone(x, y, z, Math.max(h, 1e-6), r, Math.max(0, seg.coneRadiusTop)); // ConicalEnd
    case 1:
    default: return sdCylinderY(x, y, z, r, h); // Cylinder
  }
}

// ─── Grid ──────────────────────────────────────────────────────────────────

export interface CsgGrid {
  res: Int3;
  chunkRes: Int3;
  voxel: Vec3;
  /** Volume-local mm of grid point (0,0,0). */
  origin: Vec3;
  sdf: Float32Array;
  initial: Float32Array;
  initialSolid: number;
  /** Chunks that produced triangles at their last tessellation. */
  meshed: Uint8Array;
}

export function clampResolution(v: number): number {
  return Math.max(4, Math.min(256, Math.round(Number.isFinite(v) ? v : 64)));
}

export function createGrid(desc: MachiningGridDesc): CsgGrid {
  const res = { x: clampResolution(desc.resolution.x), y: clampResolution(desc.resolution.y), z: clampResolution(desc.resolution.z) };
  const mesh = desc.shape === 'Mesh' && desc.meshVerticesMm && desc.meshTriangles && desc.meshBoundsMinMm && desc.meshBoundsSizeMm;
  const size = mesh ? desc.meshBoundsSizeMm! : desc.sizeMm;
  const min = mesh ? desc.meshBoundsMinMm! : { x: -desc.sizeMm.x / 2, y: -desc.sizeMm.y / 2, z: -desc.sizeMm.z / 2 };
  const voxel = { x: Math.max(size.x, 1e-6) / (res.x - 3), y: Math.max(size.y, 1e-6) / (res.y - 3), z: Math.max(size.z, 1e-6) / (res.z - 3) };
  const origin = { x: min.x - 1.5 * voxel.x, y: min.y - 1.5 * voxel.y, z: min.z - 1.5 * voxel.z };
  const n = res.x * res.y * res.z;
  const sdf = new Float32Array(n);
  if (mesh) {
    voxelizeMesh(sdf, res, voxel, origin, desc.meshVerticesMm!, desc.meshTriangles!);
  } else {
    const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
    const cx = min.x + hx, cy = min.y + hy, cz = min.z + hz;
    const axis = desc.shape === 'Cylinder' ? desc.cylinderAxis : -1;
    let i = 0;
    for (let k = 0; k < res.z; k++) for (let j = 0; j < res.y; j++) for (let ii = 0; ii < res.x; ii++, i++) {
      const px = origin.x + ii * voxel.x - cx, py = origin.y + j * voxel.y - cy, pz = origin.z + k * voxel.z - cz;
      if (axis < 0) { sdf[i] = sdBox(px, py, pz, hx, hy, hz); continue; }
      // Cylinder inscribed in the domain box, lying along `axis`.
      const [a, b, c, ha, rb] = axis === 0 ? [px, py, pz, hx, Math.min(hy, hz)] : axis === 1 ? [py, px, pz, hy, Math.min(hx, hz)] : [pz, px, py, hz, Math.min(hx, hy)];
      const dr = len2(b, c) - rb, da = Math.abs(a) - ha;
      sdf[i] = Math.min(Math.max(dr, da), 0) + len2(Math.max(dr, 0), Math.max(da, 0));
    }
  }
  const grid: CsgGrid = {
    res,
    chunkRes: { x: Math.ceil(res.x / C), y: Math.ceil(res.y / C), z: Math.ceil(res.z / C) },
    voxel, origin, sdf, initial: sdf.slice(), initialSolid: 0,
    meshed: new Uint8Array(Math.ceil(res.x / C) * Math.ceil(res.y / C) * Math.ceil(res.z / C)),
  };
  grid.initialSolid = countSolid(grid);
  return grid;
}

export function resetGrid(grid: CsgGrid): void {
  grid.sdf.set(grid.initial);
}

export function countSolid(grid: CsgGrid): number {
  let n = 0;
  for (let i = 0; i < grid.sdf.length; i++) if (grid.sdf[i] < 0) n++;
  return n;
}

export function chunkCount(grid: CsgGrid): number {
  return grid.chunkRes.x * grid.chunkRes.y * grid.chunkRes.z;
}

/** Every chunk that may hold surface (used after create/reset to rebuild the whole mesh). */
export function allChunks(grid: CsgGrid): number[] {
  return Array.from({ length: chunkCount(grid) }, (_, i) => i);
}

// ─── Mesh stock voxelization ───────────────────────────────────────────────

function pointTriangleDistance(px: number, py: number, pz: number, t: Float64Array): number {
  // Ericson, Real-Time Collision Detection 5.1.5 — closest point on triangle.
  const ax = t[0], ay = t[1], az = t[2], bx = t[3], by = t[4], bz = t[5], cx = t[6], cy = t[7], cz = t[8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; } else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
    else if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz); }
    else { const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
  }
  return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2);
}

/**
 * Signed distance to a closed triangle soup: exact distance in a narrow band of
 * two voxels around the surface (clamped beyond it), inside/outside by ray
 * parity along +X. Open or self-intersecting stock is voxelized best-effort.
 */
function voxelizeMesh(sdf: Float32Array, res: Int3, voxel: Vec3, origin: Vec3, vertices: Float32Array, triangles: Int32Array): void {
  const triCount = Math.floor(triangles.length / 3);
  const band = 2 * Math.max(voxel.x, voxel.y, voxel.z);
  const dist = new Float32Array(sdf.length).fill(band);
  const tri = new Float64Array(9);
  const load = (t: number) => {
    for (let v = 0; v < 3; v++) {
      const idx = triangles[t * 3 + v] * 3;
      tri[v * 3] = vertices[idx] - origin.x; tri[v * 3 + 1] = vertices[idx + 1] - origin.y; tri[v * 3 + 2] = vertices[idx + 2] - origin.z;
    }
  };
  // Crossing lists per (y, z) row; rows are offset by a tiny fraction of a voxel to avoid hitting edges exactly.
  const rows: number[][] = Array.from({ length: res.y * res.z }, () => []);
  const ey = voxel.y * 1.37e-4, ez = voxel.z * 2.71e-4;
  for (let t = 0; t < triCount; t++) {
    load(t);
    const minX = Math.min(tri[0], tri[3], tri[6]), maxX = Math.max(tri[0], tri[3], tri[6]);
    const minY = Math.min(tri[1], tri[4], tri[7]), maxY = Math.max(tri[1], tri[4], tri[7]);
    const minZ = Math.min(tri[2], tri[5], tri[8]), maxZ = Math.max(tri[2], tri[5], tri[8]);
    const i0 = Math.max(0, Math.floor((minX - band) / voxel.x)), i1 = Math.min(res.x - 1, Math.ceil((maxX + band) / voxel.x));
    const j0 = Math.max(0, Math.floor((minY - band) / voxel.y)), j1 = Math.min(res.y - 1, Math.ceil((maxY + band) / voxel.y));
    const k0 = Math.max(0, Math.floor((minZ - band) / voxel.z)), k1 = Math.min(res.z - 1, Math.ceil((maxZ + band) / voxel.z));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const py = j * voxel.y, pz = k * voxel.z;
      for (let i = i0; i <= i1; i++) {
        const idx = i + j * res.x + k * res.x * res.y;
        const d = pointTriangleDistance(i * voxel.x, py, pz, tri);
        if (d < dist[idx]) dist[idx] = d;
      }
      // Row crossing: intersect the line (y, z) = (py + ey, pz + ez) with the triangle in YZ.
      const ry = py + ey, rz = pz + ez;
      const y0 = tri[1], z0 = tri[2], y1 = tri[4], z1 = tri[5], y2 = tri[7], z2 = tri[8];
      const den = (y1 - y0) * (z2 - z0) - (y2 - y0) * (z1 - z0);
      if (Math.abs(den) < 1e-18) continue;
      const u = ((ry - y0) * (z2 - z0) - (y2 - y0) * (rz - z0)) / den;
      const v = ((y1 - y0) * (rz - z0) - (ry - y0) * (z1 - z0)) / den;
      if (u < 0 || v < 0 || u + v > 1) continue;
      rows[j + k * res.y].push(tri[0] + u * (tri[3] - tri[0]) + v * (tri[6] - tri[0]));
    }
  }
  for (let k = 0; k < res.z; k++) for (let j = 0; j < res.y; j++) {
    const xs = rows[j + k * res.y].sort((a, b) => a - b);
    let c = 0;
    for (let i = 0; i < res.x; i++) {
      const x = i * voxel.x;
      while (c < xs.length && xs[c] < x) c++;
      const idx = i + j * res.x + k * res.x * res.y;
      sdf[idx] = (c % 2 === 1 ? -1 : 1) * dist[idx];
    }
  }
}

// ─── Subtraction ───────────────────────────────────────────────────────────

function slerp(a: MachiningToolSegment['rotStart'], b: MachiningToolSegment['rotEnd'], t: number): [number, number, number, number] {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let d = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0: number, s1: number;
  if (d > 0.9995) { s0 = 1 - t; s1 = t; } else {
    const th = Math.acos(Math.min(1, d)), sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn;
  }
  const x = a.x * s0 + bx * s1, y = a.y * s0 + by * s1, z = a.z * s0 + bz * s1, w = a.w * s0 + bw * s1;
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

/**
 * Apply ordered tool segments. Returns the number of lattice points that went
 * from material to empty and marks every chunk whose cells saw a change.
 */
export function subtract(grid: CsgGrid, segments: readonly MachiningToolSegment[], dirty: Set<number>): number {
  const { res, voxel, sdf } = grid;
  let removed = 0;
  for (const seg of segments) {
    if (!(seg.radius > 0)) continue;
    const steps = Math.max(1, Math.floor(seg.substeps) || 1);
    const br = Math.max(seg.boundingRadius, seg.radius);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = seg.posStart.x + (seg.posEnd.x - seg.posStart.x) * t;
      const py = seg.posStart.y + (seg.posEnd.y - seg.posStart.y) * t;
      const pz = seg.posStart.z + (seg.posEnd.z - seg.posStart.z) * t;
      const [qx, qy, qz, qw] = slerp(seg.rotStart, seg.rotEnd, t);
      const i0 = Math.max(0, Math.floor((px - br) / voxel.x)), i1 = Math.min(res.x - 1, Math.ceil((px + br) / voxel.x));
      const j0 = Math.max(0, Math.floor((py - br) / voxel.y)), j1 = Math.min(res.y - 1, Math.ceil((py + br) / voxel.y));
      const k0 = Math.max(0, Math.floor((pz - br) / voxel.z)), k1 = Math.min(res.z - 1, Math.ceil((pz + br) / voxel.z));
      if (i0 > i1 || j0 > j1 || k0 > k1) continue;
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        // Tool-local point: rotate (p − pos) by the conjugate quaternion.
        const vx = i * voxel.x - px, vy = j * voxel.y - py, vz = k * voxel.z - pz;
        const tx = 2 * (-qy * vz + qz * vy), ty = 2 * (-qz * vx + qx * vz), tz = 2 * (-qx * vy + qy * vx);
        const lx = vx + qw * tx + (-qy * tz + qz * ty), ly = vy + qw * ty + (-qz * tx + qx * tz), lz = vz + qw * tz + (-qx * ty + qy * tx);
        const cut = -toolSdf(seg, lx, ly, lz);
        const idx = i + j * res.x + k * res.x * res.y;
        const old = sdf[idx];
        if (cut > old) {
          sdf[idx] = cut;
          if (old < 0 && cut >= 0) removed++;
          markDirty(grid, i, j, k, dirty);
        }
      }
    }
  }
  return removed;
}

/** A lattice point is a corner of the cells (i−1..i, …): mark every chunk owning one of them. */
function markDirty(grid: CsgGrid, i: number, j: number, k: number, dirty: Set<number>): void {
  const { chunkRes } = grid;
  const cx1 = Math.min(Math.floor(i / C), chunkRes.x - 1), cx0 = Math.max(0, Math.floor((i - 1) / C));
  const cy1 = Math.min(Math.floor(j / C), chunkRes.y - 1), cy0 = Math.max(0, Math.floor((j - 1) / C));
  const cz1 = Math.min(Math.floor(k / C), chunkRes.z - 1), cz0 = Math.max(0, Math.floor((k - 1) / C));
  for (let cz = cz0; cz <= cz1; cz++) for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) dirty.add(cx + cy * chunkRes.x + cz * chunkRes.x * chunkRes.y);
}

// ─── Marching cubes (table generated by face tracing) ──────────────────────

/** Corner c sits at (c&1, c>>1&1, c>>2&1). Edge e joins EDGES[e][0] → EDGES[e][1]. */
const EDGES: Array<[number, number]> = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);
const edgeOf = (a: number, b: number): number => EDGES.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));

/** Faces as cyclic corner lists. */
const FACES: number[][] = [];
for (const d of [1, 2, 4]) {
  const [u, v] = [1, 2, 4].filter((b) => b !== d);
  for (const base of [0, d]) FACES.push([base, base + u, base + u + v, base + v]);
}

/** For each of the 256 cases: closed loops of edge indices. */
const CASE_LOOPS: number[][][] = [];
for (let mask = 0; mask < 256; mask++) {
  const inside = (c: number) => ((mask >> c) & 1) === 1;
  const adj = new Map<number, number[]>();
  const link = (e1: number, e2: number) => {
    (adj.get(e1) ?? adj.set(e1, []).get(e1)!).push(e2);
    (adj.get(e2) ?? adj.set(e2, []).get(e2)!).push(e1);
  };
  for (const f of FACES) {
    const crossings: number[] = [];
    for (let n = 0; n < 4; n++) if (inside(f[n]) !== inside(f[(n + 1) % 4])) crossings.push(n);
    if (crossings.length === 2) {
      link(edgeOf(f[crossings[0]], f[(crossings[0] + 1) % 4]), edgeOf(f[crossings[1]], f[(crossings[1] + 1) % 4]));
    } else if (crossings.length === 4) {
      // Ambiguous face: cut off each material corner separately.
      for (let n = 0; n < 4; n++) {
        if (!inside(f[n])) continue;
        link(edgeOf(f[(n + 3) % 4], f[n]), edgeOf(f[n], f[(n + 1) % 4]));
      }
    }
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const next = adj.get(cur)!.find((e) => e !== prev && !(e === start && loop.length < 3) && (!seen.has(e) || e === start));
      if (next === undefined || next === start) break;
      loop.push(next); seen.add(next); prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  CASE_LOOPS.push(loops);
}

/** Tessellate one chunk into an outward-wound triangle mesh (grid-space mm). */
export function tessellateChunk(grid: CsgGrid, chunkIndex: number): MachiningChunkMesh {
  const { res, voxel, sdf, chunkRes } = grid;
  const cx = chunkIndex % chunkRes.x, cy = Math.floor(chunkIndex / chunkRes.x) % chunkRes.y, cz = Math.floor(chunkIndex / (chunkRes.x * chunkRes.y));
  const i0 = cx * C, j0 = cy * C, k0 = cz * C;
  const i1 = Math.min(i0 + C, res.x - 1), j1 = Math.min(j0 + C, res.y - 1), k1 = Math.min(k0 + C, res.z - 1);
  const sx = 1, sy = res.x, sz = res.x * res.y;
  const at = (i: number, j: number, k: number) => sdf[i * sx + j * sy + k * sz];
  const grad = (i: number, j: number, k: number): [number, number, number] => {
    const gx = (at(Math.min(i + 1, res.x - 1), j, k) - at(Math.max(i - 1, 0), j, k)) / voxel.x;
    const gy = (at(i, Math.min(j + 1, res.y - 1), k) - at(i, Math.max(j - 1, 0), k)) / voxel.y;
    const gz = (at(i, j, Math.min(k + 1, res.z - 1)) - at(i, j, Math.max(k - 1, 0))) / voxel.z;
    return [gx, gy, gz];
  };
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const vertexOf = new Map<number, number>();
  const corner = new Float64Array(8);
  for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      corner[c] = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
      if (corner[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    for (const loop of CASE_LOOPS[mask]) {
      const ids = loop.map((e) => {
        const [a, b] = EDGES[e];
        const ai = i + (a & 1), aj = j + ((a >> 1) & 1), ak = k + ((a >> 2) & 1);
        const axis = (b - a) === 1 ? 0 : (b - a) === 2 ? 1 : 2;
        const key = (ai * sx + aj * sy + ak * sz) * 3 + axis;
        let id = vertexOf.get(key);
        if (id === undefined) {
          const va = corner[a], vb = corner[b];
          const t = Math.abs(va - vb) < 1e-20 ? 0.5 : va / (va - vb);
          const bi = i + (b & 1), bj = j + ((b >> 1) & 1), bk = k + ((b >> 2) & 1);
          const x = (ai + (bi - ai) * t) * voxel.x, y = (aj + (bj - aj) * t) * voxel.y, z = (ak + (bk - ak) * t) * voxel.z;
          const ga = grad(ai, aj, ak), gb = grad(bi, bj, bk);
          let nx = ga[0] + (gb[0] - ga[0]) * t, ny = ga[1] + (gb[1] - ga[1]) * t, nz = ga[2] + (gb[2] - ga[2]) * t;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          id = pos.length / 3;
          pos.push(x, y, z);
          nrm.push(nx, ny, nz);
          // Triplanar UVs: project on the plane facing the dominant normal axis (1 unit = 100 mm).
          const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
          if (ax >= ay && ax >= az) uv.push(z / 100, y / 100); else if (ay >= az) uv.push(x / 100, z / 100); else uv.push(x / 100, y / 100);
          vertexOf.set(key, id);
        }
        return id;
      });
      for (let n = 1; n + 1 < ids.length; n++) {
        let a = ids[0], b = ids[n], c = ids[n + 1];
        if (a === b || b === c || a === c) continue;
        // Wind outward: the face normal must agree with the SDF gradient.
        const e1x = pos[b * 3] - pos[a * 3], e1y = pos[b * 3 + 1] - pos[a * 3 + 1], e1z = pos[b * 3 + 2] - pos[a * 3 + 2];
        const e2x = pos[c * 3] - pos[a * 3], e2y = pos[c * 3 + 1] - pos[a * 3 + 1], e2z = pos[c * 3 + 2] - pos[a * 3 + 2];
        const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
        const gx = nrm[a * 3] + nrm[b * 3] + nrm[c * 3], gy = nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1], gz = nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2];
        if (fx * gx + fy * gy + fz * gz < 0) { const tmp = b; b = c; c = tmp; }
        idx.push(a, b, c);
      }
    }
  }
  grid.meshed[chunkIndex] = idx.length > 0 ? 1 : 0;
  return {
    chunkIndex,
    vertexCount: pos.length / 3,
    indexCount: idx.length,
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
  };
}
