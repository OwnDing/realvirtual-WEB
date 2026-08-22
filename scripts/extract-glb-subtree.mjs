// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * extract-glb-subtree.mjs — lift one named node subtree out of a GLB into a
 * standalone single-root GLB (EP-DEMO-003, M1).
 *
 * Written to move the `FanucCRX-10iA_L` arm out of the shipped
 * `public/models/DemoRobotIK.glb` (which also holds an ABB IRB2400 and a Schunk
 * gripper) so the paint line can stand a real CAD robot in its booth instead of
 * a box-and-cylinder stand-in. Kept generic because "take this subtree out of
 * that GLB" is the same job every time.
 *
 * What it does NOT do, on purpose:
 *   - it never rewrites vertex data. Accessors, bufferViews and their bytes are
 *     copied VERBATIM and only re-indexed, so no attribute is reinterpreted,
 *     re-quantised or dropped. That is the whole reason this is low-risk: a
 *     mesh either comes across byte-identical or not at all.
 *   - it does not simplify or weld anything.
 *
 * It DOES compact: only the accessors/bufferViews/materials/textures/images the
 * kept meshes actually reference are carried over, and the output BIN holds
 * just those byte ranges. Excluding a subtree therefore really removes its
 * geometry rather than leaving it unreferenced in the buffer.
 *
 * `rv_extras` ride along untouched, with one exception: a `RobotIK.Axis`
 * reference path is rooted at the SOURCE root name, so every path is re-rooted
 * onto the extracted root or the joints would resolve to nothing and the robot
 * would load with `axes=0` — visible only as an arm that never moves.
 *
 * Deterministic: output depends only on the input and the arguments.
 *
 *   node scripts/extract-glb-subtree.mjs \
 *     --in public/models/DemoRobotIK.glb --root FanucCRX-10iA_L \
 *     --exclude SchunkEGH80Gripper --out public/library/PaintLine/PaintRobot.glb \
 *     [--rename PaintRobot]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ─── GLB container ──────────────────────────────────────────────────────────

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${path}: first chunk is not JSON`);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binHeaderAt = 20 + jsonLen;
  let bin = Buffer.alloc(0);
  if (binHeaderAt + 8 <= buf.length && buf.readUInt32LE(binHeaderAt + 4) === 0x004e4942) {
    const binLen = buf.readUInt32LE(binHeaderAt);
    bin = buf.subarray(binHeaderAt + 8, binHeaderAt + 8 + binLen);
  }
  return { json, bin };
}

function writeGlb(path, json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0x00)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

// ─── Extraction ─────────────────────────────────────────────────────────────

/** Indices of `start` and everything under it. */
function collectSubtree(nodes, start, into = new Set()) {
  into.add(start);
  for (const child of nodes[start].children ?? []) collectSubtree(nodes, child, into);
  return into;
}

function findNodeIndex(nodes, name) {
  const i = nodes.findIndex((n) => n.name === name);
  if (i < 0) throw new Error(`node '${name}' not found`);
  return i;
}

/**
 * Re-root `RobotIK.Axis` paths.
 *
 * Source paths start at the source root (`FanucCRX-10iA_L/A1/...`). After
 * extraction the root may be renamed, and in any case the path must start at
 * the NEW root or `resolveAxisDrivesFromNode` finds nothing.
 */
function reRootExtras(extras, oldRoot, newRoot) {
  const rv = extras?.realvirtual;
  const axes = rv?.RobotIK?.Axis;
  if (!Array.isArray(axes)) return extras;
  for (const ref of axes) {
    if (typeof ref?.path !== 'string') continue;
    if (ref.path === oldRoot) ref.path = newRoot;
    else if (ref.path.startsWith(`${oldRoot}/`)) ref.path = `${newRoot}/${ref.path.slice(oldRoot.length + 1)}`;
  }
  return extras;
}

export function extractSubtree({ inPath, rootName, exclude = [], outPath, rename }) {
  const { json: src, bin: srcBin } = readGlb(inPath);
  const nodes = src.nodes ?? [];

  const rootIndex = findNodeIndex(nodes, rootName);
  const keep = collectSubtree(nodes, rootIndex);
  for (const name of exclude) {
    for (const i of collectSubtree(nodes, findNodeIndex(nodes, name))) keep.delete(i);
  }

  // Stable order: source node order, so two runs agree.
  const keptNodes = [...keep].sort((a, b) => a - b);
  const nodeMap = new Map(keptNodes.map((src2, i) => [src2, i]));

  // ── Referenced meshes → accessors → bufferViews, and materials → textures ──
  const meshMap = new Map();
  const accessorMap = new Map();
  const viewMap = new Map();
  const materialMap = new Map();
  const textureMap = new Map();
  const imageMap = new Map();
  const samplerMap = new Map();

  const outViews = [];
  const outBinParts = [];
  let binOffset = 0;

  function takeView(i) {
    if (viewMap.has(i)) return viewMap.get(i);
    const v = src.bufferViews[i];
    const start = v.byteOffset ?? 0;
    const bytes = srcBin.subarray(start, start + v.byteLength);
    // 4-byte align every view so accessors keep their alignment guarantees.
    const pad = (4 - (binOffset % 4)) % 4;
    if (pad) { outBinParts.push(Buffer.alloc(pad, 0)); binOffset += pad; }
    const out = { buffer: 0, byteOffset: binOffset, byteLength: v.byteLength };
    if (v.byteStride !== undefined) out.byteStride = v.byteStride;
    if (v.target !== undefined) out.target = v.target;
    outBinParts.push(bytes);
    binOffset += v.byteLength;
    const idx = outViews.push(out) - 1;
    viewMap.set(i, idx);
    return idx;
  }

  const outAccessors = [];
  function takeAccessor(i) {
    if (accessorMap.has(i)) return accessorMap.get(i);
    const a = { ...src.accessors[i] };
    if (a.bufferView !== undefined) a.bufferView = takeView(a.bufferView);
    if (a.sparse) throw new Error(`accessor ${i} is sparse — not supported`);
    const idx = outAccessors.push(a) - 1;
    accessorMap.set(i, idx);
    return idx;
  }

  const outImages = [];
  function takeImage(i) {
    if (imageMap.has(i)) return imageMap.get(i);
    const im = { ...src.images[i] };
    if (im.bufferView !== undefined) im.bufferView = takeView(im.bufferView);
    const idx = outImages.push(im) - 1;
    imageMap.set(i, idx);
    return idx;
  }

  const outSamplers = [];
  function takeSampler(i) {
    if (samplerMap.has(i)) return samplerMap.get(i);
    const idx = outSamplers.push({ ...src.samplers[i] }) - 1;
    samplerMap.set(i, idx);
    return idx;
  }

  const outTextures = [];
  function takeTexture(i) {
    if (textureMap.has(i)) return textureMap.get(i);
    const t = { ...src.textures[i] };
    if (t.source !== undefined) t.source = takeImage(t.source);
    if (t.sampler !== undefined) t.sampler = takeSampler(t.sampler);
    const idx = outTextures.push(t) - 1;
    textureMap.set(i, idx);
    return idx;
  }

  /** Rewrite every `{ index }` texture slot inside a material, at any depth. */
  function remapTextureSlots(value) {
    if (Array.isArray(value)) return value.map(remapTextureSlots);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = (k.endsWith('Texture') || k === 'texture') && v && typeof v === 'object' && typeof v.index === 'number'
          ? { ...v, index: takeTexture(v.index) }
          : remapTextureSlots(v);
      }
      return out;
    }
    return value;
  }

  const outMaterials = [];
  function takeMaterial(i) {
    if (materialMap.has(i)) return materialMap.get(i);
    const idx = outMaterials.push(remapTextureSlots(src.materials[i])) - 1;
    materialMap.set(i, idx);
    return idx;
  }

  const outMeshes = [];
  function takeMesh(i) {
    if (meshMap.has(i)) return meshMap.get(i);
    const m = src.meshes[i];
    const prims = m.primitives.map((p) => {
      const out = { ...p, attributes: {} };
      for (const [k, a] of Object.entries(p.attributes)) out.attributes[k] = takeAccessor(a);
      if (p.indices !== undefined) out.indices = takeAccessor(p.indices);
      if (p.material !== undefined) out.material = takeMaterial(p.material);
      if (p.targets) throw new Error(`mesh ${i} has morph targets — not supported`);
      return out;
    });
    const idx = outMeshes.push({ ...m, primitives: prims }) - 1;
    meshMap.set(i, idx);
    return idx;
  }

  // ── Rebuild the node list ──
  const newRootName = rename ?? rootName;
  /**
   * The donor scene's placement, lifted off the root and reported to the caller.
   *
   * A subtree's root translation says where the object STOOD in the file it came
   * from, not how the object is built. Carrying it across made `PaintRobot` a
   * node 2.149 m away from the robot it names: the arm's own lateral reach is
   * 0.242 m, but base-to-TCP measured 3.68 m, so every placement had to
   * pre-subtract the offset by hand and the base yaw swung the arm around an
   * empty point in the air. Rotation is KEPT — the joint chain nests along local
   * +Z, so the root rotation is the Z-up-to-Y-up convention and is part of the
   * asset.
   */
  let liftedTranslation = null;
  const outNodes = keptNodes.map((si) => {
    const n = { ...nodes[si] };
    if (si === rootIndex && rename) n.name = rename;
    if (si === rootIndex) {
      if (n.matrix) {
        throw new Error(
          `root '${rootName}' uses a matrix transform — cannot lift the donor `
          + 'placement off it without decomposing; convert the source to TRS',
        );
      }
      if (n.translation && n.translation.some((v) => v !== 0)) {
        liftedTranslation = n.translation;
        delete n.translation;
      }
    }
    n.children = (n.children ?? []).filter((c) => nodeMap.has(c)).map((c) => nodeMap.get(c));
    if (!n.children.length) delete n.children;
    if (n.mesh !== undefined) n.mesh = takeMesh(n.mesh);
    if (n.skin !== undefined) throw new Error(`node '${n.name}' is skinned — not supported`);
    if (n.camera !== undefined) delete n.camera;
    if (n.extras) n.extras = reRootExtras(structuredClone(n.extras), rootName, newRootName);
    return n;
  });

  const bin = Buffer.concat(outBinParts);
  const out = {
    asset: {
      version: '2.0',
      generator: 'XYvirtual GLB subtree extractor (EP-DEMO-003)',
      // Provenance: this geometry is not authored here.
      extras: {
        extractedFrom: `${inPath}#${rootName}`,
        ...(liftedTranslation ? { liftedDonorTranslation: liftedTranslation } : {}),
      },
    },
    scene: 0,
    scenes: [{ name: newRootName, nodes: [nodeMap.get(rootIndex)] }],
    nodes: outNodes,
  };
  if (outMeshes.length) out.meshes = outMeshes;
  if (outMaterials.length) out.materials = outMaterials;
  if (outTextures.length) out.textures = outTextures;
  if (outImages.length) out.images = outImages;
  if (outSamplers.length) out.samplers = outSamplers;
  if (outAccessors.length) out.accessors = outAccessors;
  if (outViews.length) out.bufferViews = outViews;
  if (bin.length) out.buffers = [{ byteLength: bin.length }];

  writeGlb(outPath, out, bin);
  return {
    nodes: outNodes.length,
    meshes: outMeshes.length,
    materials: outMaterials.length,
    bytes: bin.length,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
  const stats = extractSubtree({
    inPath: args.get('in'),
    rootName: args.get('root'),
    exclude: (args.get('exclude') ?? '').split(',').filter(Boolean),
    outPath: args.get('out'),
    rename: args.get('rename'),
  });
  console.log(
    `${args.get('out')}  ${stats.nodes} nodes, ${stats.meshes} meshes, `
    + `${stats.materials} materials, ${(stats.bytes / 1048576).toFixed(2)} MB geometry`,
  );
}
