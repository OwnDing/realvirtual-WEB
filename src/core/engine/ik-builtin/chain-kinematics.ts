// SPDX-License-Identifier: AGPL-3.0-only

/**
 * chain-kinematics — forward and inverse kinematics of a 6-revolute serial
 * chain described by {@link JointChainParams} (ADR-0026).
 *
 * The chain comes from the scene graph (`RVRobotIK.getJointChain()`), so every
 * solution is computed — and verified — in exactly the frame the robot is drawn
 * in. Nothing here assumes an OPW/DH convention: the analytic solver derives the
 * screw axes of the product-of-exponentials model from the chain and solves the
 * spherical-wrist case with Paden–Kahan subproblems; the numerical solver is a
 * damped least-squares (Levenberg–Marquardt) iteration on the same FK.
 *
 * FK convention (identical to the scene graph and to the Cobot ABI):
 *   G0 = T(home0)·R(homeRot0)·R(dir0, θ0); Gi = G(i-1)·T(homei)·R(homeRoti)·R(diri, θi)
 *   TCP = G5·T(tcpLocalOffset)·R(tcpLocalRot)
 * Angles in degrees at the boundary, radians inside. Lengths in meters.
 */

import type { JointChainParams } from '../rv-ik-solver';

export type V3 = [number, number, number];
export type Q = [number, number, number, number]; // x, y, z, w

const DEG = Math.PI / 180;

// ─── Vector / quaternion helpers ───────────────────────────────────────────

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; };

export function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const qConj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
export function qAxisAngle(axis: V3, rad: number): Q {
  const s = Math.sin(rad / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(rad / 2)];
}
export function qRotate(q: Q, v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export function qNormalize(q: Q): Q {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
/** Rotation vector (axis × angle, radians) of q, shortest way round. */
export function qLog(q: Q): V3 {
  const s = q[3] < 0 ? -1 : 1; // same rotation, take the hemisphere with w >= 0
  const x = q[0] * s, y = q[1] * s, z = q[2] * s, w = Math.min(1, q[3] * s);
  const sinHalf = Math.hypot(x, y, z);
  if (sinHalf < 1e-12) return [2 * x, 2 * y, 2 * z];
  const angle = 2 * Math.atan2(sinHalf, w);
  return [x / sinHalf * angle, y / sinHalf * angle, z / sinHalf * angle];
}
/** Rodrigues rotation of v about unit axis w by rad. */
function rotateAbout(w: V3, rad: number, v: V3): V3 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const wxv = cross(w, v);
  const k = dot(w, v) * (1 - c);
  return [v[0] * c + wxv[0] * s + w[0] * k, v[1] * c + wxv[1] * s + w[1] * k, v[2] * c + wxv[2] * s + w[2] * k];
}

// ─── Chain access ──────────────────────────────────────────────────────────

const homePos = (c: JointChainParams, i: number): V3 => [c.axisHomePos[i * 3], c.axisHomePos[i * 3 + 1], c.axisHomePos[i * 3 + 2]];
const homeRot = (c: JointChainParams, i: number): Q => [c.axisHomeRot[i * 4], c.axisHomeRot[i * 4 + 1], c.axisHomeRot[i * 4 + 2], c.axisHomeRot[i * 4 + 3]];
const axisDir = (c: JointChainParams, i: number): V3 => unit([c.axisDir[i * 3], c.axisDir[i * 3 + 1], c.axisDir[i * 3 + 2]]);

export interface Pose { pos: V3; rot: Q }
export interface FkFrames { origins: V3[]; axes: V3[]; tcp: Pose }

/** Forward kinematics; also returns every joint's origin and world axis (for the Jacobian). */
export function forward(chain: JointChainParams, anglesDeg: ArrayLike<number>, tcpOffset: V3, tcpRot: Q): FkFrames {
  const origins: V3[] = [];
  const axes: V3[] = [];
  let pos: V3 = [0, 0, 0];
  let rot: Q = [0, 0, 0, 1];
  for (let i = 0; i < 6; i++) {
    pos = add(pos, qRotate(rot, homePos(chain, i)));
    rot = qMul(rot, homeRot(chain, i));
    const dir = axisDir(chain, i);
    origins.push(pos);
    axes.push(qRotate(rot, dir));
    rot = qMul(rot, qAxisAngle(dir, (anglesDeg[i] ?? 0) * DEG));
  }
  return { origins, axes, tcp: { pos: add(pos, qRotate(rot, tcpOffset)), rot: qNormalize(qMul(rot, tcpRot)) } };
}

/** Position (m) and orientation (rad) error between two poses. */
export function poseError(a: Pose, b: Pose): { pos: number; rot: number } {
  return { pos: norm(sub(a.pos, b.pos)), rot: norm(qLog(qMul(b.rot, qConj(a.rot)))) };
}

/** Wrap to (-180, 180]. */
export function wrapDeg(a: number): number {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

// ─── Paden–Kahan subproblems (rotations about axes through the origin) ─────

/** Subproblem 1: angle rotating u onto v about unit axis w (components along w ignored). */
function sp1(w: V3, u: V3, v: V3): number {
  const up = sub(u, scale(w, dot(w, u)));
  const vp = sub(v, scale(w, dot(w, v)));
  return Math.atan2(dot(w, cross(up, vp)), dot(up, vp));
}

/** Subproblem 2: (θa, θb) with R(wa,θa)·R(wb,θb)·u = v. Up to two solutions. */
function sp2(wa: V3, wb: V3, u: V3, v: V3): Array<[number, number]> {
  const ab = dot(wa, wb);
  const den = ab * ab - 1;
  const n = cross(wa, wb);
  const n2 = dot(n, n);
  if (Math.abs(den) < 1e-12 || n2 < 1e-12) return [];
  const alpha = (ab * dot(wb, u) - dot(wa, v)) / den;
  const beta = (ab * dot(wa, v) - dot(wb, u)) / den;
  let g2 = (dot(u, u) - alpha * alpha - beta * beta - 2 * alpha * beta * ab) / n2;
  if (g2 < 0) {
    if (g2 < -1e-9) return [];
    g2 = 0;
  }
  const out: Array<[number, number]> = [];
  for (const sign of g2 === 0 ? [1] : [1, -1]) {
    const z = add(add(scale(wa, alpha), scale(wb, beta)), scale(n, sign * Math.sqrt(g2)));
    out.push([sp1(wa, z, v), sp1(wb, u, z)]);
  }
  return out;
}

// ─── Geometry analysis of the chain ────────────────────────────────────────

interface Screws { q: V3[]; w: V3[]; tcp0: Pose; scale: number }

function screwsAtHome(chain: JointChainParams, tcpOffset: V3, tcpRot: Q): Screws {
  const f = forward(chain, [0, 0, 0, 0, 0, 0], tcpOffset, tcpRot);
  let scaleLen = 0;
  for (let i = 1; i < 6; i++) scaleLen += norm(sub(f.origins[i], f.origins[i - 1]));
  scaleLen += norm(sub(f.tcp.pos, f.origins[5]));
  return { q: f.origins, w: f.axes, tcp0: f.tcp, scale: Math.max(scaleLen, 1e-6) };
}

/** Closest points between two lines (p + s·u, q + t·v). */
function closestPoints(p: V3, u: V3, q: V3, v: V3): [V3, V3] | null {
  const w0 = sub(p, q);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w0), e = dot(v, w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-12) return null;
  const s = (b * e - c * d) / den;
  const t = (a * e - b * d) / den;
  return [add(p, scale(u, s)), add(q, scale(v, t))];
}

/**
 * Common point of the three wrist axes, or the best approximation and its
 * misfit. A spherical wrist has misfit ≈ 0; the Cobot solver uses the
 * approximation only to seed its numerical solve.
 */
export function wristCenter(s: Screws): { point: V3; misfit: number } | null {
  const pairs: Array<[number, number]> = [[3, 4], [4, 5], [3, 5]];
  const pts: V3[] = [];
  for (const [i, j] of pairs) {
    const cp = closestPoints(s.q[i], s.w[i], s.q[j], s.w[j]);
    if (cp) pts.push(cp[0], cp[1]);
  }
  if (pts.length === 0) return null;
  const center = scale(pts.reduce((acc, p) => add(acc, p), [0, 0, 0] as V3), 1 / pts.length);
  let misfit = 0;
  for (let i = 3; i < 6; i++) {
    const d = sub(center, s.q[i]);
    misfit = Math.max(misfit, norm(sub(d, scale(s.w[i], dot(d, s.w[i])))));
  }
  return { point: center, misfit };
}

export interface ChainSolution { angles: number[]; reachable: boolean; posError: number; rotError: number }

function within(angle: number, lo: number, hi: number): number | null {
  for (const candidate of [angle, angle - 360, angle + 360]) if (candidate >= lo - 1e-9 && candidate <= hi + 1e-9) return candidate;
  return null;
}

/** Apply joint limits (trying ±360°); returns adjusted angles or null when a joint cannot satisfy them. */
export function fitLimits(chain: JointChainParams, angles: number[]): number[] | null {
  if (!chain.jointLimits) return angles;
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const v = within(angles[i], chain.jointLimits.lower[i], chain.jointLimits.upper[i]);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

// ─── Analytic solve (spherical wrist, joints 2 ∥ 3) ────────────────────────

export interface AnalyticResult {
  /** 8 slots: shoulder (2) × elbow (2) × wrist (2); unsolvable slots are null. */
  branches: Array<number[] | null>;
  /** Why the chain is not eligible (null when it is). */
  ineligible: string | null;
}

/**
 * Closed-form inverse kinematics. Requires a spherical wrist (axes 4–6 meet in
 * a point) and parallel axes 2 and 3 — the geometry of the usual 6-axis
 * industrial arm, with or without shoulder/elbow offsets. Returns raw branch
 * angles in degrees (not yet limit-checked or verified).
 */
export function solveAnalytic(chain: JointChainParams, target: Pose, tcpOffset: V3, tcpRot: Q, forceWrist?: V3): AnalyticResult {
  const s = screwsAtHome(chain, tcpOffset, tcpRot);
  const tol = 1e-6 * s.scale;
  const wc = forceWrist ? { point: forceWrist, misfit: 0 } : wristCenter(s);
  if (!wc || wc.misfit > Math.max(tol, 1e-7)) return { branches: [], ineligible: 'wrist axes do not intersect (non-spherical wrist)' };
  if (norm(cross(s.w[1], s.w[2])) > 1e-6) return { branches: [], ineligible: 'axes 2 and 3 are not parallel' };

  // Wrist centre target: the wrist centre is fixed in the TCP frame.
  const pw0 = wc.point;
  const wcInTcp = qRotate(qConj(s.tcp0.rot), sub(pw0, s.tcp0.pos));
  const pw = add(target.pos, qRotate(target.rot, wcInTcp));

  const [q1, q2, q3] = [s.q[0], s.q[1], s.q[2]];
  const [w1, w2] = [s.w[0], s.w[1]];
  const branches: Array<number[] | null> = [];

  // θ1: after undoing θ1 the wrist centre must keep its home component along axis 2.
  const d = sub(pw, q1);
  const A = dot(d, sub(w2, scale(w1, dot(w1, w2))));
  const B = dot(d, cross(w1, w2));
  const C = dot(d, w1) * dot(w1, w2);
  const rhs = dot(sub(pw0, q1), w2) - C;
  const r = Math.hypot(A, B);
  let theta1s: number[];
  if (r < tol) theta1s = [0, Math.PI]; // shoulder singularity: θ1 free — pick a representative
  else if (Math.abs(rhs) > r * (1 + 1e-12)) theta1s = [];
  else {
    const phi = Math.atan2(B, A);
    const delta = Math.acos(Math.max(-1, Math.min(1, rhs / r)));
    theta1s = [phi + delta, phi - delta];
  }

  for (let si = 0; si < 2; si++) {
    const t1 = theta1s[si];
    if (t1 === undefined) { for (let k = 0; k < 4; k++) branches.push(null); continue; }
    // Target wrist centre expressed with θ1 undone.
    const x = add(rotateAbout(w1, -t1, sub(pw, q1)), q1);
    // θ3 (Paden–Kahan 3 in the plane ⟂ w2): |R3·(pw0−q3) + q3 − q2|⊥ = |x − q2|⊥.
    const perp = (v: V3): V3 => sub(v, scale(w2, dot(w2, v)));
    const u = perp(sub(pw0, q3));
    const v = perp(sub(q2, q3));
    const delta = norm(perp(sub(x, q2)));
    const nu = norm(u), nv = norm(v);
    let theta3s: number[] = [];
    if (nu > tol && nv > tol) {
      const cosArg = (nu * nu + nv * nv - delta * delta) / (2 * nu * nv);
      if (Math.abs(cosArg) <= 1 + 1e-9) {
        const theta0 = Math.atan2(dot(w2, cross(u, v)), dot(u, v));
        const ac = Math.acos(Math.max(-1, Math.min(1, cosArg)));
        theta3s = [theta0 - ac, theta0 + ac];
      }
    }
    for (let ei = 0; ei < 2; ei++) {
      const t3 = theta3s[ei];
      if (t3 === undefined) { branches.push(null, null); continue; }
      const p3 = add(rotateAbout(w2, t3, sub(pw0, q3)), q3);
      const t2 = sp1(w2, sub(p3, q2), sub(x, q2));
      // Remaining wrist rotation R4·R5·R6 = (R1R2R3)ᵀ · Rtarget · Rtcp0ᵀ (all in base axes at home).
      const r123 = qMul(qMul(qAxisAngle(w1, t1), qAxisAngle(w2, t2)), qAxisAngle(s.w[2], t3));
      const rRem = qMul(qMul(qConj(r123), target.rot), qConj(s.tcp0.rot));
      const [w4, w5, w6] = [s.w[3], s.w[4], s.w[5]];
      const wrist = sp2(w4, w5, w6, qRotate(rRem, w6));
      for (let wi = 0; wi < 2; wi++) {
        const pair = wrist[wi] ?? (wi === 1 ? wrist[0] : undefined);
        if (!pair) { branches.push(null); continue; }
        const [t4, t5] = pair;
        const r45 = qMul(qAxisAngle(w4, t4), qAxisAngle(w5, t5));
        const ref: V3 = unit(Math.abs(w6[0]) < 0.9 ? cross(w6, [1, 0, 0]) : cross(w6, [0, 1, 0]));
        const t6 = sp1(w6, ref, qRotate(qMul(qConj(r45), rRem), ref));
        branches.push([t1, t2, t3, t4, t5, t6].map((a) => wrapDeg(a / DEG)));
      }
    }
  }
  return { branches, ineligible: null };
}

// ─── Numerical solve (damped least squares) ────────────────────────────────

export interface NumericOptions {
  maxIterations: number;
  /** Position tolerance (m). */
  tolerance: number;
  /** Orientation tolerance (rad). */
  orientationTolerance: number;
  /** Weight of 1 rad of orientation error relative to 1 m of position error. */
  angularWeight: number;
}

function solve6(a: number[][], b: number[]): number[] | null {
  const n = 6;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let rr = c + 1; rr < n; rr++) if (Math.abs(m[rr][c]) > Math.abs(m[piv][c])) piv = rr;
    if (Math.abs(m[piv][c]) < 1e-14) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let rr = 0; rr < n; rr++) {
      if (rr === c) continue;
      const f = m[rr][c] / m[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) m[rr][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Levenberg–Marquardt from one seed. Returns the converged angles (deg) or null. */
export function solveNumeric(chain: JointChainParams, target: Pose, tcpOffset: V3, tcpRot: Q, seedDeg: ArrayLike<number>, opts: NumericOptions): number[] | null {
  const theta = Array.from({ length: 6 }, (_, i) => (seedDeg[i] ?? 0) * DEG);
  let lambda = 1e-3;
  const errorOf = (angles: number[]) => {
    const f = forward(chain, angles.map((a) => a / DEG), tcpOffset, tcpRot);
    const ep = sub(target.pos, f.tcp.pos);
    const er = qLog(qMul(target.rot, qConj(f.tcp.rot)));
    return { f, e: [...ep, ...scale(er, opts.angularWeight)], pos: norm(ep), rot: norm(er) };
  };
  let cur = errorOf(theta);
  for (let it = 0; it < opts.maxIterations; it++) {
    if (cur.pos <= opts.tolerance && cur.rot <= opts.orientationTolerance) return theta.map((a) => wrapDeg(a / DEG));
    // Geometric Jacobian at the TCP.
    const J: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    for (let j = 0; j < 6; j++) {
      const w = cur.f.axes[j];
      const lin = cross(w, sub(cur.f.tcp.pos, cur.f.origins[j]));
      for (let k = 0; k < 3; k++) { J[k][j] = lin[k]; J[k + 3][j] = w[k] * opts.angularWeight; }
    }
    // (JᵀJ + λ·diag) Δ = Jᵀe
    let accepted = false;
    for (let attempt = 0; attempt < 8 && !accepted; attempt++) {
      const H: number[][] = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, k) => {
        let sum = 0;
        for (let r = 0; r < 6; r++) sum += J[r][i] * J[r][k];
        return sum;
      }));
      const g = Array.from({ length: 6 }, (_, i) => { let sum = 0; for (let r = 0; r < 6; r++) sum += J[r][i] * cur.e[r]; return sum; });
      for (let i = 0; i < 6; i++) H[i][i] += lambda * (H[i][i] + 1e-9);
      const step = solve6(H, g);
      if (!step) { lambda *= 10; continue; }
      const next = theta.map((a, i) => a + step[i]);
      const trial = errorOf(next);
      const before = Math.hypot(...cur.e), after = Math.hypot(...trial.e);
      if (after < before) {
        for (let i = 0; i < 6; i++) theta[i] = next[i];
        cur = trial;
        lambda = Math.max(lambda / 3, 1e-9);
        accepted = true;
      } else {
        lambda *= 4;
      }
    }
    if (!accepted) break;
  }
  return cur.pos <= opts.tolerance && cur.rot <= opts.orientationTolerance ? theta.map((a) => wrapDeg(a / DEG)) : null;
}

/** Verify a candidate by FK against the target. */
export function verify(chain: JointChainParams, target: Pose, tcpOffset: V3, tcpRot: Q, anglesDeg: number[]): { pos: number; rot: number } {
  return poseError(forward(chain, anglesDeg, tcpOffset, tcpRot).tcp, target);
}

/** Wrap-tolerant max per-axis difference (deg). */
export function maxAngleDiff(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < 6; i++) {
    let d = Math.abs(a[i] - b[i]) % 360;
    if (d > 180) d = 360 - d;
    m = Math.max(m, d);
  }
  return m;
}

/** Characteristic length of the chain (m) — scales tolerances. */
export function chainScale(chain: JointChainParams, tcpOffset: V3, tcpRot: Q): number {
  return screwsAtHome(chain, tcpOffset, tcpRot).scale;
}

/** Best-fit wrist centre of the chain at home (seeding for non-spherical wrists). */
export function approximateWristCenter(chain: JointChainParams, tcpOffset: V3, tcpRot: Q): V3 | null {
  return wristCenter(screwsAtHome(chain, tcpOffset, tcpRot))?.point ?? null;
}
