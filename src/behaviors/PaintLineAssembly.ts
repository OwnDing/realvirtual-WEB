// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Data-driven runtime for a user-assembled paint line (EP-PLANNER-001).
 *
 * A PaintLineController owns the carrier templates and runtime counters. The
 * connected `PaintLineTrackModule` placements own topology; `PaintProcessZone`
 * placements own process volumes. No world coordinate or demo filename is a
 * process rule. An open, branched, reversed, or disconnected route is invalid
 * and remains stopped.
 */

import {
  Material,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { defineBehavior, type Behavior } from '../core/behaviors';
import type { BindContextHost, RVBindContext } from '../core/behavior-runtime';
import { lookRotation } from '../core/engine/rv-pose-align';
import type {
  SnapPoint,
  SnapPointRegistry,
} from '../core/engine/rv-snap-point-registry';
import { isCarrierName } from '../core/library-component-loader';

type Json = Record<string, unknown>;
type ProcessKind = 'load-unload' | 'pretreat' | 'spray' | 'dry' | 'cool' | 'buffer';

interface HostWithScene extends BindContextHost {
  scene?: Object3D;
  markRenderDirty?(): void;
}

interface TrackModule {
  owner: Object3D;
  dataNode: Object3D;
  points: Vector3[];
  input: SnapPoint;
  output: SnapPoint;
  key: string;
}

export interface PaintLineTopology {
  valid: boolean;
  reason: string;
  moduleCount: number;
  route: PaintLineRoute | null;
}

function record(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Json
    : null;
}

function rvData(node: Object3D): Json | null {
  return record(node.userData?.realvirtual);
}

function componentNode(root: Object3D, type: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (!found && record(rvData(node)?.[type])) found = node;
  });
  return found;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector(value: unknown): Vector3 | null {
  const data = record(value);
  if (!data) return null;
  const x = Number(data.x);
  const y = Number(data.y);
  const z = Number(data.z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? new Vector3(x, y, z)
    : null;
}

function pointsOf(node: Object3D): Vector3[] | null {
  const cfg = record(rvData(node)?.PaintLineTrackModule);
  const raw = cfg?.Points;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const points: Vector3[] = [];
  node.updateWorldMatrix(true, false);
  for (const item of raw) {
    const point = vector(item);
    if (!point) return null;
    points.push(point.applyMatrix4(node.matrixWorld));
  }
  return points;
}

function stableOwnerKey(owner: Object3D): string {
  return String(owner.userData?._layoutId ?? owner.userData?.realvirtual?.NodeId ?? owner.name ?? owner.uuid);
}

/** Closed piecewise-linear route sampled by arc length. */
export class PaintLineRoute {
  readonly points: readonly Vector3[];
  readonly length: number;
  private readonly _prefix: number[] = [];
  private readonly _lengths: number[] = [];

  constructor(points: readonly Vector3[]) {
    if (points.length < 3) throw new Error('PaintLineRoute needs at least three distinct points');
    this.points = points.map((point) => point.clone());
    let total = 0;
    for (let i = 0; i < this.points.length; i++) {
      const next = this.points[(i + 1) % this.points.length];
      const length = this.points[i].distanceTo(next);
      if (length <= 1e-6) throw new Error('PaintLineRoute contains a zero-length segment');
      this._prefix.push(total);
      this._lengths.push(length);
      total += length;
    }
    this.length = total;
  }

  sample(s: number, position: Vector3, tangent: Vector3): void {
    const wrapped = this.length > 0 ? ((s % this.length) + this.length) % this.length : 0;
    let lo = 0;
    let hi = this._prefix.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this._prefix[mid] <= wrapped) lo = mid;
      else hi = mid - 1;
    }
    const next = this.points[(lo + 1) % this.points.length];
    const t = (wrapped - this._prefix[lo]) / this._lengths[lo];
    position.copy(this.points[lo]).lerp(next, t);
    tangent.subVectors(next, this.points[lo]).normalize();
  }
}

function invalid(reason: string, moduleCount: number): PaintLineTopology {
  return { valid: false, reason, moduleCount, route: null };
}

/**
 * Resolve one deterministic in→out closed loop from registry pairings.
 * Every discovered track module must belong to exactly that loop.
 */
export function buildPaintLineTopology(registry: SnapPointRegistry): PaintLineTopology {
  const modules: TrackModule[] = [];
  for (const owner of registry.getOwnerRoots()) {
    const dataNode = componentNode(owner, 'PaintLineTrackModule');
    if (!dataNode) continue;
    const points = pointsOf(dataNode);
    const snaps = registry.getByOwnerRoot(owner);
    const input = snaps.find((snap) => snap.portId === 'track.in');
    const output = snaps.find((snap) => snap.portId === 'track.out');
    if (!points) return invalid(`Track module '${owner.name}' has invalid Points metadata`, modules.length + 1);
    if (!input || !output) return invalid(`Track module '${owner.name}' needs stable track.in and track.out ports`, modules.length + 1);
    modules.push({ owner, dataNode, points, input, output, key: stableOwnerKey(owner) });
  }
  if (modules.length < 2) return invalid('At least two connected track modules are required', modules.length);
  modules.sort((a, b) => a.key.localeCompare(b.key));

  const bySnapId = new Map<string, { module: TrackModule; role: 'in' | 'out' }>();
  for (const module of modules) {
    bySnapId.set(module.input.id, { module, role: 'in' });
    bySnapId.set(module.output.id, { module, role: 'out' });
    if (!module.input.pairedSnapId || !module.output.pairedSnapId) {
      return invalid(`Track module '${module.owner.name}' has an open port`, modules.length);
    }
  }

  const ordered: TrackModule[] = [];
  const visited = new Set<TrackModule>();
  const start = modules[0];
  let current = start;
  for (;;) {
    if (visited.has(current)) return invalid('Track topology contains a premature cycle', modules.length);
    visited.add(current);
    ordered.push(current);
    const partnerId = current.output.pairedSnapId;
    const next = partnerId ? bySnapId.get(partnerId) : undefined;
    if (!next || next.role !== 'in') {
      return invalid(`Output of '${current.owner.name}' is not paired to another module input`, modules.length);
    }
    if (next.module === start) break;
    current = next.module;
  }
  if (visited.size !== modules.length) return invalid('Track topology has disconnected modules or a second loop', modules.length);

  const routePoints: Vector3[] = [];
  for (const module of ordered) {
    for (const point of module.points) {
      if (routePoints.length === 0 || routePoints[routePoints.length - 1].distanceTo(point) > 1e-4) {
        routePoints.push(point.clone());
      }
    }
  }
  if (routePoints.length > 1 && routePoints[routePoints.length - 1].distanceTo(routePoints[0]) <= 0.03) {
    routePoints.pop();
  } else {
    return invalid('Connected port graph does not form a geometrically closed route', modules.length);
  }
  try {
    const route = new PaintLineRoute(routePoints);
    return { valid: true, reason: '', moduleCount: modules.length, route };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error), modules.length);
  }
}

interface ProcessZone {
  id: string;
  kind: ProcessKind;
  inverse: import('three').Matrix4;
  center: Vector3;
  halfSize: Vector3;
}

const PROCESS_KINDS = new Set<ProcessKind>([
  'load-unload', 'pretreat', 'spray', 'dry', 'cool', 'buffer',
]);

function collectZones(scene: Object3D | undefined): ProcessZone[] {
  if (!scene) return [];
  const zones: ProcessZone[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    const cfg = record(rvData(node)?.PaintProcessZone);
    const kind = cfg?.Kind as ProcessKind | undefined;
    const center = vector(cfg?.Center);
    const size = vector(cfg?.Size);
    if (!cfg || !kind || !PROCESS_KINDS.has(kind) || !center || !size) return;
    zones.push({
      id: String(cfg.ZoneId ?? `${node.uuid}.${kind}`),
      kind,
      inverse: node.matrixWorld.clone().invert(),
      center,
      halfSize: size.multiplyScalar(0.5),
    });
  });
  return zones;
}

function contains(zone: ProcessZone, world: Vector3, scratch: Vector3): boolean {
  scratch.copy(world).applyMatrix4(zone.inverse).sub(zone.center);
  return Math.abs(scratch.x) <= zone.halfSize.x
    && Math.abs(scratch.y) <= zone.halfSize.y
    && Math.abs(scratch.z) <= zone.halfSize.z;
}

interface MaterialSet {
  mesh: Mesh;
  original: Material | Material[];
  raw: Material | Material[];
  painted: Material | Material[];
}

function clonedMaterial(value: Material | Material[], painted: boolean): Material | Material[] {
  const cloneOne = (material: Material): Material => {
    const clone = material.clone();
    const color = (clone as Material & { color?: { setHex(hex: number): void } }).color;
    if (painted) color?.setHex(0x2f78c4);
    return clone;
  };
  return Array.isArray(value) ? value.map(cloneOne) : cloneOne(value);
}

function disposeMaterial(value: Material | Material[]): void {
  if (Array.isArray(value)) value.forEach((material) => material.dispose());
  else value.dispose();
}

interface CarrierState {
  node: Object3D;
  /** Representative workpiece point used for process-volume membership. */
  processNode: Object3D;
  visuals: MaterialSet[];
  painted: boolean;
  inLoad: boolean;
}

function prepareCarriers(root: Object3D): CarrierState[] {
  const carriers: CarrierState[] = [];
  root.traverse((node) => {
    if (!isCarrierName(node.name)) return;
    const visuals: MaterialSet[] = [];
    node.traverse((child) => {
      if (!(child as Mesh).isMesh || !/^Workpiece(?:-|$)/i.test(child.name)) return;
      const mesh = child as Mesh;
      const original = mesh.material;
      visuals.push({
        mesh,
        original,
        raw: clonedMaterial(original, false),
        painted: clonedMaterial(original, true),
      });
    });
    carriers.push({
      node,
      processNode: visuals[0]?.mesh ?? node,
      visuals,
      painted: false,
      inLoad: false,
    });
  });
  carriers.sort((a, b) => a.node.name.localeCompare(b.node.name));
  return carriers;
}

function setPainted(carrier: CarrierState, painted: boolean): void {
  if (carrier.painted === painted) return;
  carrier.painted = painted;
  for (const visual of carrier.visuals) visual.mesh.material = painted ? visual.painted : visual.raw;
}

function isDescendantOrSelf(node: Object3D, root: Object3D): boolean {
  let current: Object3D | null = node;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

interface PaintRobotRuntime {
  root: Object3D;
  drives: BindContextHost['drives'];
}

function collectRobots(scene: Object3D | undefined, host: BindContextHost): PaintRobotRuntime[] {
  if (!scene) return [];
  const robots: PaintRobotRuntime[] = [];
  scene.traverse((node) => {
    if (!record(rvData(node)?.PaintProcessRobot)) return;
    robots.push({ root: node, drives: host.drives.filter((drive) => isDescendantOrSelf(drive.node, node)) });
  });
  return robots;
}

function configNode(root: Object3D): { node: Object3D; config: Json } | null {
  const node = componentNode(root, 'PaintLineController');
  if (!node) return null;
  return { node, config: record(rvData(node)?.PaintLineController) ?? {} };
}

function setRuntimeStatus(node: Object3D, topology: PaintLineTopology): void {
  const rv = rvData(node);
  if (!rv) return;
  rv.PaintLineRuntime = {
    AssemblyValid: topology.valid,
    Reason: topology.reason,
    ModuleCount: topology.moduleCount,
    RouteLength: topology.route?.length ?? 0,
  };
}

function bindPaintLine(rv: RVBindContext): void {
  const controller = configNode(rv.root);
  if (!controller) return;
  const controllerNode = controller.node;
  const host = rv.viewer as HostWithScene;
  const config = controller.config;
  const carriers = prepareCarriers(rv.root);
  const targetSpeedMps = Math.max(0, finiteNumber(config.TargetSpeed, 300)) / 1000;
  const pitchM = Math.max(0.05, finiteNumber(config.Pitch, 1500) / 1000);
  const piecesPerCarrier = Math.max(1, Math.round(finiteNumber(config.PiecesPerCarrier, 2)));
  const runOnStart = config.RunOnStart !== false;

  rv.signal('PaintLine.Run', { type: 'PLCInputBool', initialValue: runOnStart });
  rv.signal('PaintLine.GateOpen', { type: 'PLCInputBool', initialValue: true });
  rv.signal('PaintLine.AssemblyValid', { type: 'PLCOutputBool', initialValue: false });
  rv.signal('PaintLine.Moving', { type: 'PLCOutputBool', initialValue: false });
  rv.signal('PaintLine.Position', { type: 'PLCOutputFloat', initialValue: 0 });
  rv.signal('PaintLine.CycleSeconds', { type: 'PLCOutputFloat', initialValue: 0 });
  rv.signal('PaintLine.PiecesPerHour', { type: 'PLCOutputFloat', initialValue: 0 });
  rv.signal('PaintLine.WipPieces', { type: 'PLCOutputInt', initialValue: 0 });
  rv.signal('PaintLine.BufferPieces', { type: 'PLCOutputInt', initialValue: 0 });
  rv.signal('PaintLine.TotalPieces', { type: 'PLCOutputInt', initialValue: 0 });
  rv.signal('PaintLine.PaintedPieces', { type: 'PLCOutputInt', initialValue: 0 });

  let registry: SnapPointRegistry | null = null;
  let registryRevision = -1;
  let topology: PaintLineTopology = invalid('Snap-point registry is unavailable', 0);
  let zones: ProcessZone[] = [];
  let robots: PaintRobotRuntime[] = [];
  let hasGate = false;
  let topologyDirty = true;
  let phaseM = 0;
  let elapsed = 0;
  let lastUnloadAt: number | null = null;
  let cycleSeconds = 0;
  let piecesPerHour = 0;
  let totalPieces = 0;
  let paintedPieces = 0;
  let lastReason = '';
  let robotCommandTimer = 0;

  const position = new Vector3();
  const tangent = new Vector3();
  const flat = new Vector3();
  const worldPosition = new Vector3();
  const localPosition = new Vector3();
  const zoneScratch = new Vector3();
  const up = new Vector3(0, 1, 0);
  const worldRotation = new Quaternion();
  const parentWorldInverse = new Quaternion();

  const markTopologyDirty = (): void => { topologyDirty = true; };
  rv.on('layout-content-added', markTopologyDirty);
  rv.on('layout-transform-update', markTopologyDirty);
  rv.on('layout-drag-end', markTopologyDirty);

  function rebuild(): void {
    const plugin = host.getPlugin?.('snap-point') as { getRegistry?(): SnapPointRegistry } | undefined;
    registry = plugin?.getRegistry?.() ?? null;
    topology = registry ? buildPaintLineTopology(registry) : invalid('Snap-point registry is unavailable', 0);
    registryRevision = registry?.revision ?? -1;
    zones = collectZones(host.scene);
    robots = collectRobots(host.scene, host);
    hasGate = false;
    host.scene?.traverse((node) => {
      if (record(rvData(node)?.PaintLineGate)) hasGate = true;
    });
    setRuntimeStatus(controllerNode, topology);
    rv.signals.set('PaintLine.AssemblyValid', topology.valid);
    rv.signals.set('PaintLine.WipPieces', topology.valid ? carriers.length * piecesPerCarrier : 0);
    if (!topology.valid && topology.reason !== lastReason) {
      console.warn(`[PaintLineAssembly] ${topology.reason}`);
    }
    lastReason = topology.reason;
    topologyDirty = false;
  }

  rv.onFixedUpdate((dt) => {
    const liveRegistry = (host.getPlugin?.('snap-point') as { getRegistry?(): SnapPointRegistry } | undefined)
      ?.getRegistry?.() ?? null;
    if (topologyDirty || liveRegistry !== registry || (liveRegistry?.revision ?? -1) !== registryRevision) rebuild();

    elapsed += dt;
    const run = rv.signals.get<boolean>('PaintLine.Run') === true;
    const gateOpen = !hasGate || rv.signals.get<boolean>('PaintLine.GateOpen') !== false;
    const moving = topology.valid && !!topology.route && run && gateOpen && targetSpeedMps > 0;
    if (moving) phaseM = (phaseM + targetSpeedMps * dt) % topology.route!.length;

    let bufferPieces = 0;
    let spraying = false;
    if (topology.valid && topology.route) {
      for (let i = 0; i < carriers.length; i++) {
        const carrier = carriers[i];
        topology.route.sample(phaseM + i * pitchM, position, tangent);
        flat.copy(tangent).addScaledVector(up, -tangent.dot(up));
        if (flat.lengthSq() > 1e-10) lookRotation(flat.normalize(), up, worldRotation);

        const parent = carrier.node.parent;
        if (parent) {
          parent.updateWorldMatrix(true, false);
          localPosition.copy(position);
          parent.worldToLocal(localPosition);
          carrier.node.position.copy(localPosition);
          parent.getWorldQuaternion(parentWorldInverse).invert();
          carrier.node.quaternion.copy(parentWorldInverse).multiply(worldRotation);
        } else {
          carrier.node.position.copy(position);
          carrier.node.quaternion.copy(worldRotation);
        }
        carrier.node.updateWorldMatrix(true, false);
        // Process zones describe where the workpiece travels, not the trolley
        // on top of the overhead rail. Sampling the carrier root would sit
        // above every authored tunnel volume and silently suppress processing.
        carrier.processNode.getWorldPosition(worldPosition);

        let inLoad = false;
        let inSpray = false;
        let inBuffer = false;
        for (const zone of zones) {
          if (!contains(zone, worldPosition, zoneScratch)) continue;
          if (zone.kind === 'load-unload') inLoad = true;
          else if (zone.kind === 'spray') inSpray = true;
          else if (zone.kind === 'buffer') inBuffer = true;
        }
        if (inBuffer) bufferPieces += piecesPerCarrier;
        if (inSpray) {
          spraying = true;
          if (!carrier.painted) {
            setPainted(carrier, true);
            paintedPieces += piecesPerCarrier;
          }
        }
        if (inLoad && !carrier.inLoad) {
          totalPieces += piecesPerCarrier;
          if (lastUnloadAt !== null) {
            cycleSeconds = Math.max(0, elapsed - lastUnloadAt);
            piecesPerHour = cycleSeconds > 1e-6 ? piecesPerCarrier * 3600 / cycleSeconds : 0;
          }
          lastUnloadAt = elapsed;
          setPainted(carrier, false);
        }
        carrier.inLoad = inLoad;
      }
    }

    robotCommandTimer -= dt;
    if (spraying && robotCommandTimer <= 0) {
      const sweep = 18 * Math.sin(elapsed * Math.PI / 2);
      for (const robot of robots) {
        for (const drive of robot.drives) {
          if (drive.node.name === 'A1') drive.startMove?.(sweep);
          if (drive.node.name === 'A5') drive.startMove?.(-35 + sweep * 0.35);
        }
      }
      robotCommandTimer = 0.2;
    }

    rv.signals.set('PaintLine.Moving', moving);
    rv.signals.set('PaintLine.Position', phaseM * 1000);
    rv.signals.set('PaintLine.CycleSeconds', cycleSeconds);
    rv.signals.set('PaintLine.PiecesPerHour', piecesPerHour);
    rv.signals.set('PaintLine.BufferPieces', bufferPieces);
    rv.signals.set('PaintLine.TotalPieces', totalPieces);
    rv.signals.set('PaintLine.PaintedPieces', paintedPieces);
    if (moving) host.markRenderDirty?.();
  });

  rv.onReset(() => {
    phaseM = 0;
    elapsed = 0;
    lastUnloadAt = null;
    cycleSeconds = 0;
    piecesPerHour = 0;
    totalPieces = 0;
    paintedPieces = 0;
    for (const carrier of carriers) {
      carrier.inLoad = false;
      setPainted(carrier, false);
    }
    topologyDirty = true;
  });
  rv.onStart(() => rv.signals.set('PaintLine.Run', runOnStart));
  rv.onDispose(() => {
    for (const carrier of carriers) {
      for (const visual of carrier.visuals) {
        visual.mesh.material = visual.original;
        disposeMaterial(visual.raw);
        disposeMaterial(visual.painted);
      }
    }
  });
}

export const PaintLineAssemblyBehavior: Behavior = defineBehavior({
  // Standalone GLB filename and the catalog's humanised placement label.
  models: ['*PaintLineController*', '*Paint Line Controller*'],
  bind: bindPaintLine,
});

export default PaintLineAssemblyBehavior;
