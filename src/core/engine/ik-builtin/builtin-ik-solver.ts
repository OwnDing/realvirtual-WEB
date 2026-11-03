// SPDX-License-Identifier: AGPL-3.0-only

/**
 * BuiltinIkSolver — the community IK provider (ADR-0026).
 *
 * Registers into `ikSolverRegistry` only when no other provider did (a licensed
 * build keeps its WASM solver). Every returned solution is verified by forward
 * kinematics on the robot's own scene-graph chain and checked against the joint
 * limits before it is marked reachable — a wrong answer is reported as
 * unreachable, never driven.
 *
 * - `solvePieper` (spherical wrist): closed form, 8 branch slots
 *   (shoulder × elbow × wrist). Needs the chain; without one every slot is
 *   unreachable and the caller keeps joint-space replay.
 * - `solveCobot` (non-spherical wrist): damped least squares, warm start first,
 *   then analytic seeds from the best-fit wrist centre and quasi-random seeds.
 */

import type { Matrix4, Object3D } from 'three';
import type { CobotSolveOpts, IKSolution, IKSolverProvider, JointChainParams, OpwParams } from '../rv-ik-solver';
import type { RVRobotIK } from '../rv-robot-ik';
import { authoredChain, authoredPoseInBase } from './authored-frame';
import {
  approximateWristCenter, chainScale, dot, fitLimits, forward, maxAngleDiff, norm, qNormalize, solveAnalytic,
  solveNumeric, sub, unit, verify, wrapDeg, type NumericOptions, type Q, type V3,
} from './chain-kinematics';

const SLOTS = 8;
const unreachable = (): IKSolution => ({ angles: [0, 0, 0, 0, 0, 0], reachable: false });

/** Fraction of the chain length accepted as position error, and orientation error (rad). */
const POS_TOL_REL = 1e-5;
const ROT_TOL = 1e-4;

/**
 * Tool used for the solve. The chain carries the TCP node when the robot has
 * one. Without it, the OPW tool offset is applied along the flange normal (the
 * A6 axis, pointing away from the wrist) — the OPW tool frame's z; its x/y
 * cannot be mapped without the TCP node and are ignored.
 */
function toolOf(chain: JointChainParams, params: OpwParams | undefined): { offset: V3; rot: Q } {
  const offset = [...chain.tcpLocalOffset] as V3;
  const rot = qNormalize([...chain.tcpLocalRot] as Q);
  const hasTcp = norm(offset) > 0 || Math.abs(rot[3]) < 1 - 1e-12;
  const toolZ = params?.toolOffset?.[2] ?? 0;
  if (hasTcp || !toolZ) return { offset, rot };
  const home = forward(chain, [0, 0, 0, 0, 0, 0], [0, 0, 0], [0, 0, 0, 1]);
  const wrist = approximateWristCenter(chain, [0, 0, 0], [0, 0, 0, 1]) ?? home.origins[4];
  const w6 = home.axes[5];
  let side = dot(sub(home.origins[5], wrist), w6);
  if (Math.abs(side) < 1e-9) side = dot(sub(wrist, home.origins[2]), w6);
  const sign = side < 0 ? -1 : 1;
  const dir = unit([chain.axisDir[15], chain.axisDir[16], chain.axisDir[17]]);
  return { offset: [dir[0] * sign * toolZ, dir[1] * sign * toolZ, dir[2] * sign * toolZ], rot };
}

function halton(index: number, base: number): number {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

export class BuiltinIkSolver implements IKSolverProvider {
  readonly tier = 'pro' as const;
  readonly maxRobots = Number.POSITIVE_INFINITY;
  /** No continuous blending is implemented by this provider. */
  readonly canBlend = false;

  /** Targets and chain in the authored frame (see authored-frame.ts). */
  poseInBase(base: Object3D, target: Object3D | Matrix4, outPos: [number, number, number], outQuat: [number, number, number, number]): void {
    authoredPoseInBase(base, target, outPos, outQuat);
  }

  chainFor(robot: RVRobotIK): JointChainParams | null {
    return authoredChain(robot);
  }

  solvePieper(params: OpwParams, pos: [number, number, number], quat: [number, number, number, number], chain?: JointChainParams | null): IKSolution[] {
    if (!chain) return Array.from({ length: SLOTS }, unreachable);
    const tool = toolOf(chain, params);
    const target = { pos: [...pos] as V3, rot: qNormalize([...quat] as Q) };
    const tolPos = POS_TOL_REL * chainScale(chain, tool.offset, tool.rot);
    const refine: NumericOptions = { maxIterations: 20, tolerance: tolPos, orientationTolerance: ROT_TOL, angularWeight: 1 };
    const { branches, ineligible } = solveAnalytic(chain, target, tool.offset, tool.rot);
    // A wrist that is spherical in the export but not to 1e-6: seed from the best fit and refine.
    const seeds = ineligible ? this._approximateBranches(chain, target, tool) : branches;
    const out: IKSolution[] = [];
    for (let slot = 0; slot < SLOTS; slot++) {
      const raw = seeds[slot];
      if (!raw) { out.push(unreachable()); continue; }
      let angles: number[] | null = raw;
      const err = verify(chain, target, tool.offset, tool.rot, raw);
      if (err.pos > tolPos || err.rot > ROT_TOL) angles = solveNumeric(chain, target, tool.offset, tool.rot, raw, refine);
      const limited = angles ? fitLimits(chain, angles) : null;
      out.push(limited ? { angles: limited, reachable: true } : { angles: angles ?? raw, reachable: false });
    }
    return out;
  }

  solveCobot(chain: JointChainParams, pos: [number, number, number], quat: [number, number, number, number], opts: CobotSolveOpts = {}): IKSolution[] {
    const tool = toolOf(chain, opts.opw);
    const target = { pos: [...pos] as V3, rot: qNormalize([...quat] as Q) };
    const numeric: NumericOptions = {
      maxIterations: opts.nrMaxIterations ?? 60,
      tolerance: opts.nrTolerance ?? POS_TOL_REL * chainScale(chain, tool.offset, tool.rot),
      orientationTolerance: opts.nrOrientationTolerance ?? 1e-3,
      angularWeight: opts.nrAngularWeight ?? 1,
    };
    const accept = (angles: number[] | null): number[] | null => (angles ? fitLimits(chain, angles) : null);

    // Warm start: an interactive drag converges from the previous pose in a few iterations.
    if (opts.warmStart && opts.warmStart.length >= 6) {
      const warm = accept(solveNumeric(chain, target, tool.offset, tool.rot, opts.warmStart, numeric));
      if (warm) return [{ angles: warm, reachable: true }];
    }

    const seeds: number[][] = [...this._approximateBranches(chain, target, tool).filter((s): s is number[] => !!s)];
    const mirror = opts.numMirrorSeeds ?? 4;
    for (const s of seeds.slice(0, mirror)) seeds.push([wrapDeg(s[0] + 180), -s[1], -s[2], wrapDeg(s[3] + 180), s[4], s[5]]);
    const halt = opts.numHaltonSeeds ?? 8;
    const lo = chain.jointLimits?.lower, hi = chain.jointLimits?.upper;
    const primes = [2, 3, 5, 7, 11, 13];
    for (let k = 1; k <= halt; k++) {
      seeds.push(primes.map((p, i) => {
        const a = lo ? Math.max(lo[i], -180) : -180, b = hi ? Math.min(hi[i], 180) : 180;
        return a + (b - a) * halton(k, p);
      }));
    }
    const found: number[][] = [];
    for (const seed of seeds) {
      const angles = accept(solveNumeric(chain, target, tool.offset, tool.rot, seed, numeric));
      if (angles && !found.some((f) => maxAngleDiff(f, angles) < 0.5)) found.push(angles);
    }
    return found.map((angles) => ({ angles, reachable: true }));
  }

  /** Analytic branches of the spherical approximation (best-fit wrist centre) as seeds. */
  private _approximateBranches(chain: JointChainParams, target: { pos: V3; rot: Q }, tool: { offset: V3; rot: Q }): Array<number[] | null> {
    const center = approximateWristCenter(chain, tool.offset, tool.rot);
    if (!center) return [];
    return solveAnalytic(chain, target, tool.offset, tool.rot, center).branches;
  }
}

export const builtinIkSolver = new BuiltinIkSolver();
