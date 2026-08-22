// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { SnapPointRegistry } from '../src/core/engine/rv-snap-point-registry';
import {
  PaintLineAssemblyBehavior,
  PaintLineRoute,
  buildPaintLineTopology,
} from '../src/behaviors/PaintLineAssembly';
import { scanAndRegisterSnaps } from '../src/plugins/snap-point/snap-scanner';

type P = [number, number, number];

function pointObject([x, y, z]: P) { return { x, y, z }; }

function module(
  id: string,
  from: P,
  to: P,
  inDirection: P,
  outDirection: P,
): Group {
  const root = new Group();
  root.name = id;
  root.userData._layoutId = id;
  root.userData.realvirtual = {
    PaintLineTrackModule: {
      Version: 1,
      EntryPortId: 'track.in',
      ExitPortId: 'track.out',
      Points: [pointObject(from), pointObject(to)],
    },
  };
  const addPort = (name: string, portId: string, flow: 'in' | 'out', at: P, direction: P) => {
    const port = new Object3D();
    port.name = name;
    port.position.fromArray(at);
    port.userData.realvirtual = {
      AssemblyPort: {
        PortId: portId, TypeId: 'paintseg', Flow: flow, Direction: pointObject(direction),
      },
    };
    root.add(port);
  };
  addPort('Snap-XN-paintseg', 'track.in', 'in', from, inDirection);
  addPort('Snap-XP-paintseg', 'track.out', 'out', to, outDirection);
  return root;
}

function square(): { registry: SnapPointRegistry; roots: Group[] } {
  const registry = new SnapPointRegistry();
  const roots = [
    module('A', [0, 0, 0], [2, 0, 0], [-1, 0, 0], [1, 0, 0]),
    module('B', [2, 0, 0], [2, 0, 2], [0, 0, -1], [0, 0, 1]),
    module('C', [2, 0, 2], [0, 0, 2], [1, 0, 0], [-1, 0, 0]),
    module('D', [0, 0, 2], [0, 0, 0], [0, 0, 1], [0, 0, -1]),
  ];
  for (const root of roots) scanAndRegisterSnaps(root, registry, root);
  for (let i = 0; i < roots.length; i++) {
    const own = registry.getByOwnerRoot(roots[i]);
    const next = registry.getByOwnerRoot(roots[(i + 1) % roots.length]);
    registry.pair(own.find((snap) => snap.portId === 'track.out')!.id, next.find((snap) => snap.portId === 'track.in')!.id);
  }
  return { registry, roots };
}

describe('PaintLineAssembly topology', () => {
  it('builds a deterministic closed route from stable port pairings', () => {
    const { registry } = square();
    const topology = buildPaintLineTopology(registry);

    expect(topology.valid).toBe(true);
    expect(topology.moduleCount).toBe(4);
    expect(topology.route?.length).toBeCloseTo(8, 6);
    const position = new Vector3();
    const tangent = new Vector3();
    topology.route!.sample(2.5, position, tangent);
    expect(position.toArray()).toEqual([2, 0, 0.5]);
    expect(tangent.toArray()).toEqual([0, 0, 1]);
  });

  it('fails safe when one port is open', () => {
    const { registry, roots } = square();
    const output = registry.getByOwnerRoot(roots[1]).find((snap) => snap.portId === 'track.out')!;
    registry.markFree(output.id);

    const topology = buildPaintLineTopology(registry);
    expect(topology.valid).toBe(false);
    expect(topology.route).toBeNull();
    expect(topology.reason).toContain('open port');
  });

  it('rejects a paired graph whose track geometry does not close', () => {
    const { registry, roots } = square();
    const cfg = roots[3].userData.realvirtual.PaintLineTrackModule;
    cfg.Points[1] = { x: 0, y: 0, z: 0.5 };

    const topology = buildPaintLineTopology(registry);
    expect(topology.valid).toBe(false);
    expect(topology.reason).toContain('geometrically closed');
  });

  it('route sampling wraps in both directions', () => {
    const route = new PaintLineRoute([
      new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 1), new Vector3(0, 0, 1),
    ]);
    const a = new Vector3();
    const b = new Vector3();
    const tangent = new Vector3();
    route.sample(-0.25, a, tangent);
    route.sample(route.length - 0.25, b, tangent);
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });

  it('is discovered only for PaintLineController assets', () => {
    expect(PaintLineAssemblyBehavior.models).toEqual([
      '*PaintLineController*',
      '*Paint Line Controller*',
    ]);
  });
});
