// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0026: the built-in rigid-body mechanism solver on closed-form-checkable linkages. */
import { describe, expect, it } from 'vitest';
import { anchorGap, jointValue, makeJoint, residuals, solve, topologyFigures, type SolverBody } from '../src/core/engine/mechanism-builtin/mechanism-solver';
import { qAxisAngle, type V3 } from '../src/core/engine/ik-builtin/chain-kinematics';

const Z: V3 = [0, 0, 1];
const OPTS = { iterations: 4, damping: 0.01, tolerance: 0.001, length: 0.6 };

/** The demo four-bar (glTF metres): ground 0.6, crank 0.2, coupler 0.5, rocker 0.3. */
function fourBar() {
  const bodies: SolverBody[] = [
    { pose: { pos: [0, 0, 0], rot: [0, 0, 0, 1] }, free: false }, // crank (driven)
    { pose: { pos: [-0.2, 0, 0], rot: [0, 0, 0, 1] }, free: true }, // coupler
    { pose: { pos: [-0.6, 0.3, 0], rot: [0, 0, 0, 1] }, free: true }, // rocker
  ];
  const joints = [
    makeJoint({ type: 'Revolute', a: -1, b: 0, anchorA: [0, 0, 0], anchorB: [0, 0, 0], axisA: Z }, bodies),
    makeJoint({ type: 'Revolute', a: 0, b: 1, anchorA: [-0.2, 0, 0], anchorB: [0, 0, 0], axisA: Z }, bodies),
    makeJoint({ type: 'Revolute', a: 1, b: 2, anchorA: [-0.4, 0.3, 0], anchorB: [0, 0, 0], axisA: Z }, bodies),
    makeJoint({ type: 'Revolute', a: -1, b: 2, anchorA: [-0.6, 0, 0], anchorB: [0, -0.3, 0], axisA: Z }, bodies),
  ];
  return { bodies, joints };
}

/** Closed-form rocker angle of a four-bar (ground along −X from the crank pivot). */
function rockerPoint(theta: number): V3 {
  const A: [number, number] = [-0.2 * Math.cos(theta), -0.2 * Math.sin(theta)]; // crank tip (crank points along −X at θ=0)
  const D: [number, number] = [-0.6, 0];
  const dx = A[0] - D[0], dy = A[1] - D[1];
  const d = Math.hypot(dx, dy);
  // Intersection of circle(A, 0.5) and circle(D, 0.3), branch with y > 0 (the assembled one).
  const a = (0.3 ** 2 - 0.5 ** 2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, 0.3 ** 2 - a * a));
  const px = D[0] + (a * dx) / d, py = D[1] + (a * dy) / d;
  const c1: V3 = [px + (h * dy) / d, py - (h * dx) / d, 0], c2: V3 = [px - (h * dy) / d, py + (h * dx) / d, 0];
  return c1[1] > c2[1] ? c1 : c2;
}

describe('built-in mechanism solver', () => {
  it('starts closed: the authored four-bar has zero residual, 1 DOF and one loop', () => {
    const { bodies, joints } = fourBar();
    expect(Math.max(...residuals(bodies, joints, 0.6).map(Math.abs))).toBeLessThan(1e-12);
    expect(topologyFigures(bodies, joints, 0.6)).toEqual({ dof: 0, loops: 1 }); // crank is driven → no free DOF left
    bodies[0].free = true; // with a free crank the linkage has exactly one DOF
    expect(topologyFigures(bodies, joints, 0.6).dof).toBe(1);
  });

  it('follows the driven crank tick by tick and matches the closed-form four-bar', () => {
    const { bodies, joints } = fourBar();
    for (let deg = 2; deg <= 70; deg += 2) {
      const th = (deg * Math.PI) / 180;
      bodies[0].pose = { pos: [0, 0, 0], rot: qAxisAngle(Z, th) };
      const res = solve(bodies, joints, OPTS);
      expect(res.converged, `not converged at ${deg}°`).toBe(true);
      for (const j of joints) expect(anchorGap(j, bodies)).toBeLessThan(1e-4);
      const expected = rockerPoint(th); // the coupler–rocker pin = rocker origin
      const pin = bodies[2].pose.pos;
      expect(Math.hypot(pin[0] - expected[0], pin[1] - expected[1])).toBeLessThan(1e-4);
      // Planar motion: everything stays in z = 0 and rotates about Z only.
      expect(Math.abs(pin[2])).toBeLessThan(1e-6);
    }
    expect(jointValue(joints[0], bodies)).toBeCloseTo((70 * Math.PI) / 180, 6);
  });

  it('a spherical joint drags a free platform; an imposed value drives a free revolute body', () => {
    const bodies: SolverBody[] = [
      { pose: { pos: [-0.2, 0, 0], rot: [0, 0, 0, 1] }, free: false }, // arm (driven)
      { pose: { pos: [-0.5, -0.3, 0], rot: [0, 0, 0, 1] }, free: true }, // platform
    ];
    const ball = makeJoint({ type: 'Spherical', a: 0, b: 1, anchorA: [-0.1, 0, 0], anchorB: [0.2, 0.3, 0], axisA: Z }, bodies);
    bodies[0].pose = { pos: [-0.25, 0.05, 0], rot: qAxisAngle(Z, 0.3) };
    const res = solve(bodies, [ball], { ...OPTS, iterations: 8 });
    expect(res.converged).toBe(true);
    expect(anchorGap(ball, bodies)).toBeLessThan(1e-5);

    const door: SolverBody[] = [{ pose: { pos: [0, 0, 0], rot: [0, 0, 0, 1] }, free: true }];
    const hinge = makeJoint({ type: 'Revolute', a: -1, b: 0, anchorA: [0, 0, 0], anchorB: [0, 0, 0], axisA: [0, 1, 0] }, door);
    hinge.imposed = 0.5;
    expect(solve(door, [hinge], { ...OPTS, iterations: 10 }).converged).toBe(true);
    expect(jointValue(hinge, door)).toBeCloseTo(0.5, 5);
  });

  it('a prismatic joint keeps orientation and slides only along its axis', () => {
    const slider: SolverBody[] = [{ pose: { pos: [0, 0, 0], rot: [0, 0, 0, 1] }, free: true }];
    const rail = makeJoint({ type: 'Prismatic', a: -1, b: 0, anchorA: [0, 0, 0], anchorB: [0, 0, 0], axisA: [1, 0, 0] }, slider);
    rail.imposed = 0.25;
    slider[0].pose = { pos: [0.1, 0.05, -0.02], rot: qAxisAngle([0, 0, 1], 0.2) }; // disturbed
    expect(solve(slider, [rail], { ...OPTS, iterations: 10 }).converged).toBe(true);
    expect(slider[0].pose.pos[0]).toBeCloseTo(0.25, 5);
    expect(Math.hypot(slider[0].pose.pos[1], slider[0].pose.pos[2])).toBeLessThan(1e-5);
    expect(Math.abs(slider[0].pose.rot[2])).toBeLessThan(1e-5);
  });
});
