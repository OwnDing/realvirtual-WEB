// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createPerformanceFixture } from '../scripts/performance/fixture.mjs';
import { prepareModel } from '../scripts/performance/prepare-model.mjs';
import {
  parsePerformancePackage,
  decodePerformanceGeometry,
  verifyPerformanceBytes,
} from '../src/core/engine/rv-performance-package';
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry } from 'three';
import { RuntimeLod } from '../src/core/engine/rv-runtime-lod';
import type { PerformanceAssets } from '../src/core/engine/rv-performance-assets';
describe('prepared model integration', () => {
  it('reduces real geometry, preserves input bytes, stable identity and deterministic output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rv-performance-')),
      source = join(dir, '大型模型 source.glb');
    await createPerformanceFixture(source, 2, 64);
    const original = await readFile(source);
    const { manifest, report } = await prepareModel(source);
    expect(await readFile(source)).toEqual(original);
    expect(parsePerformancePackage(manifest)).toEqual(manifest);
    expect(report.skipped).toEqual([]);
    expect(report.withinPreviewBudget).toBe(true);
    const again = await prepareModel(source);
    expect(again.manifest).toEqual(manifest);
    const level = manifest.parts[0].levels[0],
      file = await readFile(join(dirname(source), level.uri));
    const bytes = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    verifyPerformanceBytes(bytes, level);
    const geometry = decodePerformanceGeometry(bytes);
    expect(geometry.index!.count / 3).toBe(level.triangles);
    expect(level.triangles).toBeLessThan(64 * 31 * 2);
    expect(geometry.getAttribute('uv')).toBeDefined();
    geometry.dispose();
    expect(manifest.parts.map((p) => p.nodeIndex)).toEqual([0, 1]);
    expect(manifest.parts[0].levels[0].texture).toBeDefined();
    expect(report.previewBytes).toBeLessThan(report.sourceBytes * 0.2);
    expect(() =>
      parsePerformancePackage({ ...manifest, source: { ...manifest.source, byteLength: 0 } }),
    ).toThrow();
    expect(() =>
      parsePerformancePackage({ ...manifest, parts: [manifest.parts[0], manifest.parts[0]] }),
    ).toThrow('DUPLICATE');
  });
  it('refuses an incomplete overview instead of silently dropping an unsupported primitive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rv-performance-invalid-')),
      source = join(dir, 'source.glb');
    await createPerformanceFixture(source, 2, 32);
    const original = await readFile(source),
      jsonLength = original.readUInt32LE(12);
    const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
    json.meshes[1].primitives[0].mode = 1;
    const raw = Buffer.from(JSON.stringify(json)),
      encoded = Buffer.alloc((raw.length + 3) & ~3, 32);
    raw.copy(encoded);
    const header = Buffer.from(original.subarray(0, 20)),
      binary = original.subarray(20 + jsonLength);
    header.writeUInt32LE(20 + encoded.length + binary.length, 8);
    header.writeUInt32LE(encoded.length, 12);
    await writeFile(source, Buffer.concat([header, encoded, binary]));
    await expect(prepareModel(source)).rejects.toThrow('Node 1, primitive 0');
    await expect(readFile(`${source}.perf.json`)).rejects.toThrow();
  });
  it('LOD preserves canonical geometry, visibility, material and transforms; restores on disposal', () => {
    const root = new Group(),
      geometry = new SphereGeometry(1, 64, 32),
      material = new MeshStandardMaterial(),
      mesh = new Mesh(geometry, material);
    root.add(mesh);
    const originalLayer = mesh.layers.mask;
    const low = new SphereGeometry(1, 8, 4),
      controller = new AbortController(),
      dispose = () => {
        controller.abort();
        low.dispose();
      };
    const assets = {
      manifest: { parts: [{ nodeIndex: 0, primitiveIndex: 0, runtimeLod: true }] },
      assets: new Map([[0, { geometry: low }]]),
      dispose,
      signal: controller.signal,
    } as unknown as PerformanceAssets;
    const lod = new RuntimeLod(root, new Map([[mesh, 0]]), assets),
      scene = new Scene();
    scene.add(root);
    lod.attach(scene);
    expect(lod.size).toBe(1);
    const camera = new PerspectiveCamera(45);
    camera.position.z = 100;
    lod.update(camera, 1);
    expect(mesh.layers.mask).toBe(0);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.visible).toBe(true);
    camera.position.z = 2;
    lod.update(camera, 1);
    expect(mesh.layers.mask).toBe(originalLayer);
    camera.position.z = 100;
    mesh.visible = false;
    lod.update(camera, 1);
    expect(scene.children[1].children[0].visible).toBe(false);
    mesh.visible = true;
    root.position.x = 5;
    lod.update(camera, 1);
    expect(scene.children[1].children[0].matrixWorld.elements[12]).toBe(5);
    // Starting a subsequent download aborts derived assets while the old model is still visible.
    controller.abort();
    expect(lod.size).toBe(0);
    expect(scene.children.length).toBe(1);
    expect(mesh.layers.mask).toBe(originalLayer);
    expect(mesh.userData._rvLodSource).toBeUndefined();
    lod.dispose();
    geometry.dispose();
    material.dispose();
  });
});
