// SPDX-License-Identifier: AGPL-3.0-only

/**
 * authored-frame — the frame the built-in IK solver works in (ADR-0026).
 *
 * Unity aligns the TCP's `transform.rotation` with the target's — the product of
 * the authored local rotations, whatever the scales. Exported rigs keep that
 * meaning in each node's TRS but can carry negative or non-uniform scales on
 * the TCP and target nodes (the demo IRB2400: TCP scale (0.5, 0.5, −0.5),
 * targets (−1, 1, 1)). Decomposing such a world matrix assigns the reflection
 * to X and yields a rotation 180° away from the authored one, and dividing a
 * translation by a node's own scale moves it. So this frame uses:
 *
 *   rotation  = product of local quaternions (authored), relative to the robot
 *   position  = true world position, in the robot's local coordinates
 *
 * Validated on the demo robots: the AxisPos baked by Unity reproduce every IK
 * target in this frame to 0.0° (and to the rigs' own 5 mm OPW/mesh offset).
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { JointChainParams } from '../rv-ik-solver';
import type { RVRobotIK } from '../rv-robot-ik';
import { directionToGltfAxis, isRotation } from '../rv-coordinate-utils';

/** Product of local quaternions from the scene root down to `node`. */
export function authoredWorldQuaternion(node: Object3D, out = new Quaternion()): Quaternion {
  const path: Object3D[] = [];
  for (let n: Object3D | null = node; n; n = n.parent) path.push(n);
  out.identity();
  for (let i = path.length - 1; i >= 0; i--) out.multiply(path[i].quaternion);
  return out;
}

const _inv = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _qb = new Quaternion();
const _s = new Vector3();
const _d = new Vector3();

export function authoredPoseInBase(base: Object3D, target: Object3D | Matrix4, outPos: [number, number, number], outQuat: [number, number, number, number]): void {
  _inv.copy(base.matrixWorld).invert();
  const world = target instanceof Matrix4 ? target : target.matrixWorld;
  _p.setFromMatrixPosition(world).applyMatrix4(_inv);
  outPos[0] = _p.x; outPos[1] = _p.y; outPos[2] = _p.z;
  // A synthetic pose (a matrix, no node) has no authored chain: its decomposed rotation is all there is.
  if (target instanceof Matrix4) world.decompose(_d, _q, _s);
  else authoredWorldQuaternion(target, _q);
  authoredWorldQuaternion(base, _qb).invert().multiply(_q);
  outQuat[0] = _qb.x; outQuat[1] = _qb.y; outQuat[2] = _qb.z; outQuat[3] = _qb.w;
}

const chains = new WeakMap<object, JointChainParams | null>();

/** The robot's joint chain in the authored frame (cached per robot; null when it is not a 6R serial chain). */
export function authoredChain(robot: RVRobotIK): JointChainParams | null {
  if (chains.has(robot)) return chains.get(robot)!;
  const chain = computeAuthoredChain(robot);
  chains.set(robot, chain);
  return chain;
}

function computeAuthoredChain(robot: RVRobotIK): JointChainParams | null {
  const drives = robot.getAxisDrives();
  if (drives.length !== 6) return null;
  const base = robot.node;
  const inv = new Matrix4().copy(base.matrixWorld).invert();
  const baseQ = authoredWorldQuaternion(base).invert();
  const relQ = (node: Object3D) => baseQ.clone().multiply(authoredWorldQuaternion(node));
  const localPos = (world: Vector3) => world.clone().applyMatrix4(inv);
  const nodePos = (node: Object3D) => localPos(new Vector3().setFromMatrixPosition(node.matrixWorld));

  const axisHomePos = new Float64Array(18);
  const axisHomeRot = new Float64Array(24);
  const axisDir = new Float64Array(18);
  let anyLimits = false;
  for (let i = 0; i < 6; i++) {
    const drive = drives[i];
    if (!isRotation(drive.Direction)) return null;
    const node = drive.node;
    const prev = i === 0 ? base : drives[i - 1].node;
    const parent = node.parent;
    if (!parent) return null;
    let a: Object3D | null = parent;
    while (a && a !== prev) a = a.parent;
    if (!a) return null;
    // The axis at its home pose: home local TRS under its (static) parent.
    const homeWorldPos = drive.getHomeLocalPosition(new Vector3()).applyMatrix4(parent.matrixWorld);
    const homeQ = relQ(parent).multiply(drive.getHomeLocalQuaternion(new Quaternion()));
    const prevQ = i === 0 ? new Quaternion() : relQ(prev);
    const prevPos = i === 0 ? new Vector3() : nodePos(prev);
    const offset = localPos(homeWorldPos).sub(prevPos).applyQuaternion(prevQ.clone().invert());
    const rot = prevQ.clone().invert().multiply(homeQ);
    axisHomePos.set([offset.x, offset.y, offset.z], i * 3);
    axisHomeRot.set([rot.x, rot.y, rot.z, rot.w], i * 4);
    const dir = directionToGltfAxis(drive.Direction);
    if (drive.ReverseDirection) dir.negate();
    axisDir.set([dir.x, dir.y, dir.z], i * 3);
    if (drive.UseLimits) anyLimits = true;
  }
  let tcpLocalOffset: [number, number, number] = [0, 0, 0];
  let tcpLocalRot: [number, number, number, number] = [0, 0, 0, 1];
  const tcp = robot.getTcpNode();
  if (tcp) {
    const a6 = drives[5].node;
    const a6Q = relQ(a6);
    const o = nodePos(tcp).sub(nodePos(a6)).applyQuaternion(a6Q.clone().invert());
    const r = a6Q.invert().multiply(relQ(tcp));
    tcpLocalOffset = [o.x, o.y, o.z];
    tcpLocalRot = [r.x, r.y, r.z, r.w];
  }
  const chain: JointChainParams = { axisHomePos, axisHomeRot, axisDir, tcpLocalOffset, tcpLocalRot };
  if (anyLimits) {
    chain.jointLimits = {
      lower: Float64Array.from(drives, (d) => (d.UseLimits ? d.LowerLimit : -360)),
      upper: Float64Array.from(drives, (d) => (d.UseLimits ? d.UpperLimit : 360)),
    };
  }
  return chain;
}
