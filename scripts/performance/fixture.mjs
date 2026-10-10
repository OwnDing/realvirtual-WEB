// SPDX-License-Identifier: AGPL-3.0-only
// Reproducible public synthetic fixture: curved meshes, stable IDs and embedded texture.
import { SphereGeometry } from 'three';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function createPerformanceFixture(path, count = 4, segments = 96) {
  const bin = [],
    bufferViews = [],
    accessors = [],
    nodes = [],
    meshes = [];
  let size = 0;
  const append = (bytes) => {
    const index = bufferViews.length;
    const data = Buffer.from(bytes);
    bufferViews.push({ buffer: 0, byteOffset: size, byteLength: data.length });
    bin.push(data);
    size += data.length;
    const pad = (4 - (size % 4)) % 4;
    if (pad) {
      bin.push(Buffer.alloc(pad));
      size += pad;
    }
    return index;
  };
  const addAccessor = (data, type, componentType, min, max) => {
    const i = accessors.length;
    accessors.push({
      bufferView: append(Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
      componentType,
      count: data.length / { SCALAR: 1, VEC2: 2, VEC3: 3 }[type],
      type,
      ...(min ? { min, max } : {}),
    });
    return i;
  };
  const texture = await sharp({
    create: { width: 32, height: 32, channels: 4, background: { r: 35, g: 153, b: 180, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const image = append(texture);
  for (let i = 0; i < count; i++) {
    const geo = new SphereGeometry(1 + i * 0.005, segments, Math.floor(segments / 2));
    geo.computeBoundingBox();
    const attributes = {
      POSITION: addAccessor(
        geo.attributes.position.array,
        'VEC3',
        5126,
        geo.boundingBox.min.toArray(),
        geo.boundingBox.max.toArray(),
      ),
      NORMAL: addAccessor(geo.attributes.normal.array, 'VEC3', 5126),
      TEXCOORD_0: addAccessor(geo.attributes.uv.array, 'VEC2', 5126),
    };
    const indices = addAccessor(new Uint32Array(geo.index.array), 'SCALAR', 5125);
    meshes.push({ primitives: [{ attributes, indices, material: 0 }] });
    nodes.push({
      name: `FixturePart${i}`,
      mesh: i,
      translation: [(i % 4) * 2.5, Math.floor(i / 4) * 2.5, 0],
      extras: {
        realvirtual: { NodeId: `fixture-part-${i}`, RuntimeMetadata: { Title: `Part ${i}` } },
      },
    });
    geo.dispose();
  }
  const json = {
    asset: { version: '2.0', generator: 'L2-3 synthetic fixture' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
    ],
    textures: [{ source: 0 }],
    images: [{ bufferView: image, mimeType: 'image/png' }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: size }],
  };
  const raw = Buffer.from(JSON.stringify(json)),
    text = Buffer.alloc((raw.length + 3) & ~3, 32);
  raw.copy(text);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + 8 + size, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(size, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, Buffer.concat([header, text, binaryHeader, ...bin]));
  return { nodes: count, triangles: count * segments * (Math.floor(segments / 2) - 1) * 2 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await createPerformanceFixture(
    process.argv[2],
    Number(process.argv[3] ?? 4),
    Number(process.argv[4] ?? 96),
  );
