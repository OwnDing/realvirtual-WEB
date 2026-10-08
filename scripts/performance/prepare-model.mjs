// SPDX-License-Identifier: AGPL-3.0-only
// Local, deterministic derived assets. Never changes the source GLB.
import { readFile, mkdir, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import sharp from 'sharp';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MAX_SOURCE = 512 * 1024 * 1024;
function parseGlb(bytes) {
  if (
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw Error('Expected a complete GLB 2.0');
  let json, bin;
  for (let p = 12; p + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(p),
      type = bytes.readUInt32LE(p + 4);
    p += 8;
    if (size % 4 || p + size > bytes.length) throw Error('Invalid GLB chunk');
    if (type === 0x4e4f534a) json = JSON.parse(bytes.subarray(p, p + size).toString('utf8'));
    if (type === 0x004e4942) bin = bytes.subarray(p, p + size);
    p += size;
  }
  if (!json || !bin || json.buffers?.some((b) => b.uri) || json.images?.some((i) => i.uri))
    throw Error('Only self-contained GLB resources are supported');
  return { json, bin };
}
function accessor(json, bin, index, width) {
  const a = json.accessors?.[index],
    v = json.bufferViews?.[a?.bufferView];
  const format = {
    5120: [1, 'getInt8'],
    5121: [1, 'getUint8'],
    5122: [2, 'getInt16'],
    5123: [2, 'getUint16'],
    5125: [4, 'getUint32'],
    5126: [4, 'getFloat32'],
  }[a?.componentType];
  const types = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  if (
    !a ||
    !v ||
    !format ||
    a.sparse ||
    v.extensions ||
    types[a.type] !== width ||
    v.buffer !== 0 ||
    !Number.isSafeInteger(a.count) ||
    a.count <= 0 ||
    a.count > 20_000_000
  )
    throw Error('Unsupported accessor');
  const stride = v.byteStride ?? width * format[0],
    offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (
    stride < width * format[0] ||
    offset < 0 ||
    offset + (a.count - 1) * stride + width * format[0] > bin.length
  )
    throw Error('Invalid accessor range');
  if (width === 1 && (![5121, 5123, 5125].includes(a.componentType) || a.normalized))
    throw Error('Invalid index accessor');
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength),
    out = width === 1 ? new Uint32Array(a.count) : new Float32Array(a.count * width);
  for (let i = 0; i < a.count; i++)
    for (let c = 0; c < width; c++) {
      let value = view[format[1]](offset + i * stride + c * format[0], true);
      if (a.normalized)
        value =
          a.componentType === 5120
            ? Math.max(-1, value / 127)
            : a.componentType === 5122
              ? Math.max(-1, value / 32767)
              : value / (a.componentType === 5121 ? 255 : 65535);
      if (!Number.isFinite(value)) throw Error('Non-finite vertex');
      out[i * width + c] = value;
    }
  return out;
}
function pack(positions, uv, indices) {
  const map = new Map(),
    compact = [],
    tex = [],
    ids = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const old = indices[i];
    if (old >= positions.length / 3) throw Error('Invalid index');
    if (!map.has(old)) {
      map.set(old, map.size);
      compact.push(...positions.subarray(old * 3, old * 3 + 3));
      if (uv) tex.push(...uv.subarray(old * 2, old * 2 + 2));
    }
    ids[i] = map.get(old);
  }
  const header = Buffer.alloc(16);
  header.write('RVLP');
  header.writeUInt32LE(map.size, 4);
  header.writeUInt32LE(ids.length, 8);
  header.writeUInt32LE(uv ? 1 : 0, 12);
  return Buffer.concat([
    header,
    Buffer.from(new Float32Array(compact).buffer),
    Buffer.from(new Float32Array(tex).buffer),
    Buffer.from(ids.buffer),
  ]);
}
export async function prepareModel(input, output = `${input}.perf.json`) {
  const sourcePath = resolve(input),
    manifestPath = resolve(output);
  if (sourcePath === manifestPath) throw Error('Output must differ from source');
  if ((await stat(sourcePath)).size > MAX_SOURCE) throw Error('Source exceeds 512 MiB');
  const bytes = await readFile(sourcePath);
  if (bytes.length > MAX_SOURCE) throw Error('Source exceeds 512 MiB');
  const { json, bin } = parseGlb(bytes);
  await MeshoptSimplifier.ready;
  const sourceHash = hash(bytes),
    directory = `rv-performance/${sourceHash}`;
  await mkdir(resolve(dirname(manifestPath), directory), { recursive: true });
  const resource = async (name, data) => {
    if (data.length > 32 * 1024 * 1024) throw Error('Derived resource exceeds 32 MiB');
    const sha256 = hash(data),
      uri = `${directory}/${name}-${sha256.slice(0, 16)}`;
    await writeFile(resolve(dirname(manifestPath), uri), data);
    return { uri, byteLength: data.length, sha256 };
  };
  const sourceIndexCount = (json.nodes ?? []).reduce(
    (sum, node) =>
      sum +
      (json.meshes?.[node.mesh]?.primitives ?? []).reduce(
        (n, p) =>
          n +
          (json.accessors?.[p.indices]?.count ??
            json.accessors?.[p.attributes.POSITION]?.count ??
            0),
        0,
      ),
    0,
  );
  const overviewRatio = Math.min(0.12, 180000 / Math.max(1, sourceIndexCount));
  const parts = [],
    skipped = [],
    bounds = new Box3(),
    textureCache = new Map();
  const active = new Set(),
    visited = new Set();
  const dynamicKeys =
    /^(Source|Sink|MU|TransportSurface|MachiningVolume|Cam|Lamp|SceneButton|WebVisibility)/;
  const walk = async (nodeIndex, parentMatrix, dynamic = false) => {
    if (active.has(nodeIndex)) throw Error('Cyclic node graph');
    if (visited.has(nodeIndex)) throw Error('Node has multiple parents');
    visited.add(nodeIndex);
    const node = json.nodes?.[nodeIndex];
    if (!node) throw Error('Invalid node');
    if (node.extras?.realvirtual?.AssetReference)
      throw Error(
        'Referenced scenes require ordinary GLB loading; a partial overview is not published',
      );
    active.add(nodeIndex);
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3().fromArray(node.translation ?? [0, 0, 0]),
          new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
          new Vector3().fromArray(node.scale ?? [1, 1, 1]),
        );
    const world = new Matrix4().multiplyMatrices(parentMatrix, local);
    if (!world.elements.every(Number.isFinite)) throw Error('Invalid transform');
    dynamic ||= Object.keys(node.extras?.realvirtual ?? {}).some((k) => dynamicKeys.test(k));
    const primitives = json.meshes?.[node.mesh]?.primitives ?? [];
    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
      const primitive = primitives[primitiveIndex];
      try {
        if (parts.length >= 4096) throw Error('Part limit');
        if (
          (primitive.mode ?? 4) !== 4 ||
          primitive.extensions ||
          node.skin !== undefined ||
          primitive.targets
        )
          throw Error(
            'Compressed, skinned, morphed or non-triangle primitive: retains original path',
          );
        const position = accessor(json, bin, primitive.attributes.POSITION, 3);
        const uv =
          primitive.attributes.TEXCOORD_0 === undefined
            ? null
            : accessor(json, bin, primitive.attributes.TEXCOORD_0, 2);
        if (uv && uv.length / 2 !== position.length / 3) throw Error('Mismatched UV accessor');
        const index =
          primitive.indices === undefined
            ? Uint32Array.from({ length: position.length / 3 }, (_, i) => i)
            : Uint32Array.from(accessor(json, bin, primitive.indices, 1));
        if (!index.length || index.length % 3) throw Error('Invalid triangles');
        const box = new Box3().setFromArray(position);
        bounds.union(box.clone().applyMatrix4(world));
        const material = json.materials?.[primitive.material] ?? {},
          pbr = material.pbrMetallicRoughness ?? {};
        const color = pbr.baseColorFactor ?? [1, 1, 1, 1];
        const levels = [];
        for (let level = 0; level < 2; level++) {
          const target = Math.max(
            3,
            Math.floor((index.length * (level === 0 ? overviewRatio : 0.45)) / 3) * 3,
          );
          const simplified = dynamic
            ? index
            : MeshoptSimplifier.simplify(index, position, 3, target, level === 0 ? 0.025 : 0.005, [
                'LockBorder',
              ])[0];
          const geometry = await resource(
            `n${nodeIndex}p${primitiveIndex}l${level}.bin`,
            pack(position, uv, simplified),
          );
          let texture;
          const textureIndex = pbr.baseColorTexture?.index,
            image = json.images?.[json.textures?.[textureIndex]?.source];
          if (
            uv &&
            image?.bufferView !== undefined &&
            !pbr.baseColorTexture.extensions &&
            (pbr.baseColorTexture.texCoord ?? 0) === 0
          ) {
            const key = `${textureIndex}:${level}`;
            if (!textureCache.has(key)) {
              const v = json.bufferViews[image.bufferView];
              if (v.buffer !== 0 || v.byteOffset < 0 || v.byteOffset + v.byteLength > bin.length)
                throw Error('Invalid texture range');
              const output = await sharp(
                bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength),
                { limitInputPixels: 64 * 1024 * 1024 },
              )
                .resize({
                  width: level === 0 ? 128 : 512,
                  height: level === 0 ? 128 : 512,
                  fit: 'inside',
                  withoutEnlargement: true,
                })
                .png()
                .toBuffer();
              textureCache.set(key, await resource(`t${textureIndex}l${level}.png`, output));
            }
            texture = textureCache.get(key);
          }
          levels.push({
            ...geometry,
            triangles: simplified.length / 3,
            ...(texture ? { texture } : {}),
          });
        }
        parts.push({
          nodeIndex,
          primitiveIndex,
          matrix: world.toArray(),
          bounds: [...box.min.toArray(), ...box.max.toArray()],
          color,
          levels,
          runtimeLod: !dynamic && !json.animations?.length,
        });
        if (dynamic)
          skipped.push({
            nodeIndex,
            primitiveIndex,
            reason: 'Dynamic geometry retained at original precision',
          });
      } catch (error) {
        // Never publish an apparently complete overview with missing geometry.
        throw Error(
          `Node ${nodeIndex}, primitive ${primitiveIndex}: ${error.message}; use ordinary GLB loading`,
        );
      }
    }
    for (const child of node.children ?? []) await walk(child, world, dynamic);
    active.delete(nodeIndex);
  };
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) await walk(root, new Matrix4());
  if (!parts.length || bounds.isEmpty())
    throw Error('No supported visual primitives; use ordinary GLB loading');
  const previewBytes = parts.reduce(
    (sum, p) => sum + p.levels[0].byteLength + (p.levels[0].texture?.byteLength ?? 0),
    0,
  );
  if (previewBytes > 32 * 1024 * 1024)
    throw Error('Overview exceeds 32 MiB; use ordinary GLB loading');
  const manifest = {
    schemaVersion: 1,
    source: { byteLength: bytes.length, sha256: sourceHash },
    bounds: [...bounds.min.toArray(), ...bounds.max.toArray()],
    parts,
  };
  const report = {
    sourceBytes: bytes.length,
    parts: parts.length,
    previewBytes,
    previewBudgetBytes: 3 * 1024 * 1024,
    withinPreviewBudget: previewBytes <= 3 * 1024 * 1024,
    sourceTriangles: json.meshes?.reduce(
      (sum, m) =>
        sum +
        m.primitives.reduce(
          (s, p) =>
            s +
            (json.accessors?.[p.indices]?.count ??
              json.accessors?.[p.attributes.POSITION]?.count ??
              0) /
              3,
          0,
        ),
      0,
    ),
    skipped,
  };
  const encoded = JSON.stringify(manifest);
  if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) throw Error('Manifest exceeds 4 MiB');
  await writeFile(`${manifestPath}.tmp`, encoded);
  await rename(`${manifestPath}.tmp`, manifestPath);
  await writeFile(`${manifestPath}.report.json`, JSON.stringify(report, null, 2) + '\n');
  return { manifest, report };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) {
    console.error(
      'Usage: node scripts/performance/prepare-model.mjs model.glb [model.glb.perf.json]',
    );
    process.exitCode = 2;
  } else
    prepareModel(process.argv[2], process.argv[3])
      .then(({ report }) => console.log(JSON.stringify(report, null, 2)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
