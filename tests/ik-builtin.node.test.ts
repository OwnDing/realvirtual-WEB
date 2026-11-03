// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0026: the built-in IK solver. Every case is checked with forward
 * kinematics on the chain itself; the golden CRX case is the Unity-Burst
 * validated pose from the private WASM suite.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { builtinIkSolver } from '../src/core/engine/ik-builtin/builtin-ik-solver';
import { forward, maxAngleDiff, poseError, qAxisAngle, type Q, type V3 } from '../src/core/engine/ik-builtin/chain-kinematics';
import { ikSolverRegistry, type CobotSolveOpts, type JointChainParams, type OpwParams } from '../src/core/engine/rv-ik-solver';

afterEach(() => { ikSolverRegistry.register(null); ikSolverRegistry.resetLiveSolveClaims(); });

const OPW: OpwParams = { a1: 0.15, a2: -0.035, b: 0, c1: 0.4, c2: 0.56, c3: 0.515, c4: 0.08, elbowInUnityX: false, toolOffset: [0, 0, 0] };

function chain(spec: { pos: number[]; rot?: number[]; dir: number[]; tcp?: V3; tcpRot?: Q; limits?: [number[], number[]] }): JointChainParams {
  return {
    axisHomePos: new Float64Array(spec.pos),
    axisHomeRot: new Float64Array(spec.rot ?? [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    axisDir: new Float64Array(spec.dir),
    tcpLocalOffset: spec.tcp ?? [0, 0, 0],
    tcpLocalRot: spec.tcpRot ?? [0, 0, 0, 1],
    ...(spec.limits ? { jointLimits: { lower: new Float64Array(spec.limits[0]), upper: new Float64Array(spec.limits[1]) } } : {}),
  };
}

/** Industrial 6-axis arm, Z-up, shoulder offset 0.15, lateral offset 0.03, elbow offset 0.035, spherical wrist. */
const ARM_Z = chain({
  pos: [0, 0, 0, 0.15, 0, 0.4, 0, 0.03, 0.56, 0, 0, 0.035, 0.515, 0, 0, 0.08, 0, 0],
  dir: [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0],
  tcp: [0.1, 0.02, 0],
  tcpRot: qAxisAngle([0, 1, 0], Math.PI / 2),
});

/** The same arm as a glTF rig: Y-up base rotation, reversed A1/A4/A6, rotated wrist frame. */
const s = Math.SQRT1_2;
const ARM_GLTF = chain({
  pos: [0, 0, 0, 0.15, 0, 0.4, 0, 0.03, 0.56, 0, 0, 0.035, 0.515, 0, 0, 0.08, 0, 0],
  rot: [-s, 0, 0, s, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, s, 0, s, 0, 0, 0, 1],
  dir: [0, 0, -1, 0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 1, 0, -1, 0, 0],
  tcp: [0.12, 0, 0],
});

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

function randomConfig(r: () => number): number[] {
  const u = (lo: number, hi: number) => lo + (hi - lo) * r();
  const wrist = (r() < 0.5 ? 1 : -1) * u(20, 140); // keep away from the wrist singularity
  return [u(-160, 160), u(-80, 80), u(-120, 60), u(-170, 170), wrist, u(-170, 170)];
}

const tcpPose = (c: JointChainParams, angles: number[]) => forward(c, angles, [...c.tcpLocalOffset] as V3, [...c.tcpLocalRot] as Q).tcp;

describe('built-in IK — closed form on the scene chain (spherical wrist)', () => {
  for (const [name, arm] of [['Z-up rig', ARM_Z], ['glTF rig with reversed axes', ARM_GLTF]] as const) {
    it(`recovers the original configuration and only FK-exact solutions (${name})`, () => {
      const r = rng(name.length * 7919);
      for (let n = 0; n < 40; n++) {
        const theta = randomConfig(r);
        const pose = tcpPose(arm, theta);
        const sols = builtinIkSolver.solvePieper(OPW, pose.pos, pose.rot, arm);
        expect(sols).toHaveLength(8);
        const ok = sols.filter((x) => x.reachable);
        expect(ok.length).toBeGreaterThanOrEqual(2);
        for (const sol of ok) {
          const err = poseError(tcpPose(arm, sol.angles), pose);
          expect(err.pos).toBeLessThan(1e-6);
          expect(err.rot).toBeLessThan(1e-6);
        }
        expect(Math.min(...ok.map((x) => maxAngleDiff(x.angles, theta)))).toBeLessThan(1e-4);
      }
    });
  }

  it('reports all 8 branches for a compact pose and only the reachable front ones for an extended pose', () => {
    // Extended forward: the back-shoulder branches need more reach than the arm has.
    const extended = tcpPose(ARM_Z, [10, 20, -30, 40, 50, 60]);
    expect(builtinIkSolver.solvePieper(OPW, extended.pos, extended.rot, ARM_Z).filter((x) => x.reachable)).toHaveLength(4);
    const pose = tcpPose(ARM_Z, [10, -30, 80, 40, 50, 60]);
    const ok = builtinIkSolver.solvePieper(OPW, pose.pos, pose.rot, ARM_Z).filter((x) => x.reachable);
    expect(ok.length).toBe(8);
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) expect(maxAngleDiff(ok[i].angles, ok[j].angles)).toBeGreaterThan(1);
  });

  it('marks out-of-reach targets and joint-limit violations unreachable', () => {
    const far = builtinIkSolver.solvePieper(OPW, [5, 0, 0], [0, 0, 0, 1], ARM_Z);
    expect(far.some((x) => x.reachable)).toBe(false);

    const limited = chain({
      pos: Array.from(ARM_Z.axisHomePos), dir: Array.from(ARM_Z.axisDir), tcp: [0.1, 0.02, 0], tcpRot: qAxisAngle([0, 1, 0], Math.PI / 2),
      limits: [[-30, -90, -150, -180, -130, -360], [30, 90, 90, 180, 130, 360]],
    });
    const pose = tcpPose(limited, [10, 20, -30, 40, 50, 300]); // A6 = 300° is inside ±360
    const ok = builtinIkSolver.solvePieper(OPW, pose.pos, pose.rot, limited).filter((x) => x.reachable);
    expect(ok.length).toBeGreaterThan(0);
    for (const sol of ok) {
      expect(Math.abs(sol.angles[0])).toBeLessThanOrEqual(30); // the back-shoulder branches are cut by A1 ±30°
      expect(sol.angles[5]).toBeGreaterThanOrEqual(-360);
    }
  });

  it('without a chain every slot is unreachable (caller keeps joint replay)', () => {
    const sols = builtinIkSolver.solvePieper(OPW, [0.5, 0, 0.5], [0, 0, 0, 1]);
    expect(sols).toHaveLength(8);
    expect(sols.some((x) => x.reachable)).toBe(false);
  });

  it('applies the OPW tool offset along the flange normal when the robot has no TCP node', () => {
    const flangeOnly = chain({ pos: Array.from(ARM_Z.axisHomePos), dir: Array.from(ARM_Z.axisDir) });
    const withTool = chain({ pos: Array.from(ARM_Z.axisHomePos), dir: Array.from(ARM_Z.axisDir), tcp: [0.2, 0, 0] });
    const theta = [15, 10, -20, 30, 60, -45];
    const pose = tcpPose(withTool, theta);
    const ok = builtinIkSolver.solvePieper({ ...OPW, toolOffset: [0, 0, 0.2] }, pose.pos, pose.rot, flangeOnly).filter((x) => x.reachable);
    expect(Math.min(...ok.map((x) => maxAngleDiff(x.angles, theta)))).toBeLessThan(1e-4);
  });
});

// ── Non-spherical wrist (copy of the private suite's synthetic robot and golden CRX case) ──

const SYNTHETIC = chain({
  pos: [0, 0, 0, 0, 0, 0.3, 0, 0, 0.5, 0, 0, 0.4, 0.05, 0, 0.1, 0, 0, 0.08],
  dir: [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1],
  tcp: [0, 0, 0.1],
  limits: [new Array(6).fill(-180), new Array(6).fill(180)],
});
const ROUNDTRIP: CobotSolveOpts = {
  nrMaxIterations: 300, nrTolerance: 1e-5, nrAngularWeight: 1, nrOrientationTolerance: 0.01, numMirrorSeeds: 12, numHaltonSeeds: 8,
  opw: { a1: 0.05, a2: 0, b: 0, c1: 0.3, c2: 0.5, c3: 0.5, c4: 0.18, elbowInUnityX: false, toolOffset: [0, 0, 0] },
};

describe('built-in IK — numerical solve (non-spherical wrist)', () => {
  it('roundtrips the synthetic non-spherical robot (FK-verified) and echoes a warm start', () => {
    const theta = [25, 35, -30, 40, 45, -20];
    const pose = tcpPose(SYNTHETIC, theta);
    const sols = builtinIkSolver.solveCobot(SYNTHETIC, pose.pos, pose.rot, ROUNDTRIP);
    expect(sols.length).toBeGreaterThanOrEqual(1);
    for (const sol of sols) expect(poseError(tcpPose(SYNTHETIC, sol.angles), pose).pos).toBeLessThan(1e-3);
    const seed = ikSolverRegistry.selectClosest(sols, theta)!;
    const warm = builtinIkSolver.solveCobot(SYNTHETIC, pose.pos, pose.rot, { ...ROUNDTRIP, warmStart: new Float64Array(seed) });
    expect(warm).toHaveLength(1);
    expect(maxAngleDiff(warm[0].angles, seed)).toBeLessThan(0.5);
  });

  it('golden FANUC CRX case (validated against the Unity Burst solver)', () => {
    const crx = chain({
      pos: [0, 0, 0, 0, 0, 0.245, 0, 0, 0.71, 0.15, 0, 0, 0.39, 0, 0, 0.1, 0.15, 0],
      dir: [0, 0, -1, 0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 1, 0, -1, 0, 0],
      tcp: [0.23986, -0.000035, -0.0000371],
      tcpRot: [-0.70711, 0, -0.70711, 0],
    });
    const expected = [-33.11, 23.69, -16.93, 0, 83.24, -35.72];
    const sols = builtinIkSolver.solveCobot(crx, [0.60616, 0.57447, 0.49166], [-0.99974, 0.02269, 0, 0], {
      ...ROUNDTRIP, opw: { a1: 0, a2: 0, b: 0, c1: 0.245, c2: 0.71, c3: 0.54, c4: 0.1, elbowInUnityX: true, toolOffset: [0, 0, 0.2399] },
    });
    const match = sols.find((x) => x.reachable && maxAngleDiff(x.angles, expected) < 0.5);
    expect(match, JSON.stringify(sols.map((x) => x.angles.map((a) => +a.toFixed(2))))).toBeTruthy();
  });
});

describe('registry wiring', () => {
  it('the built-in solver is a pro-tier provider and the registry forwards the chain', () => {
    ikSolverRegistry.register(builtinIkSolver);
    expect(ikSolverRegistry.tier).toBe('pro');
    expect(ikSolverRegistry.canSolveCobot).toBe(true);
    expect(ikSolverRegistry.claimLiveSolve('robot-a')).toBe(true);
    expect(ikSolverRegistry.claimLiveSolve('robot-b')).toBe(true);
    const pose = tcpPose(ARM_Z, [10, 20, -30, 40, 50, 60]);
    const sols = ikSolverRegistry.solvePieper(OPW, pose.pos, pose.rot, ARM_Z)!;
    expect(ikSolverRegistry.selectClosest(sols, [10, 20, -30, 40, 50, 60])).not.toBeNull();
  });
});
