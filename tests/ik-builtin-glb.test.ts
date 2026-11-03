// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0026: the built-in IK solver against the real demo robots (ABB IRB2400,
 * spherical wrist → closed form; FANUC CRX, non-spherical → numerical).
 *
 * Every IK target in the GLB carries the joint angles Unity's own solver baked
 * at export (AxisPos). Solving the same target pose on the scene-graph chain
 * must (a) reproduce the pose by FK and (b) contain a solution next to Unity's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { loadGLB, type LoadResult } from '../src/core/engine/rv-scene-loader';
import { ikSolverRegistry } from '../src/core/engine/rv-ik-solver';
import type { RVRobotIK } from '../src/core/engine/rv-robot-ik';
import type { RVIKTarget } from '../src/core/engine/rv-ik-target';
import { builtinIkSolver } from '../src/core/engine/ik-builtin/builtin-ik-solver';
import { forward, maxAngleDiff, poseError, type Q, type V3 } from '../src/core/engine/ik-builtin/chain-kinematics';
import { DEV_GLB } from './fixtures/glb-paths.mjs';

let result: LoadResult | null = null;
let robots: RVRobotIK[] = [];

beforeAll(async () => {
  const bytes = await (await fetch(DEV_GLB.robotIK)).arrayBuffer();
  result = await loadGLB(DEV_GLB.robotIK, new Scene(), { data: bytes, preserveHierarchy: true });
  robots = result.registry.getAll<RVRobotIK>('RobotIK').map((r) => r.instance).filter((r) => r.getAxisDrives().length === 6);
  ikSolverRegistry.register(builtinIkSolver);
}, 60000);

afterAll(() => { ikSolverRegistry.register(null); ikSolverRegistry.resetLiveSolveClaims(); });

function targetsOf(robot: RVRobotIK): RVIKTarget[] {
  return robot.getPaths().flatMap((p) => [...p.targets]).filter((t) => t.hasReplayAngles(6));
}

describe('built-in IK on the demo robots (parity with Unity-baked AxisPos)', () => {
  it('loads both demo robots with chains and baked targets', () => {
    expect(robots.map((r) => r.WristType).sort()).toEqual(['NonSpherical', 'Spherical']);
    for (const r of robots) {
      expect(ikSolverRegistry.chainFor(r)).not.toBeNull();
      expect(targetsOf(r).length).toBeGreaterThan(0);
    }
  });

  for (const wrist of ['Spherical', 'NonSpherical'] as const) {
    it(`${wrist}: every baked target is solved exactly and next to Unity's configuration`, () => {
      const robot = robots.find((r) => r.WristType === wrist)!;
      const chain = ikSolverRegistry.chainFor(robot)!;
      const params = robot.getOpwParams()!;
      const tool = { offset: [...chain.tcpLocalOffset] as V3, rot: [...chain.tcpLocalRot] as Q };
      const p3: [number, number, number] = [0, 0, 0];
      const q4: [number, number, number, number] = [0, 0, 0, 1];
      for (const target of targetsOf(robot)) {
        ikSolverRegistry.poseInBase(robot.node, target.node, p3, q4);
        const baked = [...target.AxisPos];
        const sols = wrist === 'Spherical'
          ? ikSolverRegistry.solvePieper(params, p3, q4, chain)!
          : ikSolverRegistry.solveCobot(chain, p3, q4, { opw: params, nrMaxIterations: 200 })!;
        const best = ikSolverRegistry.selectClosest(sols, baked);
        expect(best, `no reachable solution at "${target.node.name}"`).not.toBeNull();
        const err = poseError(forward(chain, best!, tool.offset, tool.rot).tcp, { pos: [...p3], rot: [...q4] });
        expect(err.pos, `pose error at "${target.node.name}"`).toBeLessThan(1e-4);
        // Unity's baked angles are float32 at its own solve tolerance; the IRB's OPW model also sits 5 mm off its mesh chain.
        expect(maxAngleDiff(best!, baked), `far from Unity's AxisPos at "${target.node.name}"`).toBeLessThan(3);
      }
    });
  }

  it('warm-started from the baked angles, the numerical solve converges to a single nearby solution', () => {
    const robot = robots.find((r) => r.WristType === 'NonSpherical')!;
    const chain = ikSolverRegistry.chainFor(robot)!;
    const p3: [number, number, number] = [0, 0, 0];
    const q4: [number, number, number, number] = [0, 0, 0, 1];
    for (const target of targetsOf(robot)) {
      ikSolverRegistry.poseInBase(robot.node, target.node, p3, q4);
      const sols = ikSolverRegistry.solveCobot(chain, p3, q4, { opw: robot.getOpwParams()!, warmStart: new Float64Array(target.AxisPos) })!;
      expect(sols).toHaveLength(1);
      expect(maxAngleDiff(sols[0].angles, [...target.AxisPos])).toBeLessThan(3);
    }
  });
});
