// SPDX-License-Identifier: AGPL-3.0-only

/**
 * mechanism-solver — rigid-body mechanism constraint solve (ADR-0026). Pure
 * math: no Three.js, no scene graph.
 *
 * Maximal coordinates: every FREE link has a world pose (6 unknowns); static
 * links (world, links only ever used as Body A) and driven links (moved by a
 * Drive in the hierarchy) are inputs. Each joint contributes residuals, all
 * dimensionless (lengths divided by the mechanism's characteristic length L):
 *
 *   Revolute   anchors coincide (3) + B's axis parallel to A's (2) [+ imposed angle]
 *   Prismatic  relative rotation locked (3) + offset only along A's axis (2) [+ imposed travel]
 *   Spherical  anchors coincide (3)
 *   Universal  anchors coincide (3) + A's axis ⟂ B's secondary axis (1)
 *
 * A fixed number of damped Gauss–Newton iterations per tick (deterministic,
 * like the authored `SolverIterations`), warm-started from the last pose; the
 * Jacobian is a forward difference. Redundant constraints (a planar four-bar
 * in 3D) are fine for least squares and show up as rank deficiency.
 */

import { add, cross, dot, norm, qConj, qLog, qMul, qNormalize, qRotate, sub, unit, type Q, type V3 } from '../ik-builtin/chain-kinematics';

export type MechJointType = 'Revolute' | 'Prismatic' | 'Spherical' | 'Universal';
export interface Pose { pos: V3; rot: Q }

export interface SolverJoint {
  type: MechJointType;
  /** Body index of A, or −1 for the world frame. */
  a: number;
  b: number;
  anchorA: V3;
  anchorB: V3;
  axisA: V3;
  axisB: V3;
  perpA: [V3, V3];
  perpB: [V3, V3];
  /** A⁻¹·B at build time (prismatic rotation lock, angle reference). */
  relRot0: Q;
  refA: V3;
  refB: V3;
  secondaryB: V3 | null;
  /** Imposed joint value (rad or m) when a drive controls a FREE body B; null = passive. */
  imposed: number | null;
}

export interface SolverBody { pose: Pose; free: boolean }

export interface SolveOptions { iterations: number; damping: number; tolerance: number; length: number }
export interface SolveResult { converged: boolean; residual: number; iterations: number }

const WORLD: Pose = { pos: [0, 0, 0], rot: [0, 0, 0, 1] };

export function qExp(v: V3): Q {
  const angle = norm(v);
  if (angle < 1e-12) return qNormalize([v[0] / 2, v[1] / 2, v[2] / 2, 1]);
  const s = Math.sin(angle / 2) / angle;
  return [v[0] * s, v[1] * s, v[2] * s, Math.cos(angle / 2)];
}

/** Two unit vectors perpendicular to `axis` (and to each other). */
export function perpendiculars(axis: V3): [V3, V3] {
  const a = unit(axis);
  const helper: V3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const p = unit(cross(a, helper));
  return [p, cross(a, p)];
}

const poseOf = (bodies: readonly SolverBody[], i: number): Pose => (i < 0 ? WORLD : bodies[i].pose);
const point = (p: Pose, local: V3): V3 => add(p.pos, qRotate(p.rot, local));

/** Build a joint from the assembled (authored) poses; derives B-side axes and references. */
export function makeJoint(spec: {
  type: MechJointType; a: number; b: number; anchorA: V3; anchorB: V3; axisA: V3; secondaryB?: V3 | null;
}, bodies: readonly SolverBody[]): SolverJoint {
  const pa = poseOf(bodies, spec.a), pb = poseOf(bodies, spec.b);
  const axisA = norm(spec.axisA) > 0 ? unit(spec.axisA) : [0, 0, 1] as V3;
  const relRot0 = qNormalize(qMul(qConj(pa.rot), pb.rot));
  const axisB = unit(qRotate(qConj(relRot0), axisA));
  const perpA = perpendiculars(axisA);
  return {
    type: spec.type, a: spec.a, b: spec.b, anchorA: spec.anchorA, anchorB: spec.anchorB,
    axisA, axisB, perpA, perpB: perpendiculars(axisB), relRot0,
    refA: perpA[0], refB: unit(qRotate(qConj(relRot0), perpA[0])),
    secondaryB: spec.secondaryB && norm(spec.secondaryB) > 0 ? unit(spec.secondaryB) : null,
    imposed: null,
  };
}

/** Current joint value: angle (rad) for Revolute, travel (m) for Prismatic, 0 otherwise. */
export function jointValue(j: SolverJoint, bodies: readonly SolverBody[]): number {
  const pa = poseOf(bodies, j.a), pb = poseOf(bodies, j.b);
  const axis = qRotate(pa.rot, j.axisA);
  if (j.type === 'Revolute') {
    const ra = qRotate(pa.rot, j.refA), rb = qRotate(pb.rot, j.refB);
    return Math.atan2(dot(axis, cross(ra, rb)), dot(ra, rb));
  }
  if (j.type === 'Prismatic') return dot(sub(point(pb, j.anchorB), point(pa, j.anchorA)), axis);
  return 0;
}

/** World-space gap between the two anchors (m). */
export function anchorGap(j: SolverJoint, bodies: readonly SolverBody[]): number {
  return norm(sub(point(poseOf(bodies, j.b), j.anchorB), point(poseOf(bodies, j.a), j.anchorA)));
}

export function residuals(bodies: readonly SolverBody[], joints: readonly SolverJoint[], length: number): number[] {
  const r: number[] = [];
  const L = Math.max(length, 1e-6);
  for (const j of joints) {
    const pa = poseOf(bodies, j.a), pb = poseOf(bodies, j.b);
    const d = sub(point(pb, j.anchorB), point(pa, j.anchorA));
    const axis = qRotate(pa.rot, j.axisA);
    switch (j.type) {
      case 'Revolute':
        r.push(d[0] / L, d[1] / L, d[2] / L, dot(axis, qRotate(pb.rot, j.perpB[0])), dot(axis, qRotate(pb.rot, j.perpB[1])));
        if (j.imposed !== null) r.push(jointValue(j, bodies) - j.imposed);
        break;
      case 'Prismatic': {
        const rel = qLog(qMul(qConj(j.relRot0), qMul(qConj(pa.rot), pb.rot)));
        r.push(rel[0], rel[1], rel[2], dot(d, qRotate(pa.rot, j.perpA[0])) / L, dot(d, qRotate(pa.rot, j.perpA[1])) / L);
        if (j.imposed !== null) r.push((dot(d, axis) - j.imposed) / L);
        break;
      }
      case 'Spherical':
        r.push(d[0] / L, d[1] / L, d[2] / L);
        break;
      case 'Universal':
        r.push(d[0] / L, d[1] / L, d[2] / L);
        if (j.secondaryB) r.push(dot(axis, qRotate(pb.rot, j.secondaryB)));
        break;
    }
  }
  return r;
}

const maxAbs = (v: readonly number[]) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

function applyStep(bodies: SolverBody[], free: readonly number[], step: readonly number[], factor = 1): void {
  free.forEach((bi, k) => {
    const p = bodies[bi].pose;
    p.pos = [p.pos[0] + step[k * 6] * factor, p.pos[1] + step[k * 6 + 1] * factor, p.pos[2] + step[k * 6 + 2] * factor];
    p.rot = qNormalize(qMul(qExp([step[k * 6 + 3] * factor, step[k * 6 + 4] * factor, step[k * 6 + 5] * factor]), p.rot));
  });
}

/** Forward-difference Jacobian of the residuals w.r.t. the free bodies' 6-DOF increments. */
export function jacobian(bodies: SolverBody[], joints: readonly SolverJoint[], length: number): { J: number[][]; r: number[]; free: number[] } {
  const free = bodies.map((b, i) => (b.free ? i : -1)).filter((i) => i >= 0);
  const r = residuals(bodies, joints, length);
  const n = free.length * 6;
  const J: number[][] = r.map(() => new Array<number>(n).fill(0));
  const epsPos = 1e-7 * Math.max(length, 1e-3), epsRot = 1e-7;
  for (let c = 0; c < n; c++) {
    const step = new Array<number>(n).fill(0);
    const eps = c % 6 < 3 ? epsPos : epsRot;
    step[c] = eps;
    const saved = free.map((bi) => ({ pos: bodies[bi].pose.pos, rot: bodies[bi].pose.rot }));
    applyStep(bodies, free, step);
    const r2 = residuals(bodies, joints, length);
    free.forEach((bi, k) => { bodies[bi].pose = { pos: saved[k].pos, rot: saved[k].rot }; });
    for (let i = 0; i < r.length; i++) J[i][c] = (r2[i] - r[i]) / eps;
  }
  return { J, r, free };
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(m[i][c]) > Math.abs(m[piv][c])) piv = i;
    if (Math.abs(m[piv][c]) < 1e-18) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let i = c + 1; i < n; i++) {
      const f = m[i][c] / m[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) m[i][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let k = i + 1; k < n; k++) s -= m[i][k] * x[k];
    x[i] = s / m[i][i];
  }
  return x;
}

/** Damped Gauss–Newton: `iterations` steps of (JᵀJ + λ²I)Δ = −Jᵀr with a backtracking guard. */
export function solve(bodies: SolverBody[], joints: readonly SolverJoint[], opts: SolveOptions): SolveResult {
  let residual = maxAbs(residuals(bodies, joints, opts.length));
  let it = 0;
  const lambda2 = Math.max(opts.damping, 1e-6) ** 2;
  for (; it < opts.iterations && residual > opts.tolerance * 1e-3; it++) {
    const { J, r, free } = jacobian(bodies, joints, opts.length);
    const n = free.length * 6;
    if (n === 0) break;
    const H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => {
      let s = 0;
      for (let row = 0; row < J.length; row++) s += J[row][i] * J[row][k];
      return s + (i === k ? lambda2 : 0);
    }));
    const g = Array.from({ length: n }, (_, i) => { let s = 0; for (let row = 0; row < J.length; row++) s -= J[row][i] * r[row]; return s; });
    const step = solveLinear(H, g);
    if (!step) break;
    const before = free.map((bi) => ({ pos: bodies[bi].pose.pos, rot: bodies[bi].pose.rot }));
    const norm2 = (v: number[]) => v.reduce((s, x) => s + x * x, 0);
    const r0 = norm2(r);
    let factor = 1;
    for (let k = 0; k < 6; k++, factor /= 2) {
      applyStep(bodies, free, step, factor);
      if (norm2(residuals(bodies, joints, opts.length)) <= r0) break;
      free.forEach((bi, idx) => { bodies[bi].pose = { pos: before[idx].pos, rot: before[idx].rot }; });
      if (k === 5) factor = 0;
    }
    residual = maxAbs(residuals(bodies, joints, opts.length));
    if (factor === 0) break;
  }
  return { converged: residual <= opts.tolerance, residual, iterations: it };
}

/** Numerical rank of a matrix (Gaussian elimination with relative tolerance). */
export function rank(M: number[][]): number {
  if (M.length === 0 || M[0].length === 0) return 0;
  const m = M.map((row) => [...row]);
  const rows = m.length, cols = m[0].length;
  const tol = 1e-7 * Math.max(1e-12, ...m.map((row) => maxAbs(row)));
  let rk = 0;
  for (let c = 0; c < cols && rk < rows; c++) {
    let piv = rk;
    for (let i = rk + 1; i < rows; i++) if (Math.abs(m[i][c]) > Math.abs(m[piv][c])) piv = i;
    if (Math.abs(m[piv][c]) <= tol) continue;
    [m[rk], m[piv]] = [m[piv], m[rk]];
    for (let i = rk + 1; i < rows; i++) {
      const f = m[i][c] / m[rk][c];
      for (let k = c; k < cols; k++) m[i][k] -= f * m[rk][k];
    }
    rk++;
  }
  return rk;
}

/** Mobility (free DOF) and independent loops of the joint graph. */
export function topologyFigures(bodies: SolverBody[], joints: readonly SolverJoint[], length: number): { dof: number; loops: number } {
  const { J, free } = jacobian(bodies, joints, length);
  const dof = Math.max(0, free.length * 6 - rank(J));
  // Loops = E − V + C over bodies plus one world vertex.
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x) !== undefined && parent.get(x) !== x) x = parent.get(x)!; return x; };
  const vertices = new Set<number>();
  for (const j of joints) { vertices.add(j.a); vertices.add(j.b); }
  for (const v of vertices) parent.set(v, v);
  for (const j of joints) { const ra = find(j.a), rb = find(j.b); if (ra !== rb) parent.set(ra, rb); }
  const components = new Set([...vertices].map(find)).size;
  return { dof, loops: Math.max(0, joints.length - vertices.size + components) };
}

