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
const LOOP_LEN_Z = 30;    // m — process-side straight length
const LOOP_R = 3;         // m — end-loop radius
const LOOP_W = 2 * LOOP_R; // m — distance from the process side to the buffer entry
const BUF_R = 2;          // m — serpentine switchback radius
const CARRIER_COUNT = 72;

/**
 * The closed circuit, in flow order.
 *
 * Process side runs +Z along x = 0 and is UNCHANGED from the four-stage layout,
 * so the pre-treat / oven / booth / cooling placements keep their coordinates.
 * The return is folded into a three-pass serpentine ACCUMULATION BUFFER beside
 * the line (x 6…16, z 8…32) — the shape the reference process animation gives
 * the largest share of its floor to — and then sweeps back below z = 0 to close
 * on the start.
 *
 *      x=0        x=6   x=10  x=14
 *   ┌─ process ──┐ ┌buf1┐ ┌buf2┐ ┌buf3┐
 *   │     +Z     │ │ -Z │ │ +Z │ │ -Z │
 *   └────────────┘ └────┘ └────┘ └────┘
 *                    (gate at the buffer exit)
 */
const LOOP_SEGMENTS = [
  // Process side: +Z past all four process stages.
  { kind: 'line', from: [0, TRACK_Y, 0], to: [0, TRACK_Y, LOOP_LEN_Z] },
  // Far end: 180° onto the buffer entry.
  { kind: 'arc', center: [LOOP_R, TRACK_Y, LOOP_LEN_Z], radius: LOOP_R,
    startAngle: 180, degrees: 180, clockwise: true, plane: 'XZ' },
  // ── Serpentine accumulation buffer: three passes, two switchbacks ──
  { kind: 'line', from: [6, TRACK_Y, LOOP_LEN_Z], to: [6, TRACK_Y, 10] },
  { kind: 'arc', center: [8, TRACK_Y, 10], radius: BUF_R,
    startAngle: 180, degrees: 180, clockwise: false, plane: 'XZ' },
  { kind: 'line', from: [10, TRACK_Y, 10], to: [10, TRACK_Y, 30] },
  { kind: 'arc', center: [12, TRACK_Y, 30], radius: BUF_R,
    startAngle: 180, degrees: 180, clockwise: true, plane: 'XZ' },
  { kind: 'line', from: [14, TRACK_Y, 30], to: [14, TRACK_Y, 10] },
  // ── Buffer exit → return sweep below the line, back to the start ──
  { kind: 'line', from: [14, TRACK_Y, 10], to: [14, TRACK_Y, -3] },
  { kind: 'arc', center: [11, TRACK_Y, -3], radius: 3,
    startAngle: 0, degrees: 90, clockwise: true, plane: 'XZ' },
  { kind: 'line', from: [11, TRACK_Y, -6], to: [3, TRACK_Y, -6] },
  { kind: 'arc', center: [3, TRACK_Y, -3], radius: 3,
    startAngle: 270, degrees: 90, clockwise: true, plane: 'XZ' },
  { kind: 'line', from: [0, TRACK_Y, -3], to: [0, TRACK_Y, 0] },
];

/**
 * Index of the segment the release gate sits at the END of — the buffer exit,
 * where a closed gate backs the queue up through all three serpentine passes.
 * Exported into the scene as an arc length so the asset and the scene config
 * cannot drift apart.
 */
const GATE_AFTER_SEGMENT = 6;   // end of the third buffer pass

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
  // Support posts sampled ALONG the path rather than at hardcoded x/z pairs:
  // the serpentine has six straights at four different x values, and a fixed
  // table would leave whole passes unsupported.
  const POST_SPACING_M = 5;
  for (let sM = 0; sM < LOOP_LENGTH; sM += POST_SPACING_M) {
    const { pos } = loopPose(sM);
    track.push(doc.box('TrackPost', {
      at: [pos[0], (TRACK_Y + 0.2) / 2, pos[2]],
      size: [0.12, TRACK_Y + 0.2, 0.12],
      material: 'Steel',
    }));
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

/**
 * Six-axis paint robot (EP-DEMO-002 M2).
 *
 * Authored the way the shipped `public/models/DemoRobotIK.glb` is, because that
 * is what the runtime actually reads — NOT the `Drive-Rot-*` name convention:
 *
 *   - each joint is a node NESTED inside the previous one, so the scene graph
 *     itself is the kinematic chain;
 *   - each joint carries its own `rv_extras.realvirtual.Drive` with a
 *     `Direction` and limits — the name plays no part, which also sidesteps the
 *     "one `Drive-Rot-Y` per object" collision the anchored name parser imposes;
 *   - the root carries `RobotIK` whose `Axis` array holds one
 *     `ComponentReference` per joint, addressed by its NESTED PATH
 *     (`SprayBooth/Robot/A1/A2/...`), resolved through the node registry by
 *     `resolveAxisDrivesFromNode` (src/core/engine/rv-ik-path.ts:760).
 *
 * A wrong path resolves to nothing and the component reports `axes=0` in the
 * loader log while the asset still renders perfectly — so the node test asserts
 * every reference lands on a node that really carries a Drive.
 */
function addPaintRobot(doc, out, { at, rootPath }) {
  // Joint chain, base upward. `dir` is the rv-ODT Drive Direction; `at` is the
  // joint's offset from its PARENT joint.
  const JOINTS = [
    { name: 'A1', dir: 'RotationY', at: [0, 0.45, 0],    limit: 170, mesh: { size: [0.34, 0.30, 0.34], at: [0, 0.15, 0] } },
    { name: 'A2', dir: 'RotationX', at: [0, 0.30, 0],    limit: 100, mesh: { size: [0.24, 0.90, 0.24], at: [0, 0.45, 0] } },
    { name: 'A3', dir: 'RotationX', at: [0, 0.90, 0],    limit: 120, mesh: { size: [0.20, 0.70, 0.20], at: [0, 0.35, 0] } },
    { name: 'A4', dir: 'RotationY', at: [0, 0.70, 0],    limit: 180, mesh: { size: [0.16, 0.26, 0.16], at: [0, 0.13, 0] } },
    { name: 'A5', dir: 'RotationX', at: [0, 0.26, 0],    limit: 120, mesh: { size: [0.15, 0.20, 0.15], at: [0, 0.10, 0] } },
    { name: 'A6', dir: 'RotationY', at: [0, 0.20, 0],    limit: 360, mesh: { size: [0.12, 0.14, 0.12], at: [0, 0.07, 0] } },
  ];

  // Build innermost-first: each joint node must exist before its parent lists
  // it as a child.
  let childIdx = [];
  const axisPaths = [];
  for (let i = JOINTS.length - 1; i >= 0; i--) {
    const j = JOINTS[i];
    const parts = [j.mesh
      ? doc.box(`${j.name}-Link`, { at: j.mesh.at, size: j.mesh.size, material: 'GunBody' })
      : null].filter((v) => v !== null);

    if (i === JOINTS.length - 1) {
      // Tool: the spray gun and its fan ride the last joint.
      parts.push(doc.box('Gun-Head', { at: [0, 0.16, 0], size: [0.10, 0.18, 0.10], material: 'GunBody' }));
      parts.push(doc.box('Spray-Fan', { at: [0, 0.55, 0], size: [0.50, 0.60, 0.50], material: 'SprayFan' }));
    }
    childIdx = [doc.empty(j.name, {
      at: j.at,
      children: [...parts, ...childIdx],
      realvirtual: {
        Drive: {
          Direction: j.dir,
          TargetSpeed: 120,       // deg/s
          Acceleration: 300,      // deg/s²
          UseAcceleration: true,
          UseLimits: true,
          LowerLimit: -j.limit,
          UpperLimit: j.limit,
        },
      },
    })];
  }

  // Nested reference paths, exactly the shape DemoRobotIK.glb uses.
  let path = `${rootPath}/Robot`;
  for (const j of JOINTS) {
    path = `${path}/${j.name}`;
    axisPaths.push(path);
  }

  const pedestal = doc.box('Robot-Base', { at: [0, 0.22, 0], size: [0.5, 0.44, 0.5], material: 'Steel' });
  out.push(doc.empty('Robot', {
    at,
    children: [pedestal, ...childIdx],
    realvirtual: {
      RobotIK: {
        WristType: 'Spherical',
        ElbowInUnityX: false,
        DrawGizmos: false,
        Axis: axisPaths.map((p) => ({
          type: 'ComponentReference',
          path: p,
          componentType: 'realvirtual.Drive',
          componentIndex: 0,
        })),
      },
    },
  }));
}

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

  // Floor-standing robot beside the track, which runs down the booth centre.
  addPaintRobot(doc, out, { at: [1.5, 0.1, -0.6], rootPath: 'SprayBooth' });

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
// Derived geometry, written for the SCENE generator to consume.
//
// The gate's arc length is a fact about the path in the asset. Re-deriving it in
// `build-paintline-scene.mjs` would mean a second copy of the segment table,
// and the two would drift the first time this loop changes shape. Emitted here,
// asserted against the GLB's own Path by `tests/paintline-library.node.test.ts`.
const gateSM = LOOP_PREFIX[GATE_AFTER_SEGMENT] + segmentLength(LOOP_SEGMENTS[GATE_AFTER_SEGMENT]);
writeFileSync(join(OUT_DIR, 'paintline-geometry.json'), `${JSON.stringify({
  loopLengthM: r6(LOOP_LENGTH),
  carrierCount: CARRIER_COUNT,
  gates: [{ name: 'BufferExit', sM: r6(gateSM) }],
}, null, 2)}\n`);

console.log(`  paintline-geometry.json   loop ${LOOP_LENGTH.toFixed(2)} m, buffer-exit gate at ${gateSM.toFixed(2)} m`);
console.log(`\n${OBJECTS.length} paint-line library objects → ${OUT_DIR}  (${total} bytes)`);
console.log('Next: npm run build:library  (regenerates public/library/catalog.json)');
