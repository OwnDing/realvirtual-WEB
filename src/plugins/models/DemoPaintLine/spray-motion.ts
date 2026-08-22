// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Drives the booth's six-axis paint robot (EP-DEMO-002, M2).
 *
 * The booth used to hold a single `Drive-Lin-Y` reciprocator carriage, then a
 * box-and-cylinder six-axis stand-in. Since EP-DEMO-003 it holds the real FANUC
 * CRX-10iA/L lifted out of `public/models/DemoRobotIK.glb`: six nested joints
 * `A1…A6`, each with its own `Drive`, under a `RobotIK` root. The loader
 * confirms the chain with `RobotIK: PaintRobot… axes=6 wrist=NonSpherical`
 * (a cobot with wrist offsets — correctly detected).
 *
 * Joint roles were MEASURED by jogging each axis 40° and reading the TCP's
 * world position, not read off the `Direction` fields (which are in Unity local
 * frames and do not map to a guessable world axis):
 *
 *   A1 base swivel (moves the TCP in X/Z)   A4 wrist roll (small)
 *   A2 shoulder    (largest vertical move)  A5 wrist pitch
 *   A3 elbow                                A6 tool roll (TCP on the axis)
 *
 * The home pose already places the TCP beside the track, so the shoulder and
 * elbow are LEFT AT ZERO — the previous stand-in needed a posture offset, this
 * arm does not, and forcing one swings the gun away from the hangers.
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
 *
 * The SPRAY FAN is built here at runtime and parented to the robot's `TCP`
 * node. The extracted arm carries no such mesh — it came out of a pick-and-place
 * demo — and adding one to the extracted GLB would mean post-processing vendor
 * geometry we deliberately copy verbatim. A cone made in the demo layer costs
 * nothing, follows the tool for free, and disappears with the plugin.
 */

import { ConeGeometry, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import type { RVDrive } from '../../../core/engine/rv-drive';
import { RVBehavior } from '../../../core/rv-behavior';

/** Booth length in metres, mirroring `scripts/build-paintline-library.mjs`. */
const BOOTH_LENGTH = 6;

/** Joint names, base first — the same chain the asset nests. */
const JOINTS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] as const;

/**
 * Base yaw that points the gun across the line, in degrees.
 *
 * An asset constant, not a preference: the arm's tool axis lies along world -Z
 * at A1 = 0 (measured — A2/A3 move the TCP only within the Y-Z plane, so the
 * gun cannot be aimed across the track by posture alone), and -90° is the yaw
 * that turns -Z into +X.
 */
const HOME_YAW_DEG = -90;

/** Degrees of wrist sweep either side of centre, and its period in seconds. */
const SWEEP_DEG = 35;
const SWEEP_PERIOD_S = 2.2;

/** Re-command a joint only past this change, so the ramp is not restarted every tick. */
const RETARGET_EPS_DEG = 0.5;

/** Spray cone, in TCP-local metres (the robot placement scales it along). */
const FAN_LENGTH_M = 0.55;
const FAN_RADIUS_M = 0.22;

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
  /** Runtime-built spray cone parented to the TCP; owned and disposed here. */
  private fan: Mesh | null = null;
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

    let tcp: Object3D | null = null;
    scene.traverse((node) => {
      const base = baseName(node.name);
      // The robot root is `PaintRobot` since EP-DEMO-003 (it used to be the
      // generated `Robot` node inside the booth). Matching the old name left
      // `this.robot` null, and the whole tick returned early — the arm simply
      // stood still with nothing logged.
      if (base === 'PaintRobot' && !this.robot) this.robot = node;
      if (base === 'TCP' && !tcp) tcp = node;
      if (/^Carrier-\d\d$/.test(base)) this.carriers.push(node);
      if (base === 'SprayBooth' && node.userData?.realvirtual?.LayoutObject) {
        this.boothMinZ = node.position.z - BOOTH_LENGTH / 2;
        this.boothMaxZ = node.position.z + BOOTH_LENGTH / 2;
      }
    });
    if (tcp) this.fan = this.attachFan(tcp);

    if (this.robot) {
      const e = this.robot.matrixWorld.elements;
      this.robotWorld = { x: e[12], z: e[14] };
    }
  }

  /**
   * Build the spray cone and hang it off the tool centre point.
   *
   * Additive and depth-write-free so it reads as atomised paint rather than a
   * solid cone, and `matrixWorldAutoUpdate` is forced on: the loader's
   * static-freeze pass never saw this node, and a frozen parent chain would
   * leave the cone hanging in mid-air while the arm moved away from it.
   */
  private attachFan(tcp: Object3D): Mesh {
    const geo = new ConeGeometry(FAN_RADIUS_M, FAN_LENGTH_M, 16, 1, true);
    // Aim the cone down the TOOL axis, which is the TCP's local +Z — measured,
    // not assumed: the direction from `TCP` to `GripperTCP` came out as
    // (-0.21, -0.55, -0.80) in world, matching the TCP's local Z column. Built
    // along -Y (the obvious guess) the fan sprayed at the floor and was
    // invisible against a pale booth.
    geo.translate(0, -FAN_LENGTH_M / 2, 0);   // apex to the origin, opening -Y
    geo.rotateX(-Math.PI / 2);                // -Y becomes +Z
    const mat = new MeshBasicMaterial({
      color: 0xbcd8ff, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const mesh = new Mesh(geo, mat);
    mesh.name = 'Spray-Fan';
    mesh.visible = false;
    mesh.matrixWorldAutoUpdate = true;
    mesh.frustumCulled = false;
    tcp.add(mesh);
    return mesh;
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
      if (this.fan) this.fan.visible = occupied;
      this.viewer?.markRenderDirty();
    }

    if (!occupied) {
      // Home pose — an idle booth should not leave the arm mid-stroke. The base
      // rests facing the track rather than at A1 = 0, which points the gun down
      // the line: parking there would swing the arm through 90° every time the
      // booth briefly empties.
      for (const j of JOINTS) this.aim(j, j === 'A1' ? HOME_YAW_DEG : 0);
      this.sweepPhaseS = 0;
      return;
    }

    // Base yaw so the GUN points at the hanger.
    //
    // The convention is the asset's, and it was measured: at A1 = 0 the tool
    // axis points world -Z, i.e. straight down the line. So a yaw of th aims the
    // tool at (-sin th, 0, -cos th), and pointing it along (dx, dz) means
    // th = atan2(-dx, -dz) — not the atan2(dz, dx) this used to compute.
    //
    // That old formula treated A1 = 0 as "already facing the track", which was
    // never true. The arm still tracked, still swept, and still looked busy, so
    // the error stayed invisible for two milestones: measured over fourteen
    // samples the angle between the spray axis and the direction to the hanger
    // ranged 12°-152°, median ~93°. The robot was spraying along the conveyor.
    const dx = target!.position.x - this.robotWorld.x;
    const dz = target!.position.z - this.robotWorld.z;
    const yawDeg = (Math.atan2(-dx, -dz) * 180) / Math.PI;
    this.aim('A1', yawDeg);

    // Wrist sweep carries the gun across the workpiece height.
    this.sweepPhaseS = (this.sweepPhaseS + dt) % SWEEP_PERIOD_S;
    const phase = (this.sweepPhaseS / SWEEP_PERIOD_S) * Math.PI * 2;
    this.aim('A5', Math.sin(phase) * SWEEP_DEG);
  }

  protected onDestroy(): void {
    if (this.fan) {
      this.fan.removeFromParent();
      this.fan.geometry.dispose();
      (this.fan.material as { dispose(): void }).dispose();
      this.fan = null;
    }
    this.joints.clear();
    this.commanded.clear();
    this.robot = null;
    this.carriers = [];
    this.spraying = false;
    this.sweepPhaseS = 0;
  }
}
