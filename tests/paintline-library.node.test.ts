// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-DEMO-001 M1 — structural + contract tests for the generated `Paint Line`
 * library objects (`scripts/build-paintline-library.mjs`).
 *
 * The point of this file is NOT to re-test glTF. It is to pin the three
 * contracts the generated assets silently depend on, each of which fails
 * invisibly at runtime (the asset loads, it just never moves):
 *
 *   1. The overhead conveyor's FILENAME and root name must match
 *      `*OverheadConveyor*`, because behaviors match the asset name.
 *   2. `Carrier-<id>` nodes must be DIRECT children of the component root —
 *      OverheadConveyor writes their pose into the LOCAL frame assuming an
 *      identity parent.
 *   3. `Drive-*` names must satisfy the ANCHORED `^Drive-(Lin|Rot)-([XYZ])$`
 *      parser, which tolerates no descriptive suffix.
 *
 * It also cross-checks the generator's baked preview poses against the RUNTIME
 * path parser (`parsePathExtras`, the SSOT). The generator carries its own
 * small arc evaluator to bake those poses; this test is what stops the two
 * copies from drifting apart.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { parsePathExtras } from '@rv/core/engine/rv-path';
import {
  parseDriveName,
  isCarrierName,
} from '@rv/core/library-component-loader';
import { parseSnapName } from '@rv/plugins/snap-point/snap-name-parser';

const LIB_DIR = resolve(__dirname, '..', 'public', 'library', 'PaintLine');

/** Derived facts the library generator publishes for the scene generator. */
function geometry(): { loopLengthM: number; carrierCount: number; gates: { name: string; sM: number }[] } {
  return JSON.parse(readFileSync(resolve(LIB_DIR, 'paintline-geometry.json'), 'utf8'));
}

const OBJECT_FILES = [
  'PaintLineOverheadConveyor.glb',
  'PretreatTunnel-8m.glb',
  'DryOven-6m.glb',
  'SprayBooth.glb',
  'CoolingZone-4m.glb',
  'LoadUnloadStation.glb',
  'Workpiece-Bracket.glb',
];

interface GltfNode {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  extras?: { realvirtual?: Record<string, unknown> };
}

interface GltfDoc {
  asset: { version: string };
  scene: number;
  scenes: { name?: string; nodes: number[] }[];
  nodes: GltfNode[];
  meshes: unknown[];
  materials: unknown[];
}

/** Parse a GLB container and return its JSON chunk, asserting the framing. */
function readGlb(file: string): GltfDoc {
  const buf = readFileSync(resolve(LIB_DIR, file));
  expect(buf.readUInt32LE(0), `${file}: glTF magic`).toBe(0x46546c67);
  expect(buf.readUInt32LE(4), `${file}: glTF version`).toBe(2);
  expect(buf.readUInt32LE(8), `${file}: declared length`).toBe(buf.length);

  const jsonLen = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16), `${file}: first chunk is JSON`).toBe(0x4e4f534a);
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as GltfDoc;

  // The BIN chunk must follow and be 4-byte aligned.
  const binHeaderAt = 20 + jsonLen;
  expect(buf.readUInt32LE(binHeaderAt + 4), `${file}: second chunk is BIN`).toBe(0x004e4942);
  expect(jsonLen % 4, `${file}: JSON chunk padded to 4 bytes`).toBe(0);
  return doc;
}

/** The BIN chunk bytes of a GLB. */
function readGlbBin(file: string): Buffer {
  const buf = readFileSync(resolve(LIB_DIR, file));
  const jsonLen = buf.readUInt32LE(12);
  const binHeaderAt = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderAt);
  return buf.subarray(binHeaderAt + 8, binHeaderAt + 8 + binLen);
}

/** Float32 view of an accessor, via its bufferView. */
function floats(doc: GltfDoc, bin: Buffer, accessorIndex: number): Float32Array {
  const acc = (doc as unknown as { accessors: { bufferView: number; count: number; type: string }[] })
    .accessors[accessorIndex];
  const view = (doc as unknown as { bufferViews: { byteOffset: number; byteLength: number }[] })
    .bufferViews[acc.bufferView];
  const comps = acc.type === 'VEC3' ? 3 : 1;
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < out.length; i++) out[i] = bin.readFloatLE(view.byteOffset + i * 4);
  return out;
}

/** Uint16 view of an accessor. */
function shorts(doc: GltfDoc, bin: Buffer, accessorIndex: number): Uint16Array {
  const acc = (doc as unknown as { accessors: { bufferView: number; count: number }[] }).accessors[accessorIndex];
  const view = (doc as unknown as { bufferViews: { byteOffset: number }[] }).bufferViews[acc.bufferView];
  const out = new Uint16Array(acc.count);
  for (let i = 0; i < out.length; i++) out[i] = bin.readUInt16LE(view.byteOffset + i * 2);
  return out;
}

/** Every node index reachable as someone's child. */
function childIndices(doc: GltfDoc): Set<number> {
  const claimed = new Set<number>();
  for (const node of doc.nodes) for (const c of node.children ?? []) claimed.add(c);
  return claimed;
}

describe('paint-line library objects (EP-DEMO-001 M1)', () => {
  it('generates all seven objects', () => {
    for (const file of OBJECT_FILES) {
      expect(existsSync(resolve(LIB_DIR, file)), `${file} missing — run scripts/build-paintline-library.mjs`).toBe(true);
    }
  });

  describe.each(OBJECT_FILES)('%s', (file) => {
    it('is a single-root GLB whose root is the only unclaimed node', () => {
      const doc = readGlb(file);
      expect(doc.scenes[doc.scene].nodes).toHaveLength(1);

      const rootIndex = doc.scenes[doc.scene].nodes[0];
      const claimed = childIndices(doc);
      expect(claimed.has(rootIndex), 'root must not also be a child').toBe(false);

      const unclaimed = doc.nodes.map((_, i) => i).filter((i) => !claimed.has(i));
      expect(unclaimed, 'exactly one node may be parentless').toEqual([rootIndex]);
    });

    it('names its root after the asset (behaviors match the asset name)', () => {
      const doc = readGlb(file);
      expect(doc.nodes[doc.scenes[doc.scene].nodes[0]].name).toBe(file.replace(/\.glb$/, ''));
    });

    it('parses every Snap- node with the real snap-name parser', () => {
      const doc = readGlb(file);
      for (const node of doc.nodes) {
        if (!node.name?.startsWith('Snap-')) continue;
        expect(parseSnapName(node.name), `${node.name} must parse`).not.toBeNull();
      }
    });

    it('parses every Drive- node with the anchored drive-name parser', () => {
      const doc = readGlb(file);
      for (const node of doc.nodes) {
        if (!node.name?.startsWith('Drive-')) continue;
        expect(parseDriveName(node.name), `${node.name} must parse`).not.toBeNull();
      }
    });
  });

  describe('PaintLineOverheadConveyor', () => {
    const doc = readGlb('PaintLineOverheadConveyor.glb');
    const rootIndex = doc.scenes[doc.scene].nodes[0];
    const root = doc.nodes[rootIndex];

    it('carries the OverheadConveyorBehavior configuration on its root', () => {
      const cfg = root.extras?.realvirtual?.OverheadConveyorBehavior as Record<string, unknown>;
      expect(cfg).toBeDefined();
      expect(cfg.PathId).toBe('PaintLineLoop');
      // Pitch 0 is meaningful: it asks the component to distribute L / N evenly.
      expect(cfg.Pitch).toBe(0);
      expect(cfg.TargetSpeed).toBeGreaterThan(0);
    });

    it('matches the behavior glob that binds the component', () => {
      // src/behaviors/OverheadConveyor.ts declares models: ['*OverheadConveyor*']
      expect(root.name).toContain('OverheadConveyor');
    });

    it('keeps every carrier as a DIRECT child of the root', () => {
      const carriers = doc.nodes
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.name !== undefined && isCarrierName(n.name));
      // Count comes from the generator (`CARRIER_COUNT`) and is republished in
      // the geometry sidecar, so the loop can change shape without this test
      // pinning a stale number.
      expect(carriers).toHaveLength(geometry().carrierCount);

      const directChildren = new Set(root.children ?? []);
      for (const { n, i } of carriers) {
        expect(directChildren.has(i), `${n.name} must be a direct child of the root`).toBe(true);
      }
    });

    it('declares a closed path the runtime parser accepts', () => {
      const pathNode = doc.nodes.find((n) => n.extras?.realvirtual?.Path !== undefined);
      expect(pathNode).toBeDefined();

      const path = parsePathExtras(pathNode!.extras!.realvirtual!.Path, 'PaintLineLoop');
      expect(path).not.toBeNull();
      expect(path!.closed).toBe(true);
      // Length is asserted against the SIDECAR the generator emits, not against
      // a hand-computed constant: the scene generator reads that same file for
      // the gate arc length, so pinning it here is what stops the two from
      // drifting when the loop changes shape.
      expect(path!.length).toBeCloseTo(geometry().loopLengthM, 5);
    });

    it('publishes gate arc lengths that lie on the path', () => {
      // The scene generator turns these into `Gates: [mm]` on the placement. A
      // value past the end of the loop would be silently dropped by the
      // component, leaving the demo with a buffer that never holds anything.
      const g = geometry();
      expect(g.gates.length).toBeGreaterThan(0);
      for (const gate of g.gates) {
        expect(gate.sM).toBeGreaterThan(0);
        expect(gate.sM).toBeLessThan(g.loopLengthM);
      }
    });

    it('bakes preview poses that agree with the runtime path parser', () => {
      const pathNode = doc.nodes.find((n) => n.extras?.realvirtual?.Path !== undefined)!;
      const path = parsePathExtras(pathNode.extras!.realvirtual!.Path, 'PaintLineLoop')!;

      const carriers = doc.nodes
        .filter((n) => n.name !== undefined && isCarrierName(n.name))
        .sort((a, b) => a.name!.localeCompare(b.name!));
      const pitch = path.length / carriers.length;

      const expected = new Vector3();
      for (let i = 0; i < carriers.length; i++) {
        path.getAbsPosition(i * pitch, expected);
        const baked = carriers[i].translation!;
        expect(baked[0], `${carriers[i].name} x`).toBeCloseTo(expected.x, 5);
        expect(baked[1], `${carriers[i].name} y`).toBeCloseTo(expected.y, 5);
        expect(baked[2], `${carriers[i].name} z`).toBeCloseTo(expected.z, 5);
      }
    });

    it('hangs every carrier gravity-oriented (yaw only, no roll)', () => {
      const carriers = doc.nodes.filter((n) => n.name !== undefined && isCarrierName(n.name));
      for (const c of carriers) {
        const [x, , z, w] = c.rotation ?? [0, 0, 0, 1];
        // A pure yaw quaternion has zero X and Z components; anything else
        // would tilt the hanger off vertical.
        expect(x, `${c.name} must not pitch`).toBeCloseTo(0, 9);
        expect(z, `${c.name} must not roll`).toBeCloseTo(0, 9);
        expect(Number.isFinite(w)).toBe(true);
      }
    });

    it('gives every carrier the same hanger sub-structure', () => {
      const carriers = doc.nodes.filter((n) => n.name !== undefined && isCarrierName(n.name));
      for (const c of carriers) {
        const names = (c.children ?? []).map((i) => doc.nodes[i].name);
        expect(names).toEqual(['Trolley', 'Rod', 'Crossbar', 'Workpiece-A', 'Workpiece-B']);
      }
    });
  });

  /**
   * Supersedes the `SprayBooth` reciprocator suite from EP-DEMO-001 M1: the
   * booth's single `Drive-Lin-Y` carriage was replaced by a six-axis robot in
   * EP-DEMO-002 M2, so those assertions described an asset that no longer
   * exists. The last case below pins the removal so the two cannot both
   * reappear.
   */
  describe('spray booth robot (EP-DEMO-002 M2)', () => {
    const doc = readGlb('SprayBooth.glb');
    const robot = doc.nodes.find((n) => n.extras?.realvirtual?.RobotIK !== undefined);

    /** Node reached by walking a `/`-separated path from the scene root. */
    function nodeAtPath(path: string): GltfNode | null {
      const parts = path.split('/');
      let current: GltfNode | undefined = doc.nodes[doc.scenes[doc.scene].nodes[0]];
      if (!current || current.name !== parts[0]) return null;
      for (const want of parts.slice(1)) {
        const next: GltfNode | undefined = (current!.children ?? [])
          .map((i) => doc.nodes[i])
          .find((n) => n.name === want);
        if (!next) return null;
        current = next;
      }
      return current ?? null;
    }

    it('carries a RobotIK component', () => {
      expect(robot, 'no node declares RobotIK').toBeDefined();
      const cfg = robot!.extras!.realvirtual!.RobotIK as Record<string, unknown>;
      expect(cfg.WristType).toBe('Spherical');
      expect(Array.isArray(cfg.Axis)).toBe(true);
      expect((cfg.Axis as unknown[]).length, 'a six-axis robot needs six axes').toBe(6);
    });

    it('resolves every Axis reference to a node that really carries a Drive', () => {
      // The runtime resolves these paths through the node registry
      // (`resolveAxisDrivesFromNode`). A path that lands on nothing produces
      // `axes=0` in the loader log while the asset still renders perfectly —
      // a silent failure with no visible symptom until nothing moves.
      const axes = (robot!.extras!.realvirtual!.RobotIK as { Axis: { path: string; componentType: string }[] }).Axis;
      for (const ref of axes) {
        const node = nodeAtPath(ref.path);
        expect(node, `Axis path '${ref.path}' resolves to nothing`).not.toBeNull();
        expect(node!.extras?.realvirtual?.Drive, `${ref.path} carries no Drive`).toBeDefined();
        expect(ref.componentType).toBe('realvirtual.Drive');
      }
    });

    it('nests each joint inside the previous one', () => {
      // The scene graph IS the kinematic chain: A2 must be a child of A1, and
      // so on, or the arm bends about the wrong origins.
      const axes = (robot!.extras!.realvirtual!.RobotIK as { Axis: { path: string }[] }).Axis;
      for (let i = 1; i < axes.length; i++) {
        expect(axes[i].path.startsWith(`${axes[i - 1].path}/`),
          `${axes[i].path} is not nested inside ${axes[i - 1].path}`).toBe(true);
      }
    });

    it('gives every joint a rotational direction and finite limits', () => {
      const axes = (robot!.extras!.realvirtual!.RobotIK as { Axis: { path: string }[] }).Axis;
      for (const ref of axes) {
        const drive = nodeAtPath(ref.path)!.extras!.realvirtual!.Drive as Record<string, unknown>;
        expect(String(drive.Direction)).toMatch(/^Rotation[XYZ]$/);
        expect(drive.UseLimits).toBe(true);
        expect(Number(drive.LowerLimit)).toBeLessThan(Number(drive.UpperLimit));
      }
    });

    it('names every joint uniquely', () => {
      // Duplicate names would collide on GLB export and make the joints
      // indistinguishable to the plugin that commands them.
      const names = doc.nodes.map((n) => n.name).filter((n): n is string => /^A[1-6]$/.test(n ?? ''));
      expect(new Set(names).size).toBe(names.length);
      expect(names.sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    });

    it('no longer ships the single-axis reciprocator it replaced', () => {
      expect(doc.nodes.some((n) => n.name === 'Drive-Lin-Y')).toBe(false);
    });
  });

  describe('process sections', () => {
    it.each(['PretreatTunnel-8m.glb', 'DryOven-6m.glb', 'CoolingZone-4m.glb', 'SprayBooth.glb'])(
      '%s exposes an in/out paintseg snap pair',
      (file) => {
        const doc = readGlb(file);
        const snaps = doc.nodes
          .filter((n) => n.name?.startsWith('Snap-'))
          .map((n) => parseSnapName(n.name!)!);
        expect(snaps).toHaveLength(2);
        expect(snaps.every((s) => s.typeId === 'paintseg')).toBe(true);
        expect(snaps.map((s) => s.flow).sort()).toEqual(['in', 'out']);
      },
    );
  });
});
