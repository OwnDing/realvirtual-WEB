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

  describe('SprayBooth', () => {
    const doc = readGlb('SprayBooth.glb');

    it('carries exactly one reciprocator drive, named without a suffix', () => {
      const drives = doc.nodes.filter((n) => n.name?.startsWith('Drive-'));
      expect(drives).toHaveLength(1);
      // The parser is anchored — `Drive-Lin-Y-Reciprocator` would NOT parse,
      // and two nodes named `Drive-Lin-Y` would collide on GLB export.
      expect(drives[0].name).toBe('Drive-Lin-Y');
      expect(parseDriveName(drives[0].name!)).toBe('LinearY');
    });

    it('mounts both gun arms on that single carriage', () => {
      const drive = doc.nodes.find((n) => n.name === 'Drive-Lin-Y')!;
      const names = (drive.children ?? []).map((i) => doc.nodes[i].name ?? '');
      expect(names.filter((n) => n.startsWith('Gun-Arm-'))).toEqual(['Gun-Arm-L', 'Gun-Arm-R']);
      expect(names.filter((n) => n.startsWith('Spray-Fan-'))).toHaveLength(6);
    });

    it('declares drive limits in millimetres per schema/v1 §7a.1', () => {
      const drive = doc.nodes.find((n) => n.name === 'Drive-Lin-Y')!;
      const cfg = drive.extras!.realvirtual!.Drive as Record<string, unknown>;
      expect(cfg.Direction).toBe('LinearY');
      expect(cfg.UseLimits).toBe(true);
      expect(cfg.UpperLimit).toBe(1200);
    });
  });

  describe('surface normals (lighting regression)', () => {
    // Without NORMAL these shells render as solid black silhouettes on a real
    // GPU — correct floor, correct shadows, no surface lighting — while still
    // looking fine under a software renderer's "Fast" preset. The glTF spec
    // permits omitting normals; this product's renderers do not make it safe.
    it.each(OBJECT_FILES)('%s declares NORMAL on every primitive', (file) => {
      const doc = readGlb(file);
      for (const mesh of (doc.meshes ?? []) as { primitives: { attributes: Record<string, number> }[] }[]) {
        for (const prim of mesh.primitives) {
          expect(prim.attributes.POSITION, 'POSITION').toBeDefined();
          expect(prim.attributes.NORMAL, 'NORMAL — missing normals render unlit/black').toBeDefined();
        }
      }
    });

    it('points every normal outward and winds every triangle to match', () => {
      const doc = readGlb('SprayBooth.glb');
      const bin = readGlbBin('SprayBooth.glb');
      const prim = (doc.meshes as unknown as { primitives: { attributes: Record<string, number>; indices: number }[] }[])[0].primitives[0];
      const pos = floats(doc, bin, prim.attributes.POSITION);
      const nrm = floats(doc, bin, prim.attributes.NORMAL);
      const idx = shorts(doc, bin, prim.indices);

      expect(pos.length / 3, 'four vertices per cube face').toBe(24);
      expect(nrm.length).toBe(pos.length);

      const at = (a: Float32Array, i: number) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] as const;

      // Every normal is a unit axis vector.
      for (let v = 0; v < 24; v++) {
        const n = at(nrm, v);
        expect(Math.hypot(...n), `vertex ${v} normal is not unit length`).toBeCloseTo(1, 6);
      }

      // Outward: on a cube centred at the origin, position · normal > 0.
      for (let v = 0; v < 24; v++) {
        const p = at(pos, v);
        const n = at(nrm, v);
        const dot = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
        expect(dot, `vertex ${v} normal points inward`).toBeGreaterThan(0);
      }

      // Winding: the geometric normal of each triangle must agree with the
      // vertex normal, or the face is backwards and culls away.
      for (let t = 0; t < idx.length; t += 3) {
        const a = at(pos, idx[t]);
        const b = at(pos, idx[t + 1]);
        const c = at(pos, idx[t + 2]);
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cross = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const len = Math.hypot(...cross);
        expect(len, `triangle ${t / 3} is degenerate`).toBeGreaterThan(0);
        const n = at(nrm, idx[t]);
        const agree = (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]) / len;
        expect(agree, `triangle ${t / 3} is wound backwards`).toBeCloseTo(1, 6);
      }
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
