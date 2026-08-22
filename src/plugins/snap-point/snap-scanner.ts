// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * scanAndRegisterSnaps — traverses an Object3D subtree, parses node names
 * against the Snap-<DIR>-<TYPEID> convention, and registers every match
 * with the SnapPointRegistry.
 */

import type { Object3D } from 'three';
import type { SnapPoint, SnapPointRegistry } from '../../core/engine/rv-snap-point-registry';
import { resolveAssemblyPort } from './assembly-port';

/**
 * Walk the subtree, register every node whose name matches Snap-<DIR>-<TYPEID>.
 *
 * @param root      Subtree to scan (typically a GLB root or a placed asset)
 * @param registry  Registry to register into
 * @param ownerRoot Asset root recorded on each snap point. Defaults to `root`.
 * @returns The newly registered SnapPoints.
 */
export function scanAndRegisterSnaps(
  root: Object3D,
  registry: SnapPointRegistry,
  ownerRoot?: Object3D,
): SnapPoint[] {
  const owner = ownerRoot ?? root;
  const added: SnapPoint[] = [];
  const seenMetadataPortIds = new Set<string>();
  root.traverse((node: Object3D) => {
    const resolved = resolveAssemblyPort(node, owner.name);
    if (resolved.kind === 'none') return;
    if (resolved.kind === 'invalid') {
      console.warn(`[SnapPoint] ${computeScenePath(node)}: ${resolved.reason}`);
      return;
    }
    const parsed = resolved.port;
    if (parsed.source === 'metadata' && seenMetadataPortIds.has(parsed.portId)) {
      console.warn(`[SnapPoint] Duplicate AssemblyPort.PortId '${parsed.portId}' under '${owner.name}'`);
      return;
    }
    if (parsed.source === 'metadata') seenMetadataPortIds.add(parsed.portId);
    const sp: SnapPoint = {
      id: node.uuid,
      portId: parsed.portId,
      identitySource: parsed.source,
      localDirection: parsed.localDirection,
      object3D: node,
      dir: parsed.dir,
      typeId: parsed.typeId,
      flow: parsed.flow,
      ownerRoot: owner,
      scenePath: computeScenePath(node),
      occupied: false,
    };
    registry.register(sp);
    added.push(sp);
  });
  return added;
}

/** Compute a Unity-style hierarchy path 'Root/Child/Snap-ZN-foo'. */
function computeScenePath(node: Object3D): string {
  const parts: string[] = [node.name];
  let p: Object3D | null = node.parent;
  while (p && p.parent) {
    parts.unshift(p.name);
    p = p.parent;
  }
  return parts.join('/');
}
