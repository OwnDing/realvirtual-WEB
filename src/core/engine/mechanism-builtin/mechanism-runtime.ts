// SPDX-License-Identifier: AGPL-3.0-only

/**
 * mechanism-runtime — the community rigid-body mechanism support (ADR-0026):
 * component factories for KinematicMechanism / KinematicJoint / KinematicTarget /
 * MechanismBody, the manager behind `setKinematicManager()`, the panel bridge
 * behind `setMechanismUiBridge()` and the per-tick solve.
 *
 * Link classification (the schema calls Body B "the moving link"):
 *   static  — the world, and links that only ever appear as Body A
 *   driven  — a Drive on the link or an ancestor moves it
 *   free    — every other Body B; the solver places it
 *
 * Joint data is read from the raw extras (Unity coordinates: millimetres,
 * X mirrored). Inverse tracking (KinematicTarget.TrackingActive) and the
 * inverse-dynamics force analysis are not part of this implementation and say
 * so (finding / status) instead of guessing.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ComponentContext, ComponentSchema, RVComponent } from '../rv-component-registry';
import { loadSchemaFromSpec, registerComponent, setComponentInstance } from '../rv-component-registry';
import type { RVDrive } from '../rv-drive';
import { isRotation } from '../rv-coordinate-utils';
import type {
  KinematicManagerLike, KinematicMechanismHandle, MechanismFindingView, MechanismForcesSnapshot, MechanismJointView,
  MechanismLinkView, MechanismUiBridge, MechanismView,
} from '../rv-kinematic-registry';
import { setKinematicManager, setMechanismUiBridge } from '../rv-kinematic-registry';
import { anchorGap, jointValue, makeJoint, solve, topologyFigures, type MechJointType, type SolverBody, type SolverJoint } from './mechanism-solver';
import { qConj, qRotate, sub, type Q, type V3 } from '../ik-builtin/chain-kinematics';

type Raw = Record<string, unknown>;
const JOINT_KEY = /^KinematicJoint(_\d+)?$/;
const JOINT_TYPES: readonly MechJointType[] = ['Revolute', 'Prismatic', 'Spherical', 'Universal'];
const DEG = Math.PI / 180;

const rvOf = (node: Object3D): Record<string, Raw> => (node.userData?.realvirtual ?? {}) as Record<string, Raw>;
function refPath(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string') return (v as { path: string }).path || null;
  return null;
}
/** Unity local mm (X mirrored) → glTF local m. */
const unityPoint = (v: unknown): V3 => { const o = (v ?? {}) as { x?: number; y?: number; z?: number }; return [-(o.x ?? 0) / 1000, (o.y ?? 0) / 1000, (o.z ?? 0) / 1000]; };
const unityDir = (v: unknown): V3 => { const o = (v ?? {}) as { x?: number; y?: number; z?: number }; return [-(o.x ?? 0), o.y ?? 0, o.z ?? 0]; };
const toUnityMm = (v: V3) => ({ x: -v[0] * 1000, y: v[1] * 1000, z: v[2] * 1000 });

// ─── Components ────────────────────────────────────────────────────────────

class DataComponent implements RVComponent {
  isOwner = true;
  constructor(readonly node: Object3D) {}
  init(_ctx: ComponentContext): void { /* pure data, read by the mechanism */ }
}

export class RVKinematicMechanism extends DataComponent implements KinematicMechanismHandle {
  static readonly schema: ComponentSchema = loadSchemaFromSpec('KinematicMechanism');
  SolverIterations = 4;
  Damping = 0.01;
  Tolerance = 0.001;
  Converged = true;
  ResidualError = 0;
  SolveTimeMs = 0;
  ctx: ComponentContext | null = null;

  init(ctx: ComponentContext): void {
    this.ctx = ctx;
    manager.register(this);
  }

  onSceneReady(ctx: ComponentContext): void {
    this.ctx = ctx;
    manager.build(this);
    manager.notifyBuilt(this);
  }

  dispose(): void { manager.unregister(this); }

  getLiveState(): Record<string, unknown> {
    return { Converged: this.Converged, ResidualError: this.ResidualError, SolveTimeMs: this.SolveTimeMs };
  }
}

let componentsRegistered = false;
function registerMechanismComponents(): void {
  if (componentsRegistered) return;
  componentsRegistered = true;
  registerComponent({
    type: 'KinematicMechanism', displayName: 'Kinematic Mechanism', schema: RVKinematicMechanism.schema,
    capabilities: { selectable: true, inspectorVisible: true, hierarchyVisible: true, badgeColor: '#8d6e63', filterLabel: 'Mechanisms' },
    create: (node) => new RVKinematicMechanism(node), afterCreate: (inst, node) => setComponentInstance(node, inst),
  });
  for (const type of ['KinematicJoint', 'KinematicTarget', 'MechanismBody'] as const) {
    registerComponent({
      type, schema: loadSchemaFromSpec(type),
      capabilities: { inspectorVisible: true, hierarchyVisible: true, badgeColor: '#a1887f' },
      create: (node) => new DataComponent(node),
    });
  }
}

// ─── Built mechanism ───────────────────────────────────────────────────────

interface JointRecord {
  node: Object3D;
  key: string;
  raw: Raw;
  type: MechJointType;
  bodyA: Object3D | null;
  bodyB: Object3D | null;
  drive: RVDrive | null;
  /** The drive moves Body B through the hierarchy (no imposed value needed). */
  driveMovesB: boolean;
  solver: SolverJoint | null;
  value: number;
}

interface Built {
  mech: RVKinematicMechanism;
  joints: JointRecord[];
  links: Object3D[];
  bodies: SolverBody[];
  kinds: Array<'static' | 'driven' | 'free'>;
  solverJoints: SolverJoint[];
  length: number;
  dof: number;
  loops: number;
  findings: MechanismFindingView[];
  disabledReason: string;
}

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

function readPose(node: Object3D): { pos: V3; rot: Q } {
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(_p, _q, _s);
  return { pos: [_p.x, _p.y, _p.z], rot: [_q.x, _q.y, _q.z, _q.w] };
}

function writePose(node: Object3D, pose: { pos: V3; rot: Q }): void {
  node.matrixWorld.decompose(_p, _q, _s);
  _m.compose(new Vector3(...pose.pos), new Quaternion(...pose.rot), _s);
  if (node.parent) _m.premultiply(new Matrix4().copy(node.parent.matrixWorld).invert());
  _m.decompose(node.position, node.quaternion, node.scale);
  node.updateMatrixWorld(true);
}

class BuiltinMechanismManager implements KinematicManagerLike, MechanismUiBridge {
  private readonly registered = new Set<RVKinematicMechanism>();
  private readonly built = new Map<RVKinematicMechanism, Built>();
  /** Where `SignalConverged` is written (the viewer's SignalStore). */
  signals: { setByPath(path: string, value: boolean): void } | null = null;

  get size(): number { return this.registered.size; }

  register(m: KinematicMechanismHandle): void { this.registered.add(m as RVKinematicMechanism); }
  unregister(m: KinematicMechanismHandle): void {
    this.registered.delete(m as RVKinematicMechanism);
    this.built.delete(m as RVKinematicMechanism);
  }
  notifyBuilt(_m?: KinematicMechanismHandle): void { /* build() already ran */ }
  clear(): void { this.registered.clear(); this.built.clear(); }

  build(mech: RVKinematicMechanism): void {
    const ctx = mech.ctx;
    if (!ctx) return;
    const registry = ctx.registry;
    const findings: MechanismFindingView[] = [];
    const pathOf = (n: Object3D) => registry.getPathForNode(n) ?? n.name;
    const drives = registry.getAll<RVDrive>('Drive').map((d) => d.instance);
    const driveOfNode = (n: Object3D | null) => (n ? drives.find((d) => d.node === n) ?? null : null);
    const movedByDrive = (n: Object3D): RVDrive | null => { for (let a: Object3D | null = n; a; a = a.parent) { const d = driveOfNode(a); if (d) return d; } return null; };

    const joints: JointRecord[] = [];
    mech.node.traverse((node) => {
      for (const [key, raw] of Object.entries(rvOf(node))) {
        if (!JOINT_KEY.test(key) || !raw || raw['_enabled'] === false) continue;
        const type = (JOINT_TYPES as readonly unknown[]).includes(raw['JointType']) ? raw['JointType'] as MechJointType : 'Revolute';
        const resolve = (field: string): Object3D | null | undefined => {
          const path = refPath(raw[field]);
          if (!path) return null;
          const found = registry.getNode(path);
          if (!found) findings.push({ code: 'UnresolvedBody', severity: 'Error', message: `${node.name}: ${field} "${path}" not found`, jointPath: pathOf(node), fixable: false });
          return found ?? undefined;
        };
        const bodyA = resolve('BodyA');
        const bodyB = resolve('BodyB');
        const driveNode = resolve('DrivenBy');
        if (bodyB === null) findings.push({ code: 'MissingBodyB', severity: 'Error', message: `${node.name}: Body B is required`, jointPath: pathOf(node), fixable: false });
        if (type === 'Universal' && !refPath(raw['SecondaryAxisB']) && unityDir(raw['SecondaryAxisB']).every((x) => x === 0)) {
          findings.push({ code: 'MissingSecondaryAxis', severity: 'Error', message: `${node.name}: a Universal joint needs SecondaryAxisB`, jointPath: pathOf(node), fixable: false });
        }
        const drive = driveNode ? driveOfNode(driveNode) : null;
        if (bodyA && bodyA === bodyB) findings.push({ code: 'SameBodyAAndB', severity: 'Error', message: `${node.name}: Body A and Body B are the same link`, jointPath: pathOf(node), fixable: false });
        if (drive && (type === 'Revolute' || type === 'Prismatic') && isRotation(drive.Direction) !== (type === 'Revolute')) {
          findings.push({ code: 'DriveTypeMismatch', severity: 'Error', message: `${node.name}: a ${type} joint is driven by a ${isRotation(drive.Direction) ? 'rotary' : 'linear'} drive`, jointPath: pathOf(node), fixable: false });
        }
        joints.push({
          node, key, raw, type, bodyA: bodyA ?? null, bodyB: bodyB ?? null, drive,
          driveMovesB: !!(drive && bodyB && movedByDrive(bodyB) === drive), solver: null, value: Number(raw['CurrentValue']) || 0,
        });
      }
    });

    // Links and their classification.
    const links: Object3D[] = [];
    const indexOf = (n: Object3D) => { let i = links.indexOf(n); if (i < 0) { links.push(n); i = links.length - 1; } return i; };
    for (const j of joints) { if (j.bodyA) indexOf(j.bodyA); if (j.bodyB) indexOf(j.bodyB); }
    const isB = new Set(joints.map((j) => j.bodyB).filter(Boolean));
    const kinds = links.map((n) => (movedByDrive(n) ? 'driven' : isB.has(n) ? 'free' : 'static') as Built['kinds'][number]);
    const bodies: SolverBody[] = links.map((n, i) => ({ pose: readPose(n), free: kinds[i] === 'free' }));
    for (const [i, n] of links.entries()) {
      if (kinds[i] === 'free' && n.matrixAutoUpdate === false) {
        findings.push({ code: 'LinkFrozen', severity: 'Warning', message: `${n.name} was merged into static geometry at load (no Drive/Kinematic component): its motion is solved but cannot be shown`, jointPath: null, fixable: false });
      }
    }

    // Solver joints in the authored pose; anchors scaled by the link's world scale.
    const scaled = (n: Object3D | null, v: V3): V3 => { if (!n) return v; n.getWorldScale(_s); return [v[0] * _s.x, v[1] * _s.y, v[2] * _s.z]; };
    const solverJoints: SolverJoint[] = [];
    let length = 0;
    for (const j of joints) {
      if (!j.bodyB) continue;
      const axis = unityDir(j.raw['AxisA']);
      if ((j.type === 'Revolute' || j.type === 'Prismatic' || j.type === 'Universal') && axis.every((x) => x === 0)) {
        findings.push({ code: 'ZeroAxis', severity: 'Error', message: `${j.node.name}: AxisA is zero`, jointPath: pathOf(j.node), fixable: false });
        continue;
      }
      j.solver = makeJoint({
        type: j.type, a: j.bodyA ? links.indexOf(j.bodyA) : -1, b: links.indexOf(j.bodyB),
        anchorA: scaled(j.bodyA, unityPoint(j.raw['AnchorA'])), anchorB: scaled(j.bodyB, unityPoint(j.raw['AnchorB'])),
        axisA: axis, secondaryB: unityDir(j.raw['SecondaryAxisB']),
      }, bodies);
      solverJoints.push(j.solver);
      const pa = j.bodyA ? bodies[links.indexOf(j.bodyA)].pose : { pos: [0, 0, 0] as V3, rot: [0, 0, 0, 1] as Q };
      const wa: V3 = [pa.pos[0] + qRotate(pa.rot, j.solver.anchorA)[0], pa.pos[1] + qRotate(pa.rot, j.solver.anchorA)[1], pa.pos[2] + qRotate(pa.rot, j.solver.anchorA)[2]];
      for (const other of links) { const p = readPose(other).pos; length = Math.max(length, Math.hypot(...sub(p, wa))); }
    }
    length = Math.max(length, 0.01);
    const tolerance = Math.max(Number(mech.Tolerance) || 0.001, 1e-6);
    for (const j of joints) {
      if (j.solver && anchorGap(j.solver, bodies) > tolerance * length) {
        findings.push({ code: 'AnchorsApart', severity: 'Warning', message: `${j.node.name}: anchors are ${(anchorGap(j.solver, bodies) * 1000).toFixed(1)} mm apart in the authored pose`, jointPath: pathOf(j.node), fixable: true });
      }
    }
    for (const reg of registry.getAll<DataComponent>('KinematicTarget')) {
      const raw = rvOf(reg.instance.node)['KinematicTarget'];
      if (raw && raw['TrackingActive'] === true && refPath(raw['Mechanism']) === pathOf(mech.node)) {
        findings.push({ code: 'InverseModeUnsupported', severity: 'Warning', message: `${reg.instance.node.name}: inverse tracking is not supported by the built-in solver; the mechanism follows its drives`, jointPath: null, fixable: false });
      }
    }
    const { dof, loops } = topologyFigures(bodies, solverJoints, length);
    const disabledReason = findings.some((f) => f.severity === 'Error') ? 'The mechanism has errors (see findings).' : '';
    this.built.set(mech, { mech, joints, links, bodies, kinds, solverJoints, length, dof, loops, findings, disabledReason });
  }

  /** Prepare → solve → write back one mechanism. */
  step(b: Built): { converged: boolean; residualError: number } {
    const t0 = performance.now();
    for (let i = 0; i < b.links.length; i++) if (b.kinds[i] !== 'free') b.bodies[i].pose = readPose(b.links[i]);
    for (const j of b.joints) {
      if (!j.solver) continue;
      // A drive on a FREE body B imposes the joint value (Unity sign convention: X is mirrored).
      j.solver.imposed = j.drive && !j.driveMovesB
        ? (j.type === 'Prismatic' ? j.drive.currentPosition / 1000 : -j.drive.currentPosition * DEG)
        : null;
    }
    const res = solve(b.bodies, b.solverJoints, {
      iterations: Math.max(1, Math.round(Number(b.mech.SolverIterations) || 4)),
      damping: Number(b.mech.Damping) || 0.01,
      tolerance: Math.max(Number(b.mech.Tolerance) || 0.001, 1e-6),
      length: b.length,
    });
    for (let i = 0; i < b.links.length; i++) if (b.kinds[i] === 'free') writePose(b.links[i], b.bodies[i].pose);
    for (const j of b.joints) {
      if (!j.solver) continue;
      const v = jointValue(j.solver, b.bodies);
      // Relative to the authored pose, in Unity units and sign (degrees / millimetres).
      j.value = j.type === 'Prismatic' ? v * 1000 : -v / DEG;
    }
    b.mech.Converged = res.converged;
    b.mech.ResidualError = res.residual;
    b.mech.SolveTimeMs = performance.now() - t0;
    const signal = refPath(rvOf(b.mech.node)['KinematicMechanism']?.['SignalConverged']);
    if (signal) this.signals?.setByPath(signal, res.converged);
    return { converged: res.converged, residualError: res.residual };
  }

  tick(): void {
    for (const b of this.built.values()) if (!b.disabledReason && b.solverJoints.length > 0) this.step(b);
  }

  // ── MechanismUiBridge ──────────────────────────────────────────────────

  private _find(path: string): Built | undefined {
    for (const b of this.built.values()) {
      const p = b.mech.ctx?.registry.getPathForNode(b.mech.node) ?? b.mech.node.name;
      if (p === path) return b;
    }
    return undefined;
  }

  list(): MechanismView[] {
    return [...this.built.values()].map((b) => this._view(b));
  }

  private _view(b: Built): MechanismView {
    const reg = b.mech.ctx?.registry;
    const pathOf = (n: Object3D | null) => (n ? reg?.getPathForNode(n) ?? n.name : null);
    const joints: MechanismJointView[] = b.joints.map((j) => {
      const pa = j.bodyA && j.solver ? b.bodies[j.solver.a].pose : { pos: [0, 0, 0] as V3, rot: [0, 0, 0, 1] as Q };
      const origin = j.solver ? qRotate(pa.rot, j.solver.anchorA) : [0, 0, 0] as V3;
      const axis = j.solver ? qRotate(pa.rot, j.solver.axisA) : [0, 0, 1] as V3;
      return {
        nodePath: pathOf(j.node)!, name: j.key === 'KinematicJoint' ? j.node.name : `${j.node.name} (${j.key})`, jointType: j.type,
        bodyAName: j.bodyA?.name ?? null, bodyBName: j.bodyB?.name ?? null, bodyAPath: pathOf(j.bodyA), bodyBPath: pathOf(j.bodyB),
        worldAnchored: !refPath(j.raw['BodyA']), driveName: j.drive?.node.name ?? null, currentValue: j.value,
        joggable: !!j.drive && (j.type === 'Revolute' || j.type === 'Prismatic'),
        lowerLimit: Number(j.raw['LowerLimit']) || 0, upperLimit: Number(j.raw['UpperLimit']) || 0, useLimits: j.raw['UseLimits'] === true,
        originWorld: [pa.pos[0] + origin[0], pa.pos[1] + origin[1], pa.pos[2] + origin[2]], axisWorld: axis,
      };
    });
    const links: MechanismLinkView[] = b.links.map((n) => {
      const body = rvOf(n)['MechanismBody'];
      return {
        nodePath: pathOf(n)!, name: n.name, hasBody: !!body, densityPreset: String(body?.['DensityPreset'] ?? 'steel'),
        densityKgM3: Number(body?.['DensityKgM3']) || 7850, massKg: Number(body?.['MassOverrideKg']) || 0, comLocalMm: [0, 0, 0],
        massOverridden: Number.isFinite(Number(body?.['MassOverrideKg'])) && body?.['MassOverrideKg'] !== undefined, comOverridden: body?.['ComOverrideLocalMm'] !== undefined,
        massSource: body?.['MassOverrideKg'] !== undefined ? 'override' : 'none',
        massWarning: body ? 'Mass properties are not computed by the built-in solver.' : '',
      };
    });
    return {
      nodePath: pathOf(b.mech.node)!, name: b.mech.node.name, active: !b.disabledReason, converged: b.mech.Converged,
      residualError: b.mech.ResidualError, solveTimeMs: b.mech.SolveTimeMs, disabledReason: b.disabledReason,
      jointCount: b.joints.length, linkCount: b.links.length, loopCount: b.loops, dof: b.dof, joints, links, findings: [...b.findings],
    };
  }

  validate(mechanismPath: string): MechanismFindingView[] {
    const b = this._find(mechanismPath);
    if (!b) return [];
    this.build(b.mech);
    return [...(this._find(mechanismPath)?.findings ?? [])];
  }

  jog(jointPath: string, value: number, componentType?: string): { converged: boolean; residualError: number } | null {
    for (const b of this.built.values()) {
      const j = b.joints.find((x) => (b.mech.ctx?.registry.getPathForNode(x.node) ?? x.node.name) === jointPath && (!componentType || x.key === componentType));
      if (!j) continue;
      if (!j.drive || (j.type !== 'Revolute' && j.type !== 'Prismatic')) return null;
      j.drive.currentPosition = value;
      j.drive.targetPosition = value;
      j.drive.applyToNode();
      return this.step(b);
    }
    return null;
  }

  rebuild(mechanismPath: string): void {
    const b = this._find(mechanismPath);
    if (b) this.build(b.mech);
  }

  suggestFix(jointPath: string, code: string): Record<string, unknown> | null {
    if (code !== 'AnchorsApart') return null;
    for (const b of this.built.values()) {
      const j = b.joints.find((x) => (b.mech.ctx?.registry.getPathForNode(x.node) ?? x.node.name) === jointPath);
      if (!j?.solver || !j.bodyB) continue;
      // Move Anchor B onto Anchor A, expressed in Body B's local frame.
      const pa = j.solver.a < 0 ? { pos: [0, 0, 0] as V3, rot: [0, 0, 0, 1] as Q } : b.bodies[j.solver.a].pose;
      const pb = b.bodies[j.solver.b].pose;
      const wa = qRotate(pa.rot, j.solver.anchorA).map((x, i) => x + pa.pos[i]) as V3;
      const local = qRotate(qConj(pb.rot), sub(wa, pb.pos));
      j.bodyB.getWorldScale(_s);
      return { AnchorB: toUnityMm([local[0] / (_s.x || 1), local[1] / (_s.y || 1), local[2] / (_s.z || 1)]) };
    }
    return null;
  }

  setForceAnalysis(): void { /* not available (see forcesSnapshot) */ }

  forcesSnapshot(mechanismPath: string): MechanismForcesSnapshot | null {
    if (!this._find(mechanismPath)) return null;
    return {
      mechanismPath, status: 1, statusText: 'Force analysis is not available in the built-in mechanism solver.',
      dynamicsValid: false, redundant: false, channels: [], joints: [],
    };
  }

  solveStatics(mechanismPath: string): MechanismForcesSnapshot | null { return this.forcesSnapshot(mechanismPath); }

  resetForces(): void { /* nothing recorded */ }
}

const manager = new BuiltinMechanismManager();

/**
 * Register the components and install manager + bridge (idempotent). The
 * per-tick solve is driven by `BuiltinMechanismsPlugin` (src/plugins), which
 * calls `builtinMechanismManager.tick()` after the drives moved.
 */
export function installBuiltinMechanismSupport(signals: BuiltinMechanismManager['signals']): BuiltinMechanismManager {
  manager.signals = signals;
  registerMechanismComponents();
  setKinematicManager(manager);
  setMechanismUiBridge(manager);
  return manager;
}

export const builtinMechanismManager = manager;
export type { BuiltinMechanismManager };
