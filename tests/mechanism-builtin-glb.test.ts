// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0026: built-in rigid-body mechanisms on the demo models (four-bar,
 * scissor, single-arm delta), loaded the way the asset editor loads them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { loadGLB, type LoadResult } from '../src/core/engine/rv-scene-loader';
import type { RVDrive } from '../src/core/engine/rv-drive';
import { builtinMechanismManager, installBuiltinMechanismSupport } from '../src/core/engine/mechanism-builtin/mechanism-runtime';
import { getMechanismUiBridge, isMechanismSupported, setKinematicManager, setMechanismUiBridge } from '../src/core/engine/rv-kinematic-registry';
import { DEV_GLB } from './fixtures/glb-paths.mjs';

async function load(url: string, preserveHierarchy = true): Promise<LoadResult> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const scene = new Scene();
  const result = await loadGLB(url, scene, { data: bytes, preserveHierarchy });
  scene.updateMatrixWorld(true);
  return result;
}
const drive = (r: LoadResult, name: string) => r.registry.getAll<RVDrive>('Drive').map((d) => d.instance).find((d) => d.node.name === name)!;
const worldPos = (r: LoadResult, path: string) => r.registry.getNode(path)!.getWorldPosition(new Vector3());

beforeAll(() => { installBuiltinMechanismSupport(null); });
afterAll(() => { builtinMechanismManager.clear(); setKinematicManager(null); setMechanismUiBridge(null); });

describe('built-in mechanisms on the demo models', () => {
  it('four-bar: the passive coupler and rocker follow the crank (closed form)', async () => {
    builtinMechanismManager.clear();
    const r = await load(DEV_GLB.mechanismFourbar);
    expect(isMechanismSupported()).toBe(true);
    const [view] = getMechanismUiBridge()!.list();
    expect(view).toMatchObject({ jointCount: 4, linkCount: 3, loopCount: 1, dof: 0, active: true });
    expect(view.findings.filter((f) => f.severity === 'Error')).toEqual([]);
    const crank = drive(r, 'Crank');
    for (const deg of [10, 25, 40, 55]) {
      // Through the panel bridge: jog the driven joint and solve.
      const res = getMechanismUiBridge()!.jog(view.joints.find((j) => j.joggable)!.nodePath, deg);
      expect(res?.converged, `four-bar did not converge at ${deg}°`).toBe(true);
      // Crank tip and rocker pin stay at their link lengths: 0.5 m coupler, 0.3 m rocker about (−0.6, 0).
      const pin = worldPos(r, 'mechanism-fourbar/Rocker');
      const tip = worldPos(r, 'mechanism-fourbar/Coupler_rv1');
      expect(Math.hypot(pin.x + 0.6, pin.y - 0)).toBeCloseTo(0.3, 3);
      expect(tip.distanceTo(pin)).toBeCloseTo(0.5, 3);
      expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(0.2, 3);
      expect(Math.abs(crank.currentPosition - deg)).toBeLessThan(1e-9);
    }
    const after = getMechanismUiBridge()!.list()[0];
    expect(after.converged).toBe(true);
    expect(Math.abs(after.joints.find((j) => j.joggable)!.currentValue)).toBeCloseTo(55, 3);
  });

  it('scissor: a driven arm on a static base needs no free link and stays converged', async () => {
    builtinMechanismManager.clear();
    const r = await load(DEV_GLB.mechanismScissor);
    const [view] = getMechanismUiBridge()!.list();
    expect(view).toMatchObject({ jointCount: 1, linkCount: 2, dof: 0 });
    const arm = drive(r, 'ArmPivot');
    arm.currentPosition = 30; arm.applyToNode();
    builtinMechanismManager.tick();
    expect(getMechanismUiBridge()!.list()[0].converged).toBe(true);
  });

  it('delta (single arm): the platform hangs on the ball joint; inverse tracking is reported, not faked', async () => {
    builtinMechanismManager.clear();
    const r = await load(DEV_GLB.mechanismDelta);
    const pivot = drive(r, 'UpperArmPivot');
    for (const deg of [-20, 15, 35]) {
      pivot.currentPosition = deg; pivot.applyToNode();
      builtinMechanismManager.tick();
      const view = getMechanismUiBridge()!.list()[0];
      expect(view.converged, `delta not converged at ${deg}°`).toBe(true);
      const ball = view.joints.find((j) => j.jointType === 'Spherical')!;
      // The platform's Anchor B coincides with the arm's Anchor A in world space.
      const platform = r.registry.getNode('mechanism-delta/Platform')!;
      const anchorB = new Vector3(0.2, 0.3, 0).applyMatrix4(platform.matrixWorld);
      expect(anchorB.distanceTo(new Vector3(...ball.originWorld))).toBeLessThan(1e-3);
    }
    expect(getMechanismUiBridge()!.forcesSnapshot(getMechanismUiBridge()!.list()[0].nodePath)).toMatchObject({ status: 1, dynamicsValid: false });
  });

  it('a merged load still moves the links; a frozen link is reported instead of silently not moving', async () => {
    builtinMechanismManager.clear();
    const r = await load(DEV_GLB.mechanismFourbar, false);
    const rocker = r.registry.getNode('mechanism-fourbar/Rocker')!;
    const before = rocker.getWorldPosition(new Vector3());
    const crank = drive(r, 'Crank');
    crank.currentPosition = 30; crank.applyToNode();
    builtinMechanismManager.tick();
    expect(rocker.getWorldPosition(new Vector3()).distanceTo(before)).toBeGreaterThan(0.01);
    const path = getMechanismUiBridge()!.list()[0].nodePath;
    expect(getMechanismUiBridge()!.validate(path).filter((f) => f.code === 'LinkFrozen')).toEqual([]);
    // A link whose matrix the loader baked cannot show the solved pose: say so.
    rocker.matrixAutoUpdate = false;
    const findings = getMechanismUiBridge()!.validate(path);
    expect(findings).toContainEqual(expect.objectContaining({ code: 'LinkFrozen', severity: 'Warning' }));
  });
});
