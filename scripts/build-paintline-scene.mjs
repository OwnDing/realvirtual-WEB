// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * build-paintline-scene.mjs — generates `public/scenes/DemoPaintLine.glb`
 * (EP-DEMO-001, M2): the assembled paint-line demo scene.
 *
 * A saved scene is NOT a geometry file. Since plan-397 phase 6 it is a
 * meshless PLACEMENT MANIFEST: every placement is a node carrying
 * `rv_extras.realvirtual.{ NodeId, AssetReference, PlacementMeta }`, and the
 * loader composes the referenced GLB subtrees in before running the normal
 * model loader over the result (see `adoptPlacedNode` in
 * `src/plugins/layout-planner/scene-mutations.ts`). This generator writes
 * exactly that shape, mirroring the structure of the shipped
 * `public/scenes/DemoPlanner.glb` — including its JSON-only framing with an
 * empty BIN chunk, as emitted by THREE.GLTFExporter.
 *
 * Why generated rather than hand-placed in the Planner (EP-DEMO-001 Decision
 * Log, 2026-08-21): a scene authored by dragging in the browser is an opaque
 * binary nobody can diff, review or re-run. Generating it keeps the whole demo
 * reproducible from source, exactly like the library objects it references.
 *
 * Contracts this file depends on (verified in code, not assumed):
 *   - Behaviors match the placed node's NAME (`src/core/behaviors.ts:14`), so
 *     each placement is named after its library GLB root — `PaintLineOverhead-
 *     Conveyor` contains `OverheadConveyor` and therefore binds. The catalog's
 *     humanised label ("Paint Line Overhead Conveyor") would NOT match.
 *   - `readPlacement` (`src/core/hmi/scene/rv-scene-glb-read.ts:111`) requires a
 *     `NodeId`, and `isPlacementNode` requires `PlacementMeta` to be present
 *     even when empty.
 *   - `resolvePlacementUrl` step 1 returns the stored `AssetReference.path`
 *     after `rebaseLocalLibraryUrl` re-roots any `…/library/…` suffix onto the
 *     current BASE_URL. So a root-absolute `/library/PaintLine/X.glb` stays
 *     portable across root, sub-path and customer deploys — and the scene
 *     resolves WITHOUT any catalog being loaded.
 *
 * `catalogUrls` is left EMPTY, matching the shipped DemoPlanner.glb: loading
 * this scene does not need a catalog (placements carry their own paths). To
 * keep authoring in the Planner, open it with `?library=library/catalog.json`.
 *
 * Deterministic: NodeIds are derived by hashing a fixed namespace with the
 * placement key, so two runs produce byte-identical output.
 *
 * Re-run after changing the layout:  node scripts/build-paintline-scene.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCENES_DIR = join(ROOT, 'public', 'scenes');
const SCENE_FILE = 'DemoPaintLine.glb';
const LIB_DIR = join(ROOT, 'public', 'library', 'PaintLine');

/** Stable UUID from a key — keeps the generator reproducible run to run. */
function stableId(key) {
  const h = createHash('sha256').update(`EP-DEMO-001/${key}`).digest('hex');
  // Shape the digest as a v4-looking UUID (version + variant nibbles fixed).
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

// ─── The layout ─────────────────────────────────────────────────────────────
//
// The conveyor sits at the ORIGIN and is not transformed, so its authored path
// coordinates are world coordinates — which sidesteps the path-space /
// world-space divergence recorded in EP-DEMO-001 (Surprises & Discoveries #3).
//
// Its loop runs +Z along x = 0 (process side) and -Z along x = 6 (return
// side), so the four process sections straddle x = 0 and the load/unload room
// straddles x = 6. Every section is authored centred on its own origin, so the
// placement Z below is the section's MIDPOINT.
//
//   z:  2 ─── 10   11 ─── 17   18 ─── 24   25 ─── 29
//       pretreat     oven        booth       cooling

// `config` is per-instance rv_extras written onto the PLACEMENT node. It has to
// live there, not on the library GLB's root: a behavior reads its settings from
// `self.root` (`configBag` in src/behaviors/OverheadConveyor.ts), and `self.root`
// is the scope the bind was dispatched with — for a placed LayoutObject that is
// the placement node, and the library GLB's own root is only a CHILD of it.
// Config authored one level down is silently ignored and the component falls
// back to its schema defaults (which is how this line first ran at the default
// 500 mm/s instead of the intended 300). See EP-DEMO-001 Surprises #7.
const PLACEMENTS = [
  {
    name: 'PaintLineOverheadConveyor', file: 'PaintLineOverheadConveyor.glb', at: [0, 0, 0], span: null,
    config: {
      OverheadConveyorBehavior: {
        // Demo pacing, NOT an engineering value — a real continuous paint line
        // runs 2–6 m/min. At 300 mm/s the ~78.85 m loop closes in ~4.4 min.
        TargetSpeed: 300,
        Acceleration: 150,
        UseAcceleration: true,
        PathId: 'PaintLineLoop',
        Pitch: 0,        // 0 → the component distributes L / N evenly
        StartPhase: 0,   // deterministic reset seed
      },
    },
  },
  { name: 'PretreatTunnel-8m',         file: 'PretreatTunnel-8m.glb',         at: [0, 0, 6],  span: [2, 10] },
  { name: 'DryOven-6m',                file: 'DryOven-6m.glb',                at: [0, 0, 14], span: [11, 17] },
  { name: 'SprayBooth',                file: 'SprayBooth.glb',                at: [0, 0, 21], span: [18, 24] },
  { name: 'CoolingZone-4m',            file: 'CoolingZone-4m.glb',            at: [0, 0, 27], span: [25, 29] },
  { name: 'LoadUnloadStation',         file: 'LoadUnloadStation.glb',         at: [6, 0, 12], span: [8, 16] },
];

/** Catalog id, as `scripts/build-local-library-catalog.mjs` derives it. */
function catalogId(file) {
  return `paintline-${file.replace(/\.glb$/, '').toLowerCase()}`;
}

// Fail loudly rather than emit a scene pointing at assets that do not exist.
const missing = PLACEMENTS.filter((p) => !existsSync(join(LIB_DIR, p.file)));
if (missing.length) {
  console.error(`Missing library assets: ${missing.map((m) => m.file).join(', ')}`);
  console.error('Run `node scripts/build-paintline-library.mjs` first.');
  process.exit(1);
}

// Cross-check every id against the generated catalog so a rename in the
// library generator cannot silently orphan the scene's placements.
const catalogPath = join(ROOT, 'public', 'library', 'catalog.json');
if (existsSync(catalogPath)) {
  const ids = new Set(JSON.parse(readFileSync(catalogPath, 'utf8')).entries.map((e) => e.id));
  const orphans = PLACEMENTS.map((p) => catalogId(p.file)).filter((id) => !ids.has(id));
  if (orphans.length) {
    console.error(`Placement ids absent from catalog.json: ${orphans.join(', ')}`);
    console.error('Run `npm run build:library` first.');
    process.exit(1);
  }
}

// ─── glTF document ──────────────────────────────────────────────────────────

const nodes = [{ children: PLACEMENTS.map((_, i) => i + 1) }];
for (const p of PLACEMENTS) {
  nodes.push({
    name: p.name,
    ...(p.at.some((v) => v !== 0) ? { translation: p.at } : {}),
    extras: {
      realvirtual: {
        NodeId: stableId(p.name),
        AssetReference: {
          assetId: catalogId(p.file),
          path: `/library/PaintLine/${p.file}`,
        },
        PlacementMeta: {},
        // Declared IN THE FILE on purpose. Behaviors (`src/behaviors/*.ts`) are
        // dispatched per placement by `dispatchPlacedObjectsIn`, which finds
        // placements via `isLayoutObjectRoot` — i.e. `realvirtual.LayoutObject`
        // (`src/core/behaviors.ts:352`). At runtime that marker is stamped by
        // the planner's `adoptPlacements`, but that hand-off does not fire on
        // the `?scene=published:<name>` route, so a published scene's
        // placements stay invisible to behavior dispatch and the line never
        // moves. (rv-ODT components such as `Drive-Lin-Y` are unaffected — the
        // loader wires those from names/extras over the composed tree.)
        // Authoring the marker is exactly what adoption would write, and
        // `adoptPlacedNode` re-stamps it unconditionally, so a later adoption
        // stays idempotent. See EP-DEMO-001 Surprises & Discoveries #6.
        LayoutObject: { Label: p.name, CatalogId: catalogId(p.file), Locked: false },
        ...(p.config ?? {}),
      },
    },
  });
}

const gltf = {
  asset: { version: '2.0', generator: 'XYvirtual paint-line scene generator (EP-DEMO-001)' },
  scene: 0,
  scenes: [{
    name: 'DemoPaintLine',
    nodes: [0],
    extras: {
      realvirtual: {
        // Empty on purpose — see the module docstring. Placements resolve
        // through their own AssetReference paths.
        SceneSettings: { catalogUrls: [], gridSizeMm: 500 },
        Classification: { v: 1, level: 'scene' },
      },
    },
  }],
  nodes,
};

// ─── GLB packing (JSON chunk + EMPTY BIN chunk, as GLTFExporter emits) ──────

const json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(0, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

mkdirSync(SCENES_DIR, { recursive: true });
const glb = Buffer.concat([header, jsonHeader, jsonChunk, binHeader]);
writeFileSync(join(SCENES_DIR, SCENE_FILE), glb);

// ─── Register in the curated scene index (idempotent) ───────────────────────

const indexPath = join(SCENES_DIR, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const entry = { file: SCENE_FILE, name: 'Paint Line Demo', level: 'scene' };
const at = index.findIndex((e) => e.file === SCENE_FILE);
if (at >= 0) index[at] = entry; else index.push(entry);
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(`${SCENE_FILE}  (${glb.length} bytes)  ${PLACEMENTS.length} placements`);
for (const p of PLACEMENTS) {
  const where = p.span ? `z ${p.span[0]}–${p.span[1]} m` : 'origin, untransformed';
  console.log(`  ${p.name.padEnd(28)} @ [${p.at.join(', ')}]  ${where}`);
}
console.log(`registered in scenes/index.json as "${entry.name}"`);
