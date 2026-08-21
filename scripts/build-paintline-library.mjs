// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * build-paintline-library.mjs — generates the `Paint Line` standard-library
 * objects into `public/library/PaintLine/` (EP-DEMO-001, M1).
 *
 * Follows the established programmatic-fixture pattern of
 * `scripts/build-physics-test-glb.mjs`: a hand-built glTF 2.0 binary (JSON
 * chunk + BIN chunk) rather than GLTFExporter, which needs FileReader/Blob
 * plumbing in Node. Every object shares ONE unit-cube mesh, instanced per node
 * via translation/rotation/scale — the whole library is boxes, which is exactly
 * the stylised "white shell + translucent zone" look the demo targets.
 *
 * The output is DETERMINISTIC: no timestamps, no randomness, insertion-ordered
 * material allocation. Two runs produce byte-identical files so the generated
 * assets stay reviewable in diffs.
 *
 * Library-object contracts these assets rely on (all verified against code,
 * NOT assumed — see EP-DEMO-001 "Current Repository Facts"):
 *   - Behaviors match the GLB FILENAME (or the placed asset name), so the
 *     overhead conveyor's file MUST contain `OverheadConveyor` to be picked up
 *     by its `models: ['*OverheadConveyor*']` glob   (src/core/behaviors.ts).
 *   - Carriers are convention-named `Carrier-<id>` and MUST be DIRECT children
 *     of the component root: OverheadConveyor writes their pose into the LOCAL
 *     frame under an identity-parent assumption
 *     (src/behaviors/OverheadConveyor.ts, src/core/library-component-loader.ts).
 *   - Drive nodes parse with an ANCHORED regex `^Drive-(Lin|Rot)-([XYZ])$` —
 *     no suffix is tolerated, so a booth may carry at most one `Drive-Lin-Y`
 *     (src/core/library-component-loader.ts:38).
 *   - Snap points are `Snap-<AXIS><FLOW>-<TYPEID>`; process sections use the
 *     `paintseg` typeId and flow along Z, matching the shipped PalletHandling
 *     convention (`Snap-ZN-convchain` / `Snap-ZP-convchain`).
 *
 * Arc convention (src/core/engine/rv-path.ts, ArcSegment): in the `XZ` plane
 * u=+X, v=+Z and position = center + R·cos(a)·u + R·sin(a)·v, with `clockwise`
 * negating the sweep. The loop below is authored against that basis and the
 * baked preview poses are cross-checked against the runtime parser by
 * `tests/node/paintline-library.test.ts`.
 *
 * Re-run after changing anything here:
 *   node scripts/build-paintline-library.mjs && npm run build:library
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'public', 'library', 'PaintLine',
);

// ─── Shared unit-cube geometry (centered at origin, size 1) ─────────────────
//
// 24 vertices — four per face — so every face can carry its own NORMAL.
//
// An 8-vertex cube with POSITION only is smaller, and the glTF spec does say a
// reader must then compute flat normals. Do not do it: the shipped library and
// demo GLBs all ship NORMAL, and on a real GPU these shells rendered as solid
// black silhouettes (correct floor, correct shadows, no surface lighting)
// while still looking fine under the software renderer's "Fast" preset. The
// bytes saved are not worth a demo that only lights up on some machines.
// `scripts/build-physics-test-glb.mjs` still uses the 8-vertex form; it is an
// invisible physics fixture, not a visual asset.

/** Faces as (axis, sign) with a right-handed (u, v) basis where u x v = normal. */
const CUBE_FACES = [
  { n: [1, 0, 0],  u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0],  u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1],  u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

const positions = [];
const normals = [];
const indices = [];
for (const { n, u, v } of CUBE_FACES) {
  const base = positions.length / 3;
  // Corner order (-u,-v) → (+u,-v) → (+u,+v) → (-u,+v) is counter-clockwise
  // seen from outside, given u x v = n.
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let axis = 0; axis < 3; axis++) {
      positions.push(n[axis] * 0.5 + u[axis] * su * 0.5 + v[axis] * sv * 0.5);
      normals.push(n[axis]);
    }
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const POSITIONS = new Float32Array(positions);
const NORMALS = new Float32Array(normals);
const INDICES = new Uint16Array(indices);

const POS_BYTES = Buffer.from(POSITIONS.buffer);
const NRM_BYTES = Buffer.from(NORMALS.buffer);
const IDX_BYTES = Buffer.from(INDICES.buffer);
const BIN = Buffer.concat([POS_BYTES, NRM_BYTES, IDX_BYTES]); // 288 + 288 + 72

// ─── Material palette ───────────────────────────────────────────────────────
// `a < 1` implies alphaMode BLEND + doubleSided (translucent process zones).

const PALETTE = {
  Shell:      { color: [0.91, 0.91, 0.93, 1],    metallic: 0.05, rough: 0.85 },
  Steel:      { color: [0.55, 0.56, 0.60, 1],    metallic: 0.35, rough: 0.55 },
  Track:      { color: [0.28, 0.29, 0.33, 1],    metallic: 0.45, rough: 0.45 },
  Plenum:     { color: [0.62, 0.24, 0.72, 1],    metallic: 0.10, rough: 0.60 },
  PartRaw:    { color: [0.34, 0.35, 0.39, 1],    metallic: 0.40, rough: 0.55 },
  GunBody:    { color: [0.16, 0.34, 0.72, 1],    metallic: 0.20, rough: 0.45 },
  ZonePretreat: { color: [0.36, 0.72, 0.62, 0.28], metallic: 0, rough: 1 },
  ZoneOven:     { color: [0.86, 0.42, 0.24, 0.24], metallic: 0, rough: 1 },
  ZoneSpray:    { color: [0.72, 0.32, 0.78, 0.22], metallic: 0, rough: 1 },
  ZoneCool:     { color: [0.30, 0.48, 0.86, 0.30], metallic: 0, rough: 1 },
  SprayFan:     { color: [0.86, 0.88, 0.95, 0.16], metallic: 0, rough: 1 },
};

// ─── glTF document builder ──────────────────────────────────────────────────

/** Yaw quaternion about +Y, in radians → glTF [x, y, z, w]. */
function yawQuat(theta) {
  return [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)];
}

/** Round to 6 decimals so float noise cannot make two runs differ textually. */
function r6(n) {
  const v = Math.round(n * 1e6) / 1e6;
  return Object.is(v, -0) ? 0 : v;
}

class GlbDoc {
  constructor(sceneName) {
    this.sceneName = sceneName;
    this.nodes = [];
    this.materials = [];
    this.meshes = [];
    /** material key → mesh index (one mesh per material, all sharing the cube). */
    this.meshByMaterial = new Map();
  }

  /** Mesh index for a palette key, allocating the material + mesh on first use. */
  meshFor(key) {
    const cached = this.meshByMaterial.get(key);
    if (cached !== undefined) return cached;
    const spec = PALETTE[key];
    if (!spec) throw new Error(`unknown palette key: ${key}`);
    const materialIndex = this.materials.length;
    const translucent = spec.color[3] < 1;
    this.materials.push({
      name: key,
      ...(translucent ? { alphaMode: 'BLEND', doubleSided: true } : {}),
      pbrMetallicRoughness: {
        baseColorFactor: spec.color,
        metallicFactor: spec.metallic,
        roughnessFactor: spec.rough,
      },
    });
    const meshIndex = this.meshes.length;
    this.meshes.push({
      name: `${key}Cube`,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: materialIndex }],
    });
    this.meshByMaterial.set(key, meshIndex);
    return meshIndex;
  }

  /** Push a node, return its index. */
  add(node) {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }

  /** rv_extras wrapper — omitted entirely when there is nothing to carry. */
  static extras(realvirtual) {
    return realvirtual
      ? { extras: { realvirtual: { _formatVersion: '1.0', ...realvirtual } } }
      : {};
  }

  /**
   * Box instance: `size` is the full extent in meters, `at` the CENTER.
   * `yaw` rotates about +Y (radians).
   */
  box(name, { at, size, material, yaw = 0, realvirtual, children }) {
    return this.add({
      name,
      mesh: this.meshFor(material),
      translation: at.map(r6),
      ...(yaw !== 0 ? { rotation: yawQuat(yaw).map(r6) } : {}),
      scale: size.map(r6),
      ...(children?.length ? { children } : {}),
      ...GlbDoc.extras(realvirtual),
    });
  }

  /** Meshless node (groups, snap points, path carriers, drive pivots). */
  empty(name, { at = [0, 0, 0], rotation, realvirtual, children } = {}) {
    return this.add({
      name,
      ...(at.some((v) => v !== 0) ? { translation: at.map(r6) } : {}),
      ...(rotation ? { rotation: rotation.map(r6) } : {}),
      ...(children?.length ? { children } : {}),
      ...GlbDoc.extras(realvirtual),
    });
  }

  /** Pack to a GLB buffer with `rootIndex` as the single scene root. */
  pack(rootIndex) {
    const gltf = {
      asset: { version: '2.0', generator: 'XYvirtual paint-line library generator (EP-DEMO-001)' },
      scene: 0,
      scenes: [{ name: this.sceneName, nodes: [rootIndex] }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      accessors: [
        { bufferView: 0, componentType: 5126, count: POSITIONS.length / 3, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
        { bufferView: 1, componentType: 5126, count: NORMALS.length / 3, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
        { bufferView: 2, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: POS_BYTES.length, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES.length, byteLength: NRM_BYTES.length, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES.length + NRM_BYTES.length, byteLength: IDX_BYTES.length, target: 34963 },
      ],
      buffers: [{ byteLength: BIN.length }],
    };

    const json = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const binChunk = Buffer.concat([BIN, Buffer.alloc((4 - (BIN.length % 4)) % 4, 0x00)]);

    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binChunk.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

    return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
  }
}

// ─── The closed loop ────────────────────────────────────────────────────────
//
// A racetrack in the XZ plane at track height TRACK_Y, running along +Z on the
// PROCESS side (x = 0) and back along -Z on the LOAD/UNLOAD side (x = LOOP_W).
// Z is the flow axis so the process sections match the shipped `Snap-Z*`
// library convention.

const TRACK_Y = 2.6;      // m — path height (carrier attachment)
const LOOP_LEN_Z = 30;    // m — straight length
const LOOP_R = 3;         // m — end-loop radius
const LOOP_W = 2 * LOOP_R; // m — distance between the two straights
const CARRIER_COUNT = 40;

const LOOP_SEGMENTS = [
  // Process side: +Z from z=0 to z=30 at x=0.
  { kind: 'line', from: [0, TRACK_Y, 0], to: [0, TRACK_Y, LOOP_LEN_Z] },
  // Far end: 180° turn, clockwise sweep keeps the tangent continuous (+Z → -Z).
  {
    kind: 'arc', center: [LOOP_R, TRACK_Y, LOOP_LEN_Z], radius: LOOP_R,
    startAngle: 180, degrees: 180, clockwise: true, plane: 'XZ',
  },
  // Return side: -Z from z=30 back to z=0 at x=6.
  { kind: 'line', from: [LOOP_W, TRACK_Y, LOOP_LEN_Z], to: [LOOP_W, TRACK_Y, 0] },
  // Near end: 180° turn back onto the process side.
  {
    kind: 'arc', center: [LOOP_R, TRACK_Y, 0], radius: LOOP_R,
    startAngle: 0, degrees: 180, clockwise: true, plane: 'XZ',
  },
];

// A local evaluator mirroring rv-path.ts's ArcSegment/LineSegment basis. It
// exists ONLY to bake preview poses (thumbnails, and any viewer that renders
// the asset without the behavior bound). `rv-path.ts` stays the runtime SSOT;
// `tests/node/paintline-library.test.ts` asserts the two agree.

const DEG2RAD = Math.PI / 180;

function segmentLength(seg) {
  if (seg.kind === 'line') {
    const [ax, ay, az] = seg.from;
    const [bx, by, bz] = seg.to;
    return Math.hypot(bx - ax, by - ay, bz - az);
  }
  return seg.radius * Math.abs(seg.degrees * DEG2RAD);
}

/** Position + unit tangent at t01 within one segment (XZ-plane arcs only). */
function segmentPose(seg, t01) {
  if (seg.kind === 'line') {
    const [ax, ay, az] = seg.from;
    const [bx, by, bz] = seg.to;
    const len = segmentLength(seg) || 1;
    return {
      pos: [ax + (bx - ax) * t01, ay + (by - ay) * t01, az + (bz - az) * t01],
      tan: [(bx - ax) / len, (by - ay) / len, (bz - az) / len],
    };
  }
  const sgn = seg.clockwise ? -1 : 1;
  const a = (seg.startAngle + sgn * seg.degrees * t01) * DEG2RAD;
  const [cx, cy, cz] = seg.center;
  return {
    pos: [cx + seg.radius * Math.cos(a), cy, cz + seg.radius * Math.sin(a)],
    tan: [-Math.sin(a) * sgn, 0, Math.cos(a) * sgn],
  };
}

const LOOP_PREFIX = [];
let LOOP_LENGTH = 0;
for (const seg of LOOP_SEGMENTS) {
  LOOP_PREFIX.push(LOOP_LENGTH);
  LOOP_LENGTH += segmentLength(seg);
}

/** Pose at an absolute arc length, wrapping (the loop is closed). */
function loopPose(s) {
  const m = ((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  let i = LOOP_SEGMENTS.length - 1;
  while (i > 0 && LOOP_PREFIX[i] > m) i--;
  const len = segmentLength(LOOP_SEGMENTS[i]) || 1;
  return segmentPose(LOOP_SEGMENTS[i], (m - LOOP_PREFIX[i]) / len);
}

/**
 * Gravity-oriented yaw, matching OverheadConveyor.applyPoses: up stays the
 * path's align axis and only the yaw comes from the tangent flattened against
 * it. A node's local +Z maps to (sin θ, 0, cos θ) under a yaw of θ, so a
 * tangent (tx, _, tz) needs θ = atan2(tx, tz).
 */
function yawFromTangent(tan) {
  return Math.atan2(tan[0], tan[2]);
}

// ─── Object 1 — the circulating overhead conveyor ───────────────────────────

function buildOverheadConveyor() {
  const doc = new GlbDoc('PaintLineOverheadConveyor');
  const children = [];

  // The closed path. `id` is what OverheadConveyorBehavior.PathId selects.
  children.push(doc.empty('Path-PaintLineLoop', {
    realvirtual: {
      Path: {
        type: 'Path',
        version: 1,
        id: 'PaintLineLoop',
        closed: true,
        align: [0, 1, 0],
        segments: LOOP_SEGMENTS,
      },
    },
  }));

  // Visible track: one long beam per straight, short chords along each arc,
  // plus support posts. Purely decorative — the path above is the truth.
  const beamY = TRACK_Y + 0.12;
  const track = [];
  for (const seg of LOOP_SEGMENTS) {
    if (seg.kind === 'line') {
      const mid = [
        (seg.from[0] + seg.to[0]) / 2, beamY, (seg.from[2] + seg.to[2]) / 2,
      ];
      const len = segmentLength(seg);
      track.push(doc.box('TrackBeam', {
        at: mid, size: [0.16, 0.16, len], material: 'Track',
      }));
    } else {
      const CHORDS = 12;
      const chordLen = 2 * seg.radius * Math.sin(Math.abs(seg.degrees) * DEG2RAD / (2 * CHORDS));
      for (let i = 0; i < CHORDS; i++) {
        const { pos, tan } = segmentPose(seg, (i + 0.5) / CHORDS);
        track.push(doc.box('TrackBeam', {
          at: [pos[0], beamY, pos[2]],
          size: [0.16, 0.16, chordLen * 1.06],
          yaw: yawFromTangent(tan),
          material: 'Track',
        }));
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const z = 2.5 + i * 5;
    for (const x of [0, LOOP_W]) {
      track.push(doc.box('TrackPost', {
        at: [x, (TRACK_Y + 0.2) / 2, z],
        size: [0.12, TRACK_Y + 0.2, 0.12],
        material: 'Steel',
      }));
    }
  }
  children.push(doc.empty('Track', { children: track }));

  // Carriers — DIRECT children of the root (identity-parent assumption) and
  // pre-posed at their s = i·pitch so the static asset already reads correctly.
  const pitch = LOOP_LENGTH / CARRIER_COUNT;
  for (let i = 0; i < CARRIER_COUNT; i++) {
    const { pos, tan } = loopPose(i * pitch);
    const parts = [
      doc.box('Trolley',  { at: [0, -0.07, 0], size: [0.14, 0.10, 0.22], material: 'Steel' }),
      doc.box('Rod',      { at: [0, -0.57, 0], size: [0.05, 0.90, 0.05], material: 'Steel' }),
      doc.box('Crossbar', { at: [0, -1.04, 0], size: [0.72, 0.05, 0.05], material: 'Steel' }),
      doc.box('Workpiece-A', { at: [-0.26, -1.22, 0], size: [0.30, 0.34, 0.04], material: 'PartRaw' }),
      doc.box('Workpiece-B', { at: [ 0.26, -1.22, 0], size: [0.30, 0.34, 0.04], material: 'PartRaw' }),
    ];
    children.push(doc.empty(`Carrier-${String(i + 1).padStart(2, '0')}`, {
      at: pos,
      rotation: yawQuat(yawFromTangent(tan)),
      children: parts,
      // `Kinematic` marks a RIGID GROUP whose transform a solver writes every
      // tick — exactly what OverheadConveyor does to a carrier. Without it the
      // loader's two static classifications both treat the hanger as scenery:
      // `MOVER_KEY` (rv-freeze-static.ts) freezes its matrices, and `MOTION_KEY`
      // (rv-scene-loader.ts) merges its meshes into the root-parented static
      // arena, "which cannot move by construction". The chain then runs
      // perfectly in simulation while the picture never changes — measured as
      // `Carrier-01.position.z` 2.75 → 4.39 m with byte-identical canvas pixels.
      // `Kinematic` is the one key both classifications honour.
      realvirtual: { Kinematic: {} },
    }));
  }

  const root = doc.empty('PaintLineOverheadConveyor', {
    children,
    realvirtual: {
      OverheadConveyorBehavior: {
        // Demo pacing, NOT an engineering value: a real continuous paint line
        // runs 2–6 m/min. At 300 mm/s (18 m/min) the ~79 m loop closes in about
        // 4.4 minutes, which is watchable. EP-DEMO-001 M1 records this.
        TargetSpeed: 300,
        Acceleration: 150,
        UseAcceleration: true,
        PathId: 'PaintLineLoop',
        Pitch: 0,        // 0 → the component distributes L / N evenly
        StartPhase: 0,
      },
    },
  });
  return { doc, root };
}

// ─── Process sections ───────────────────────────────────────────────────────

/** Shared shell: two side walls + a roof, both ends open, flow along Z. */
function addTunnelShell(doc, out, { length, width, height, wall = 0.18 }) {
  const halfW = width / 2;
  out.push(doc.box('Shell-Left', {
    at: [-halfW, height / 2, 0], size: [wall, height, length], material: 'Shell',
  }));
  out.push(doc.box('Shell-Right', {
    at: [halfW, height / 2, 0], size: [wall, height, length], material: 'Shell',
  }));
  out.push(doc.box('Shell-Roof', {
    at: [0, height + wall / 2, 0], size: [width + wall, wall, length], material: 'Shell',
  }));
}

/** The two typed connectors every process section carries (flow along Z). */
function addSegmentSnaps(doc, out, length) {
  out.push(doc.empty('Snap-ZN-paintseg', { at: [0, TRACK_Y, -length / 2] }));
  out.push(doc.empty('Snap-ZP-paintseg', { at: [0, TRACK_Y, length / 2] }));
}

function buildProcessSection(name, { length, width, height, zone, plenum }) {
  const doc = new GlbDoc(name);
  const out = [];
  addTunnelShell(doc, out, { length, width, height });
  // Translucent interior volume — the video's colour-coded process zones.
  out.push(doc.box('ProcessZone', {
    at: [0, height / 2, 0], size: [width - 0.4, height - 0.4, length - 0.1], material: zone,
  }));
  if (plenum) {
    out.push(doc.box('Plenum', {
      at: [0, height + 0.62, 0], size: [width * 0.7, 0.9, length * 0.75], material: plenum,
    }));
  }
  addSegmentSnaps(doc, out, length);
  return { doc, root: doc.empty(name, { children: out }) };
}

// ─── Object 4 — spray booth ─────────────────────────────────────────────────

function buildSprayBooth() {
  const LENGTH = 6, WIDTH = 4.4, HEIGHT = 3.4;
  const doc = new GlbDoc('SprayBooth');
  const out = [];
  addTunnelShell(doc, out, { length: LENGTH, width: WIDTH, height: HEIGHT, wall: 0.22 });
  out.push(doc.box('Shell-Floor', {
    at: [0, 0.05, 0], size: [WIDTH, 0.10, LENGTH], material: 'Shell',
  }));
  out.push(doc.box('ProcessZone', {
    at: [0, HEIGHT / 2, 0], size: [WIDTH - 0.5, HEIGHT - 0.4, LENGTH - 0.1], material: 'ZoneSpray',
  }));

  // Reciprocator carriage. The name is EXACTLY `Drive-Lin-Y` — the parser is
  // anchored, so no descriptive suffix is allowed and only one such node may
  // exist per object. Both gun arms therefore ride this single carriage, which
  // is also how a real reciprocator gantry works.
  const gunParts = [];
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    gunParts.push(doc.box(`Gun-Arm-${tag}`, {
      at: [side * 1.35, 0, 0], size: [0.7, 0.16, 0.16], material: 'GunBody',
    }));
    for (let i = 0; i < 3; i++) {
      const z = -1.2 + i * 1.2;
      gunParts.push(doc.box(`Gun-Head-${tag}${i + 1}`, {
        at: [side * 1.0, 0, z], size: [0.12, 0.12, 0.30], material: 'GunBody',
      }));
      // Spray fan — M3 toggles these with the reciprocator stroke.
      gunParts.push(doc.box(`Spray-Fan-${tag}${i + 1}`, {
        at: [side * 0.55, 0, z], size: [0.75, 0.55, 0.55], material: 'SprayFan',
      }));
    }
  }
  out.push(doc.empty('Drive-Lin-Y', {
    at: [0, 1.25, 0],
    children: gunParts,
    realvirtual: {
      // Units are millimetres (schema/v1 §7a.1). 1.2 m stroke, no motion until
      // something jogs it — M3's plugin owns the stroke reversal.
      Drive: {
        Direction: 'LinearY',
        TargetSpeed: 700,
        Acceleration: 1400,
        UseAcceleration: true,
        UseLimits: true,
        LowerLimit: 0,
        UpperLimit: 1200,
      },
    },
  }));

  addSegmentSnaps(doc, out, LENGTH);
  return { doc, root: doc.empty('SprayBooth', { children: out }) };
}

// ─── Object 6 — load / unload station ───────────────────────────────────────

function buildLoadUnloadStation() {
  const LENGTH = 8, WIDTH = 4.6, HEIGHT = 3.2;
  const doc = new GlbDoc('LoadUnloadStation');
  const out = [];
  addTunnelShell(doc, out, { length: LENGTH, width: WIDTH, height: HEIGHT });
  out.push(doc.box('Platform-Load', {
    at: [-1.5, 0.20, -2.0], size: [1.2, 0.40, 3.0], material: 'Steel',
  }));
  out.push(doc.box('Platform-Unload', {
    at: [-1.5, 0.20, 2.0], size: [1.2, 0.40, 3.0], material: 'Steel',
  }));
  out.push(doc.box('PartRack', {
    at: [1.5, 0.55, 0], size: [1.1, 1.10, 5.0], material: 'Shell',
  }));
  out.push(doc.empty('Snap-ZB-paintseg', { at: [0, TRACK_Y, -LENGTH / 2] }));
  return { doc, root: doc.empty('LoadUnloadStation', { children: out }) };
}

// ─── Object 7 — the standalone workpiece ────────────────────────────────────

function buildWorkpiece() {
  const doc = new GlbDoc('Workpiece-Bracket');
  const out = [
    doc.box('Web',    { at: [0, 0.17, 0],     size: [0.30, 0.34, 0.04], material: 'PartRaw' }),
    doc.box('Flange', { at: [0, 0.02, 0.075], size: [0.30, 0.04, 0.15], material: 'PartRaw' }),
  ];
  return { doc, root: doc.empty('Workpiece-Bracket', { children: out }) };
}

// ─── Emit ───────────────────────────────────────────────────────────────────

const OBJECTS = [
  ['PaintLineOverheadConveyor', buildOverheadConveyor],
  ['PretreatTunnel-8m', () => buildProcessSection('PretreatTunnel-8m', {
    length: 8, width: 3.2, height: 3.0, zone: 'ZonePretreat',
  })],
  ['DryOven-6m', () => buildProcessSection('DryOven-6m', {
    length: 6, width: 3.4, height: 3.2, zone: 'ZoneOven', plenum: 'Plenum',
  })],
  ['SprayBooth', buildSprayBooth],
  ['CoolingZone-4m', () => buildProcessSection('CoolingZone-4m', {
    length: 4, width: 3.2, height: 3.0, zone: 'ZoneCool',
  })],
  ['LoadUnloadStation', buildLoadUnloadStation],
  ['Workpiece-Bracket', buildWorkpiece],
];

mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
for (const [name, build] of OBJECTS) {
  const { doc, root } = build();
  const glb = doc.pack(root);
  const outPath = join(OUT_DIR, `${name}.glb`);
  writeFileSync(outPath, glb);
  total += glb.length;
  console.log(`  ${name}.glb  ${String(glb.length).padStart(7)} bytes  ${doc.nodes.length} nodes`);
}
console.log(`\n${OBJECTS.length} paint-line library objects → ${OUT_DIR}  (${total} bytes)`);
console.log('Next: npm run build:library  (regenerates public/library/catalog.json)');
