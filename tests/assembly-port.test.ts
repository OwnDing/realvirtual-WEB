// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { Group, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { SnapPointRegistry } from '../src/core/engine/rv-snap-point-registry';
import {
  assemblyPortDirectionInOwner,
  findAssemblyPortNode,
  resolveAssemblyPort,
} from '../src/plugins/snap-point/assembly-port';
import { computeSnapAlignedWorldMatrix } from '../src/plugins/snap-point/snap-alignment';
import { scanAndRegisterSnaps } from '../src/plugins/snap-point/snap-scanner';

function port(
  name: string,
  portId: string,
  flow: 'in' | 'out' | 'bidi',
  direction: { x: number; y: number; z: number },
): Object3D {
  const node = new Object3D();
  node.name = name;
  node.userData.realvirtual = {
    NodeId: `urn:test:${portId}`,
    AssemblyPort: { PortId: portId, TypeId: 'paint-track-v1', Flow: flow, Direction: direction },
  };
  return node;
}

describe('rv-ODT 1.1 AssemblyPort compatibility', () => {
  it('prefers valid metadata over a contradictory legacy node name', () => {
    const node = port('Snap-ZN-wrong-type', 'track.out', 'out', { x: 2, y: 0, z: 0 });
    const resolved = resolveAssemblyPort(node, 'asset');

    expect(resolved.kind).toBe('port');
    if (resolved.kind !== 'port') return;
    expect(resolved.port).toMatchObject({
      portId: 'track.out', typeId: 'paint-track-v1', flow: 'out', source: 'metadata',
    });
    expect(resolved.port.localDirection).toEqual([1, 0, 0]);
  });

  it('keeps legacy Snap names discoverable and selectable by name', () => {
    const root = new Group();
    const first = new Object3D();
    const second = new Object3D();
    first.name = second.name = 'Snap-ZN-convroll';
    root.add(first, second);
    const registry = new SnapPointRegistry();

    const added = scanAndRegisterSnaps(root, registry);
    expect(added).toHaveLength(2);
    expect(added.every((snap) => snap.identitySource === 'legacy-name')).toBe(true);
    expect(findAssemblyPortNode(root, 'Snap-ZN-convroll')).toBe(first);
  });

  it('diagnoses invalid and duplicate metadata instead of silently choosing', () => {
    const root = new Group();
    root.name = 'TrackAsset';
    const invalid = port('Snap-ZN-paint', 'bad', 'in', { x: 0, y: 0, z: 0 });
    const a = port('Snap-ZN-paint', 'track.in', 'in', { x: 0, y: 0, z: -1 });
    const b = port('Snap-ZP-paint', 'track.in', 'out', { x: 0, y: 0, z: 1 });
    root.add(invalid, a, b);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const added = scanAndRegisterSnaps(root, new SnapPointRegistry());
    expect(added).toHaveLength(1);
    expect(added[0]?.object3D).toBe(a);
    expect(warn.mock.calls.flat().join(' ')).toContain('finite non-zero Vector3');
    expect(warn.mock.calls.flat().join(' ')).toContain("Duplicate AssemblyPort.PortId 'track.in'");
    warn.mockRestore();
  });

  it('uses explicit Direction for curved-module alignment, not port position', () => {
    const scene = new Group();
    const targetRoot = new Group();
    targetRoot.userData._layoutId = 'target';
    const target = port('Snap-ZP-paint', 'track.out', 'out', { x: 1, y: 0, z: 0 });
    // Position deliberately claims +Z; metadata says the true curve tangent is +X.
    target.position.set(0, 0, 1);
    targetRoot.add(target);
    scene.add(targetRoot);

    const movingRoot = new Group();
    const moving = port('Snap-ZN-paint', 'track.in', 'in', { x: 0, y: 0, z: -1 });
    moving.position.set(0, 0, -1);
    movingRoot.add(moving);
    scene.add(movingRoot);
    scene.updateMatrixWorld(true);

    const targetResolved = resolveAssemblyPort(target, targetRoot.name);
    const movingResolved = resolveAssemblyPort(moving, movingRoot.name);
    if (targetResolved.kind !== 'port' || movingResolved.kind !== 'port') throw new Error('fixture');
    const matrix = computeSnapAlignedWorldMatrix(
      target,
      movingRoot,
      moving,
      targetResolved.port.dir,
      movingResolved.port.dir,
    );
    matrix.decompose(movingRoot.position, movingRoot.quaternion, movingRoot.scale);
    movingRoot.updateMatrixWorld(true);

    const targetPos = target.getWorldPosition(new Vector3());
    const movingPos = moving.getWorldPosition(new Vector3());
    expect(movingPos.distanceTo(targetPos)).toBeLessThan(1e-6);

    const targetQ = target.getWorldQuaternion(new Quaternion());
    const movingQ = moving.getWorldQuaternion(new Quaternion());
    const targetOut = new Vector3(1, 0, 0).applyQuaternion(targetQ);
    const movingOut = new Vector3(0, 0, -1).applyQuaternion(movingQ);
    expect(targetOut.dot(movingOut)).toBeLessThan(-0.999999);
  });
});

describe('EP-DES-002 M3 — explicit port Direction under a scaled asset root', () => {
  /**
   * Snap placement permits uniform scale, and catalog assets routinely carry a
   * mm→m factor on their root. Reading the world rotation off `matrixWorld`
   * with `Quaternion.setFromRotationMatrix` (whose contract is an UNSCALED
   * matrix) collapsed towards the identity, so a rotated port on a scaled asset
   * reported roughly its raw local direction instead of its real one.
   */
  function ownerWithRotatedPort(scale: number): { owner: Object3D; node: Object3D } {
    const owner = new Group();
    owner.name = 'ScaledAsset';
    owner.scale.setScalar(scale);
    const node = port('Snap-ZP-paint', 'track.out', 'out', { x: 0, y: 0, z: 1 });
    node.rotation.set(0, Math.PI / 2, 0);
    owner.add(node);
    owner.updateMatrixWorld(true);
    return { owner, node };
  }

  it('reads the same direction at unit scale and at 0.001 scale', () => {
    const unit = ownerWithRotatedPort(1);
    const tiny = ownerWithRotatedPort(0.001);
    const atUnit = assemblyPortDirectionInOwner(unit.node, unit.owner, new Vector3());
    const atTiny = assemblyPortDirectionInOwner(tiny.node, tiny.owner, new Vector3());

    expect(atUnit).not.toBeNull();
    expect(atTiny).not.toBeNull();
    // The port faces +Z locally and is yawed 90°, so in the owner frame it
    // points along +X regardless of how the owner is scaled.
    expect(atUnit!.dot(new Vector3(1, 0, 0))).toBeGreaterThan(0.999999);
    expect(atTiny!.dot(new Vector3(1, 0, 0))).toBeGreaterThan(0.999999);
    expect(atTiny!.distanceTo(atUnit!)).toBeLessThan(1e-9);
  });

  it('is unaffected by a scaled ancestor above the owner', () => {
    const scene = new Group();
    scene.scale.setScalar(250);
    const { owner, node } = ownerWithRotatedPort(0.004);
    scene.add(owner);
    scene.updateMatrixWorld(true);

    const direction = assemblyPortDirectionInOwner(node, owner, new Vector3());
    expect(direction).not.toBeNull();
    expect(direction!.dot(new Vector3(1, 0, 0))).toBeGreaterThan(0.999999);
  });

  it('still returns null for a legacy name-only port', () => {
    const owner = new Group();
    owner.name = 'LegacyAsset';
    owner.scale.setScalar(0.001);
    const node = new Object3D();
    node.name = 'Snap-ZN-paint-track-v1';
    owner.add(node);
    owner.updateMatrixWorld(true);

    expect(assemblyPortDirectionInOwner(node, owner, new Vector3())).toBeNull();
  });
});
