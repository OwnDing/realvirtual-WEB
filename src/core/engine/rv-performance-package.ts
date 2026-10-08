// SPDX-License-Identifier: AGPL-3.0-only
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import { sha256 } from '@noble/hashes/sha2.js';
export interface PerformanceResource {
  uri: string;
  byteLength: number;
  sha256: string;
}
export interface PerformanceLevel extends PerformanceResource {
  triangles: number;
  texture?: PerformanceResource;
}
export interface PerformancePart {
  nodeIndex: number;
  primitiveIndex: number;
  matrix: number[];
  bounds: number[];
  color: number[];
  levels: PerformanceLevel[];
  runtimeLod: boolean;
}
export interface PerformancePackage {
  schemaVersion: 1;
  source: { byteLength: number; sha256: string };
  bounds: number[];
  parts: PerformancePart[];
}
export const PERFORMANCE_LIMITS = {
  manifest: 4 * 1024 * 1024,
  resource: 32 * 1024 * 1024,
  resident: 64 * 1024 * 1024,
  parts: 4096,
} as const;
const vector = (v: unknown, n: number, limit = 1e12): v is number[] =>
  Array.isArray(v) &&
  v.length === n &&
  v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= limit);
const integer = (v: unknown, max: number) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function resource(v: unknown): v is PerformanceResource {
  return (
    object(v) &&
    typeof v.uri === 'string' &&
    v.uri.length < 1024 &&
    /^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(v.uri) &&
    !v.uri.startsWith('/') &&
    !v.uri.split('/').some((p) => !p || p === '.' || p === '..') &&
    integer(v.byteLength, PERFORMANCE_LIMITS.resource) &&
    Number(v.byteLength) > 0 &&
    digest(v.sha256)
  );
}
const bounds = (v: unknown): v is number[] =>
  vector(v, 6) && v[0] <= v[3] && v[1] <= v[4] && v[2] <= v[5];
export function parsePerformancePackage(input: unknown): PerformancePackage {
  if (
    !object(input) ||
    input.schemaVersion !== 1 ||
    !object(input.source) ||
    !integer(input.source.byteLength, 512 * 1024 * 1024) ||
    Number(input.source.byteLength) < 1 ||
    !digest(input.source.sha256) ||
    !bounds(input.bounds) ||
    !Array.isArray(input.parts) ||
    !input.parts.length ||
    input.parts.length > PERFORMANCE_LIMITS.parts
  )
    throw new Error('PERF_MANIFEST_INVALID');
  const ids = new Set<string>();
  let baseline = 0;
  for (const part of input.parts) {
    if (
      !object(part) ||
      !integer(part.nodeIndex, 1_000_000) ||
      !integer(part.primitiveIndex, 100_000) ||
      !vector(part.matrix, 16) ||
      !bounds(part.bounds) ||
      !vector(part.color, 4, 1) ||
      part.color.some((v) => v < 0) ||
      typeof part.runtimeLod !== 'boolean' ||
      !Array.isArray(part.levels) ||
      part.levels.length !== 2
    )
      throw new Error('PERF_PART_INVALID');
    const id = `${part.nodeIndex}:${part.primitiveIndex}`;
    if (ids.has(id)) throw new Error('PERF_DUPLICATE_PART');
    ids.add(id);
    for (const level of part.levels) {
      if (
        !resource(level) ||
        !object(level) ||
        !integer(level.triangles, 10_000_000) ||
        Number(level.triangles) < 1 ||
        (level.texture !== undefined && !resource(level.texture))
      )
        throw new Error('PERF_RESOURCE_INVALID');
    }
    baseline += part.levels[0].byteLength + (part.levels[0].texture?.byteLength ?? 0);
  }
  if (baseline > PERFORMANCE_LIMITS.resident / 2) throw new Error('PERF_BASELINE_BUDGET');
  return input as unknown as PerformancePackage;
}
export function performanceResourceUrl(manifestUrl: string, uri: string): string {
  if (!resource({ uri, byteLength: 1, sha256: '0'.repeat(64) }))
    throw new Error('PERF_RESOURCE_URL');
  const base = new URL('.', manifestUrl),
    resolved = new URL(uri, base);
  if (
    resolved.origin !== base.origin ||
    !resolved.pathname.startsWith(base.pathname) ||
    resolved.search ||
    resolved.hash
  )
    throw new Error('PERF_RESOURCE_URL');
  return resolved.href;
}
export function verifyPerformanceBytes(
  data: ArrayBuffer,
  expected: { byteLength: number; sha256: string },
): void {
  if (data.byteLength !== expected.byteLength) throw new Error('PERF_RESOURCE_SIZE');
  const actual = Array.from(sha256(new Uint8Array(data)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  if (actual !== expected.sha256) throw new Error('PERF_RESOURCE_HASH');
}
/** Bound decoded image allocation before handing untrusted PNG bytes to the browser. */
export function validatePerformanceTexture(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 33) throw new Error('PERF_TEXTURE_HEADER');
  const view = new DataView(bytes);
  if (
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452
  )
    throw new Error('PERF_TEXTURE_HEADER');
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 512 || height > 512) throw new Error('PERF_TEXTURE_DIMENSIONS');
}
/** Small non-executable vertex format; never passed through the component/GLTF loader. */
export function decodePerformanceGeometry(bytes: ArrayBuffer): BufferGeometry {
  if (bytes.byteLength < 16 || bytes.byteLength > PERFORMANCE_LIMITS.resource)
    throw new Error('PERF_GEOMETRY_SIZE');
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x504c5652) throw new Error('PERF_GEOMETRY_MAGIC');
  const count = view.getUint32(4, true),
    indices = view.getUint32(8, true),
    uv = view.getUint32(12, true);
  if (
    !count ||
    !indices ||
    indices % 3 ||
    uv > 1 ||
    16 + count * (uv ? 20 : 12) + indices * 4 !== bytes.byteLength
  )
    throw new Error('PERF_GEOMETRY_LAYOUT');
  const position = new Float32Array(bytes, 16, count * 3),
    offset = 16 + count * 12;
  const index = new Uint32Array(bytes, offset + count * (uv ? 8 : 0), indices);
  if (!position.every(Number.isFinite) || !index.every((i) => i < count))
    throw new Error('PERF_GEOMETRY_VALUES');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  if (uv) {
    const texcoords = new Float32Array(bytes, offset, count * 2);
    if (!texcoords.every(Number.isFinite)) throw new Error('PERF_GEOMETRY_VALUES');
    geometry.setAttribute('uv', new Float32BufferAttribute(texcoords, 2));
  }
  geometry.setIndex(new Uint32BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
