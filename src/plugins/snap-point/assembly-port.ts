// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Stable assembly-port metadata with a permanent `Snap-*` compatibility path.
 *
 * New assets author `extras.realvirtual.AssemblyPort`; legacy assets remain
 * discoverable through their node name. Invalid metadata is never silently
 * replaced with the name-derived interpretation — callers can report it.
 */

import { Quaternion, Vector3, type Object3D } from 'three';
import {
  forcesBidiPort,
  parseSnapName,
  type SnapDirection,
  type SnapFlow,
} from './snap-name-parser';

export type AssemblyPortIdentitySource = 'metadata' | 'legacy-name';
export type AssemblyPortDirectionTuple = readonly [number, number, number];

export interface ResolvedAssemblyPort {
  portId: string;
  typeId: string;
  flow: SnapFlow;
  dir: SnapDirection;
  /** Normalized direction in the port NODE'S local frame. Legacy ports omit it. */
  localDirection?: AssemblyPortDirectionTuple;
  source: AssemblyPortIdentitySource;
}

export type AssemblyPortResolution =
  | { kind: 'port'; port: ResolvedAssemblyPort }
  | { kind: 'invalid'; reason: string }
  | { kind: 'none' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function directionTuple(value: unknown): AssemblyPortDirectionTuple | null {
  if (!isRecord(value)) return null;
  const { x, y, z } = value;
  if (
    typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)
    || typeof z !== 'number' || !Number.isFinite(z)
  ) return null;
  const length = Math.hypot(x, y, z);
  if (length <= 1e-8) return null;
  return [x / length, y / length, z / length];
}

function cardinalDirection(
  direction: AssemblyPortDirectionTuple,
  flow: SnapFlow,
): SnapDirection {
  const [x, y, z] = direction;
  const abs = [Math.abs(x), Math.abs(y), Math.abs(z)];
  const max = Math.max(...abs);
  const axis = max === abs[0] ? 'X' : max === abs[1] ? 'Y' : 'Z';
  // The sign letter in the legacy convention encodes FLOW, not geometry.
  // Explicit geometry lives in `localDirection` and alignment consumes it.
  const sign = flow === 'in' ? 'N' : flow === 'out' ? 'P' : 'B';
  return { axis, sign, code: `${axis}${sign}` } as SnapDirection;
}

/** Resolve one node. `assetName` is used only for historical bidi overrides. */
export function resolveAssemblyPort(
  node: Object3D,
  assetName = '',
): AssemblyPortResolution {
  const rv = isRecord(node.userData?.realvirtual)
    ? node.userData.realvirtual
    : undefined;
  const raw = rv?.AssemblyPort;

  if (raw !== undefined) {
    if (!isRecord(raw)) {
      return { kind: 'invalid', reason: 'AssemblyPort must be an object' };
    }
    const portId = nonEmptyString(raw.PortId);
    const typeId = nonEmptyString(raw.TypeId);
    const flow = raw.Flow;
    const direction = directionTuple(raw.Direction);
    if (!portId) return { kind: 'invalid', reason: 'AssemblyPort.PortId must be a non-empty string' };
    if (!typeId) return { kind: 'invalid', reason: 'AssemblyPort.TypeId must be a non-empty string' };
    if (flow !== 'in' && flow !== 'out' && flow !== 'bidi') {
      return { kind: 'invalid', reason: "AssemblyPort.Flow must be 'in', 'out', or 'bidi'" };
    }
    if (!direction) {
      return { kind: 'invalid', reason: 'AssemblyPort.Direction must be a finite non-zero Vector3' };
    }
    return {
      kind: 'port',
      port: {
        portId,
        typeId,
        flow,
        dir: cardinalDirection(direction, flow),
        localDirection: direction,
        source: 'metadata',
      },
    };
  }

  const parsed = parseSnapName(node.name);
  if (!parsed) return { kind: 'none' };
  const nodeId = nonEmptyString(rv?.NodeId);
  return {
    kind: 'port',
    port: {
      portId: nodeId ?? node.name,
      typeId: parsed.typeId,
      flow: forcesBidiPort(assetName, parsed.typeId) ? 'bidi' : parsed.flow,
      dir: parsed.dir,
      source: 'legacy-name',
    },
  };
}

/** Stable selector first, legacy node name second. */
export function findAssemblyPortNode(root: Object3D, selector: string): Object3D | null {
  let byName: Object3D | null = null;
  let byPortId: Object3D | null = null;
  root.traverse((node) => {
    if (byPortId) return;
    const resolved = resolveAssemblyPort(node, root.name);
    if (resolved.kind === 'port' && resolved.port.portId === selector) byPortId = node;
    if (!byName && node.name === selector && resolved.kind === 'port') byName = node;
  });
  return byPortId ?? byName;
}

export function matchesAssemblyPortSelector(
  port: { portId?: string; object3D: Object3D },
  selector: string,
): boolean {
  return port.portId === selector || port.object3D.name === selector;
}

const _portLocal = new Vector3();
const _portWorldQ = new Quaternion();
const _ownerWorldQ = new Quaternion();

/**
 * Convert explicit port-node-local Direction to the owning asset's local frame.
 * Returns null for legacy ports or invalid metadata.
 */
export function assemblyPortDirectionInOwner(
  node: Object3D,
  ownerRoot: Object3D,
  out: Vector3,
): Vector3 | null {
  const resolved = resolveAssemblyPort(node, ownerRoot.name);
  if (resolved.kind !== 'port' || !resolved.port.localDirection) return null;
  node.updateWorldMatrix(true, false);
  ownerRoot.updateWorldMatrix(true, false);
  _portLocal.fromArray(resolved.port.localDirection);
  _portWorldQ.setFromRotationMatrix(node.matrixWorld);
  _ownerWorldQ.setFromRotationMatrix(ownerRoot.matrixWorld).invert();
  return out.copy(_portLocal).applyQuaternion(_portWorldQ).applyQuaternion(_ownerWorldQ).normalize();
}
