// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Drives the booth's six-axis paint robot (EP-DEMO-002, M2).
 *
 * The booth used to hold a single `Drive-Lin-Y` reciprocator carriage. It now
 * holds a real robot: six nested joints `A1…A6`, each carrying its own `Drive`,
 * with a `RobotIK` component on the root whose `Axis` array references them by
 * nested path. The loader confirms the chain with `RobotIK: Robot axes=6`.
 *
 * The joints are commanded DIRECTLY here rather than through an IK solve to a
 * moving target. That is a deliberate, bounded choice, recorded in the plan:
 * a spray pass is a rehearsed trajectory, not a pick-and-place, and driving the
 * joints keeps the motion deterministic and assertable (joint angles are
 * numbers a test can read). The `RobotIK` component still binds and resolves —
 * the asset IS a valid robot — so switching this plugin to an IK target later
 * needs no asset change.
 *
 * Tracking rule: `A1` (base yaw) turns to face the nearest hanger inside the
 * booth, while `A5` (wrist pitch) sweeps to carry the gun across the workpiece
 * height. With no hanger in the booth the arm returns to its home pose and the
 * spray fan hides.
 */

import type { Object3D } from 'three';
import type { RVDrive } from '../../../core/engine/rv-drive';
import { RVBehavior } from '../../../core/rv-behavior';

/** Booth length in metres, mirroring `scripts/build-paintline-library.mjs`. */
const BOOTH_LENGTH = 6;

/** Joint names, base first — the same chain the asset nests. */
const JOINTS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] as const;

/** Degrees of wrist sweep either side of centre, and its period in seconds. */
const SWEEP_DEG = 35;
const SWEEP_PERIOD_S = 2.2;

/** Re-command a joint only past this change, so the ramp is not restarted every tick. */
const RETARGET_EPS_DEG = 0.5;

function baseName(name: string): string {
  return name.replace(/_\d+$/, '');
}

export class PaintLineSprayMotionPlugin extends RVBehavior {
  readonly id = 'paintline-spray-motion';

  private joints = new Map<string, RVDrive>();
  private commanded = new Map<string, number>();
  private robot: Object3D | null = null;
  /**
   * The robot base in WORLD coordinates.
   *
   * `robot.position` is booth-LOCAL (the arm sits at x = 1.5, z = -0.6 inside a
   * booth placed at z = 21), while carrier positions are read in the scene-root
   * frame. Mixing the two put the hanger a constant ~20 m "ahead" of the robot,
   * so the base yaw came out at a fixed ~95° and the arm tracked nothing while
   * still looking busy — the wrist sweep hid it. Read from `matrixWorld`, which
   * the loader computes once and the freeze pass then leaves alone: this base
   * never moves, so a single read at start is both correct and stable.
   */
  private robotWorld = { x: 0, z: 0 };
  private fans: Object3D[] = [];
  private carriers: Object3D[] = [];
  private boothMinZ = 0;
  private boothMaxZ = 0;
  private spraying = false;
  private sweepPhaseS = 0;

  protected onStart(): void {
    const scene = this.scene;
    if (!scene) return;

    for (const drive of this.drives) {
      const n = baseName(drive.name);
      if ((JOINTS as readonly string[]).includes(n)) this.joints.set(n, drive);
    }
    if (this.joints.size !== JOINTS.length) {
      console.warn(
        `[${this.id}] found ${this.joints.size}/${JOINTS.length} robot joints — the booth robot stays idle`,
      );
      return;
    }

    scene.traverse((node) => {
      const base = baseName(node.name);
      if (base.startsWith('Spray-Fan')) this.fans.push(node);
      if (base === 'Robot' && !this.robot) this.robot = node;
      if (/^Carrier-\d\d$/.test(base)) this.carriers.push(node);
      if (base === 'SprayBooth' && node.userData?.realvirtual?.LayoutObject) {
        this.boothMinZ = node.position.z - BOOTH_LENGTH / 2;
        this.boothMaxZ = node.position.z + BOOTH_LENGTH / 2;
      }
    });
    for (const fan of this.fans) fan.visible = false;

    if (this.robot) {
      const e = this.robot.matrixWorld.elements;
      this.robotWorld = { x: e[12], z: e[14] };
    }
  }

  /** Command a joint, skipping no-op re-targets that would restart its ramp. */
  private aim(joint: string, deg: number): void {
    const drive = this.joints.get(joint);
    if (!drive) return;
    const last = this.commanded.get(joint);
    if (last !== undefined && Math.abs(last - deg) < RETARGET_EPS_DEG) return;
    this.commanded.set(joint, deg);
    drive.startMove(deg);
  }

  protected onLateFixedUpdate(dt: number): void {
    if (this.joints.size !== JOINTS.length || !this.robot) return;

    // Nearest hanger inside the booth. Positions are read in the scene-root
    // frame, which is the world frame here — the conveyor is placed
    // untransformed at the origin (see build-paintline-scene.mjs).
    let target: Object3D | null = null;
    let bestDz = Number.POSITIVE_INFINITY;
    const robotZ = this.robotWorld.z;
    for (const c of this.carriers) {
      if (Math.abs(c.position.x) > 1) continue;              // process-side leg only
      if (c.position.z < this.boothMinZ || c.position.z > this.boothMaxZ) continue;
      const dz = Math.abs(c.position.z - robotZ);
      if (dz < bestDz) { bestDz = dz; target = c; }
    }

    const occupied = target !== null;
    if (occupied !== this.spraying) {
      this.spraying = occupied;
      for (const fan of this.fans) fan.visible = occupied;
      this.viewer?.markRenderDirty();
    }

    if (!occupied) {
      // Home pose — an idle booth should not leave the arm mid-stroke.
      for (const j of JOINTS) this.aim(j, 0);
      this.sweepPhaseS = 0;
      return;
    }

    // Base yaw towards the hanger, measured FROM THE ROBOT'S FACING (-X, the
    // track side), not from world +X. Measuring in world terms made the angle
    // flip between +146° and -146° each time the nearest hanger changed, and
    // the arm whipped 293° the long way round — a 321° sweep in eight seconds.
    // Relative to its facing the same motion is a calm ±34°.
    const dx = target!.position.x - this.robotWorld.x;   // negative: track is at -X
    const dz = target!.position.z - this.robotWorld.z;
    const yawDeg = (Math.atan2(dz, -dx) * 180) / Math.PI;
    this.aim('A1', yawDeg);

    // Wrist sweep carries the gun across the workpiece height.
    this.sweepPhaseS = (this.sweepPhaseS + dt) % SWEEP_PERIOD_S;
    const phase = (this.sweepPhaseS / SWEEP_PERIOD_S) * Math.PI * 2;
    this.aim('A5', Math.sin(phase) * SWEEP_DEG);
    // A modest shoulder/elbow set keeps the tool at hanger height instead of
    // pointing straight up.
    this.aim('A2', 25);
    this.aim('A3', -35);
  }

  protected onDestroy(): void {
    for (const fan of this.fans) fan.visible = true;
    this.joints.clear();
    this.commanded.clear();
    this.robot = null;
    this.fans = [];
    this.carriers = [];
    this.spraying = false;
    this.sweepPhaseS = 0;
  }
}
