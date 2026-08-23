// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import type { Mesh, Object3D } from 'three';
import { NodeRegistry } from '../../core/engine/rv-node-registry';
import type { AssetDocument } from '../../core/editor/rv-asset-document';
import type { NodeTransform } from '../../core/editor/rv-asset-ops';
import { SIGNAL_TYPES } from '../../core/engine/rv-signal-construction';
import { resolveAssemblyPort } from '../snap-point/assembly-port';
import type { SnapFlow } from '../snap-point/snap-name-parser';

export const SMART_SIGNAL_TYPES = SIGNAL_TYPES as readonly SmartSignalType[];

export type SmartSignalType =
  | 'PLCOutputBool' | 'PLCInputBool'
  | 'PLCOutputFloat' | 'PLCInputFloat'
  | 'PLCOutputInt' | 'PLCInputInt';

export type SmartTemplateId =
  | 'metadata'
  | 'transport-surface'
  | 'paint-track'
  | 'paint-process-zone'
  | 'paint-controller'
  | 'paint-robot';

export type PaintProcessKind = 'load-unload' | 'pretreat' | 'spray' | 'dry' | 'cool' | 'buffer';

export interface SmartTemplateOptions {
  length?: number;
  width?: number;
  height?: number;
  processKind?: PaintProcessKind;
  speed?: number;
  pitch?: number;
  runOnStart?: boolean;
  piecesPerCarrier?: number;
  label?: string;
}

export interface CreatePortInput {
  portId: string;
  typeId: string;
  flow: SnapFlow;
  position: [number, number, number];
  direction: [number, number, number];
  parentPath?: string | null;
}

export interface CreateSignalInput {
  name: string;
  type: SmartSignalType;
  comment?: string;
  initialValue?: boolean | number;
  parentPath?: string | null;
}

export type SmartAssetIssueSeverity = 'error' | 'warning';

export interface SmartAssetIssue {
  severity: SmartAssetIssueSeverity;
  code:
    | 'asset.empty'
    | 'node.name.empty'
    | 'node.id.duplicate'
    | 'port.invalid'
    | 'port.id.duplicate'
    | 'port.legacy.mismatch'
    | 'signal.name.duplicate'
    | 'signal.name.empty'
    | 'track.points.invalid'
    | 'track.ports.missing'
    | 'zone.kind.invalid'
    | 'zone.size.invalid'
    | 'controller.params.invalid'
    | 'robot.params.invalid'
    | 'transport.direction.invalid';
  path: string;
  detail?: string;
}

export interface SmartAssetReport {
  issues: SmartAssetIssue[];
  errorCount: number;
  warningCount: number;
  nodeCount: number;
  meshCount: number;
  portCount: number;
  signalCount: number;
  templateCount: number;
  publishable: boolean;
}

const PROCESS_KINDS = new Set<PaintProcessKind>([
  'load-unload', 'pretreat', 'spray', 'dry', 'cool', 'buffer',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function rvOf(node: Object3D): Record<string, unknown> {
  return isRecord(node.userData?.realvirtual) ? node.userData.realvirtual : {};
}

function finitePositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function vector(value: unknown): [number, number, number] | null {
  if (!isRecord(value)) return null;
  const out = [value.x, value.y, value.z];
  return out.every(v => typeof v === 'number' && Number.isFinite(v))
    ? out as [number, number, number]
    : null;
}

function nonZeroVector(value: unknown): boolean {
  const v = vector(value);
  return !!v && Math.hypot(...v) > 1e-8;
}

function pathOf(node: Object3D): string {
  return NodeRegistry.computeNodePath(node);
}

function componentKey(rv: Record<string, unknown>, baseType: string): string | null {
  return Object.keys(rv).find(key => key === baseType || key.startsWith(`${baseType}_`)) ?? null;
}

function componentRecord(node: Object3D, baseType: string): Record<string, unknown> | null {
  const rv = rvOf(node);
  const key = componentKey(rv, baseType);
  return key && isRecord(rv[key]) ? rv[key] : null;
}

/**
 * Escape text destined for `RuntimeMetadata.content`, which downstream readers
 * parse as markup (`<value label="…">` rows in the tooltip and order manager).
 * A node called `Motor & Pump` or `Clamp <A>` produced an unparseable document.
 */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeDirection(direction: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length <= 1e-8) {
    throw new Error('Assembly port direction must be finite and non-zero.');
  }
  return direction.map(v => v / length) as [number, number, number];
}

function legacyPortName(direction: [number, number, number], flow: SnapFlow, typeId: string): string {
  const abs = direction.map(Math.abs);
  const axis = abs[0] >= abs[1] && abs[0] >= abs[2] ? 'X' : abs[1] >= abs[2] ? 'Y' : 'Z';
  const sign = flow === 'in' ? 'N' : flow === 'out' ? 'P' : 'B';
  return `Snap-${axis}${sign}-${typeId}`;
}

function signalNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse(node => {
    const rv = rvOf(node);
    for (const type of SMART_SIGNAL_TYPES) {
      const key = componentKey(rv, type);
      if (!key || !isRecord(rv[key])) continue;
      const configured = rv[key].Name;
      names.add(typeof configured === 'string' && configured.trim() ? configured.trim() : node.name);
    }
  });
  return names;
}

/** Create one stable port and its permanent legacy-name compatibility form. */
export async function createAssemblyPort(
  doc: AssetDocument,
  root: Object3D,
  input: CreatePortInput,
): Promise<string> {
  const portId = input.portId.trim();
  const typeId = input.typeId.trim();
  if (!portId || !typeId) throw new Error('PortId and TypeId are required.');
  let duplicate = false;
  root.traverse(node => {
    const resolved = resolveAssemblyPort(node, root.name);
    if (resolved.kind === 'port' && resolved.port.portId === portId) duplicate = true;
  });
  if (duplicate) throw new Error(`Assembly port "${portId}" already exists.`);

  const direction = normalizeDirection(input.direction);
  const transform: NodeTransform = {
    position: [...input.position],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
  let created = '';
  await doc.withTransaction(`Create port ${portId}`, async () => {
    created = await doc.createEmptyNode(
      input.parentPath ?? null,
      legacyPortName(direction, input.flow, typeId),
      { transform },
    );
    doc.addComponent(created, 'AssemblyPort', {
      PortId: portId,
      TypeId: typeId,
      Flow: input.flow,
      Direction: { x: direction[0], y: direction[1], z: direction[2] },
    });
  });
  if (!doc.document.inTransaction) await doc.whenIdle();
  return created;
}

/** Create one existing rv-ODT PLC signal component on its own named node. */
export async function createPlcSignal(
  doc: AssetDocument,
  root: Object3D,
  input: CreateSignalInput,
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Signal name is required.');
  if (!SMART_SIGNAL_TYPES.includes(input.type)) throw new Error(`Unsupported signal type: ${input.type}`);
  if (signalNames(root).has(name)) throw new Error(`Signal "${name}" already exists.`);

  let created = '';
  await doc.withTransaction(`Create signal ${name}`, async () => {
    created = await doc.createEmptyNode(input.parentPath ?? null, name);
    doc.addComponent(created, input.type, {
      Name: name,
      Comment: input.comment?.trim() ?? '',
      OriginDataType: input.type.endsWith('Bool') ? 'BOOL' : input.type.endsWith('Int') ? 'DINT' : 'REAL',
      Active: 'Always',
      Status: { Value: input.initialValue ?? (input.type.endsWith('Bool') ? false : 0) },
    });
  });
  if (!doc.document.inTransaction) await doc.whenIdle();
  return created;
}

async function upsertComponent(
  doc: AssetDocument,
  node: Object3D,
  baseType: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const rv = rvOf(node);
  const key = componentKey(rv, baseType);
  const nodePath = pathOf(node);
  if (!key) {
    doc.addComponent(nodePath, baseType, fields);
    return;
  }
  const current = isRecord(rv[key]) ? rv[key] : {};
  for (const [field, value] of Object.entries(fields)) {
    doc.setField(nodePath, key, field, value, current[field]);
  }
}

/** Apply one opinionated template using only existing rv_extras component shapes. */
export async function applySmartTemplate(
  doc: AssetDocument,
  root: Object3D,
  target: Object3D,
  template: SmartTemplateId,
  options: SmartTemplateOptions = {},
): Promise<void> {
  const length = finitePositive(options.length) ? options.length! : 2;
  const width = finitePositive(options.width) ? options.width! : 2;
  const height = finitePositive(options.height) ? options.height! : 2;
  const targetPath = pathOf(target);

  await doc.withTransaction(`Apply ${template} template`, async () => {
    switch (template) {
      case 'metadata':
        await upsertComponent(doc, target, 'RuntimeMetadata', {
          content: `<metadata><name>${escapeXmlText(options.label?.trim() || target.name)}</name></metadata>`,
        });
        break;
      case 'transport-surface':
        await upsertComponent(doc, target, 'TransportSurface', {
          TransportDirection: { x: 0, y: 0, z: 1 },
          Radial: false,
          TextureScale: 1,
          HeightOffsetOverride: 0,
          AnimateSurface: true,
          DriveReference: '',
          Accumulate: true,
          MinGap: 100,
          PhysicsMode: false,
        });
        break;
      case 'paint-track': {
        await upsertComponent(doc, target, 'PaintLineTrackModule', {
          Version: 1,
          EntryPortId: 'track.in',
          ExitPortId: 'track.out',
          Points: [
            { x: 0, y: 0, z: -length / 2 },
            { x: 0, y: 0, z: length / 2 },
          ],
        });
        const existing = new Set<string>();
        root.traverse(node => {
          const resolved = resolveAssemblyPort(node, root.name);
          if (resolved.kind === 'port') existing.add(resolved.port.portId);
        });
        if (!existing.has('track.in')) {
          await createAssemblyPort(doc, root, {
            parentPath: targetPath,
            portId: 'track.in', typeId: 'paintline-track-v1', flow: 'in',
            position: [0, 0, -length / 2], direction: [0, 0, -1],
          });
        }
        if (!existing.has('track.out')) {
          await createAssemblyPort(doc, root, {
            parentPath: targetPath,
            portId: 'track.out', typeId: 'paintline-track-v1', flow: 'out',
            position: [0, 0, length / 2], direction: [0, 0, 1],
          });
        }
        break;
      }
      case 'paint-process-zone':
        await upsertComponent(doc, target, 'PaintProcessZone', {
          ZoneId: `${target.name || 'process'}.zone`,
          Kind: options.processKind && PROCESS_KINDS.has(options.processKind) ? options.processKind : 'spray',
          Center: { x: 0, y: height / 2, z: 0 },
          Size: { x: width, y: height, z: length },
        });
        break;
      case 'paint-controller':
        await upsertComponent(doc, target, 'PaintLineController', {
          TargetSpeed: finitePositive(options.speed) ? options.speed : 0.35,
          Pitch: finitePositive(options.pitch) ? options.pitch : 1.5,
          RunOnStart: options.runOnStart ?? true,
          PiecesPerCarrier: finitePositive(options.piecesPerCarrier) ? options.piecesPerCarrier : 1,
        });
        break;
      case 'paint-robot':
        await upsertComponent(doc, target, 'PaintProcessRobot', {
          RobotId: target.name || 'paint-robot',
          SpraySweepDegrees: 55,
          SprayPeriodSeconds: 2.4,
        });
        break;
    }
  });
  await doc.whenIdle();
}

function push(
  issues: SmartAssetIssue[],
  severity: SmartAssetIssueSeverity,
  code: SmartAssetIssue['code'],
  node: Object3D,
  detail?: string,
): void {
  issues.push({ severity, code, path: pathOf(node), ...(detail ? { detail } : {}) });
}

/** Deterministic, read-only publish analysis. It never repairs user data. */
export function validateSmartAsset(root: Object3D | null): SmartAssetReport {
  if (!root) {
    return {
      issues: [{ severity: 'error', code: 'asset.empty', path: '' }],
      errorCount: 1, warningCount: 0, nodeCount: 0, meshCount: 0,
      portCount: 0, signalCount: 0, templateCount: 0, publishable: false,
    };
  }

  const issues: SmartAssetIssue[] = [];
  const nodeIds = new Map<string, Object3D>();
  const portIds = new Map<string, Object3D>();
  const signals = new Map<string, Object3D>();
  let nodeCount = 0;
  let meshCount = 0;
  let portCount = 0;
  let signalCount = 0;
  let templateCount = 0;
  const tracks: Array<{ node: Object3D; config: Record<string, unknown> }> = [];

  root.traverse(node => {
    nodeCount++;
    if ((node as Mesh).isMesh) meshCount++;
    if (!node.name.trim()) push(issues, 'warning', 'node.name.empty', node);
    const rv = rvOf(node);
    const nodeId = typeof rv.NodeId === 'string' ? rv.NodeId.trim() : '';
    if (nodeId) {
      const previous = nodeIds.get(nodeId);
      if (previous) push(issues, 'error', 'node.id.duplicate', node, nodeId);
      else nodeIds.set(nodeId, node);
    }

    const resolvedPort = resolveAssemblyPort(node, root.name);
    if (resolvedPort.kind === 'invalid') {
      push(issues, 'error', 'port.invalid', node, resolvedPort.reason);
    } else if (resolvedPort.kind === 'port') {
      portCount++;
      const previous = portIds.get(resolvedPort.port.portId);
      if (previous) push(issues, 'error', 'port.id.duplicate', node, resolvedPort.port.portId);
      else portIds.set(resolvedPort.port.portId, node);
      if (resolvedPort.port.source === 'metadata' && !node.name.startsWith('Snap-')) {
        push(issues, 'warning', 'port.legacy.mismatch', node);
      }
    }

    for (const type of SMART_SIGNAL_TYPES) {
      const key = componentKey(rv, type);
      if (!key || !isRecord(rv[key])) continue;
      signalCount++;
      const raw = rv[key].Name;
      const name = typeof raw === 'string' && raw.trim() ? raw.trim() : node.name.trim();
      if (!name) push(issues, 'error', 'signal.name.empty', node);
      else if (signals.has(name)) push(issues, 'error', 'signal.name.duplicate', node, name);
      else signals.set(name, node);
    }

    const track = componentRecord(node, 'PaintLineTrackModule');
    if (track) {
      templateCount++;
      const points = Array.isArray(track.Points) ? track.Points : [];
      if (points.length < 2 || points.some(point => vector(point) === null)) {
        push(issues, 'error', 'track.points.invalid', node);
      }
      tracks.push({ node, config: track });
    }
    const zone = componentRecord(node, 'PaintProcessZone');
    if (zone) {
      templateCount++;
      if (!PROCESS_KINDS.has(zone.Kind as PaintProcessKind)) push(issues, 'error', 'zone.kind.invalid', node);
      const size = vector(zone.Size);
      if (!size || size.some(value => value <= 0)) push(issues, 'error', 'zone.size.invalid', node);
    }
    const controller = componentRecord(node, 'PaintLineController');
    if (controller) {
      templateCount++;
      if (!finitePositive(controller.TargetSpeed) || !finitePositive(controller.Pitch)
        || !finitePositive(controller.PiecesPerCarrier)) {
        push(issues, 'error', 'controller.params.invalid', node);
      }
    }
    const robot = componentRecord(node, 'PaintProcessRobot');
    if (robot) {
      templateCount++;
      if (!finitePositive(robot.SpraySweepDegrees) || !finitePositive(robot.SprayPeriodSeconds)) {
        push(issues, 'error', 'robot.params.invalid', node);
      }
    }
    const surface = componentRecord(node, 'TransportSurface');
    if (surface) {
      templateCount++;
      if (!nonZeroVector(surface.TransportDirection)) push(issues, 'error', 'transport.direction.invalid', node);
    }
    if (componentRecord(node, 'RuntimeMetadata')) templateCount++;
  });

  // Port nodes are commonly children of the track root, so this relation is
  // checked after the full traversal instead of depending on traversal order.
  for (const { node, config } of tracks) {
    const entry = typeof config.EntryPortId === 'string' ? config.EntryPortId : 'track.in';
    const exit = typeof config.ExitPortId === 'string' ? config.ExitPortId : 'track.out';
    if (!portIds.has(entry) || !portIds.has(exit)) {
      push(issues, 'error', 'track.ports.missing', node, `${entry}, ${exit}`);
    }
  }

  if (meshCount === 0) push(issues, 'error', 'asset.empty', root);
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  return {
    issues, errorCount, warningCount, nodeCount, meshCount, portCount,
    signalCount, templateCount, publishable: errorCount === 0,
  };
}
