// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0026: the built-in machining provider — worker protocol (in-process port)
 * and the real MachiningManager / MachiningVolume driving it end to end.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three';
import { BuiltinMachiningProvider, type CsgWorkerPort } from '../src/core/engine/machining-builtin/builtin-machining-provider';
import { CsgWorkerCore, degradeSubsteps, type CsgRequest, type CsgResponse } from '../src/core/engine/machining-builtin/csg-worker-core';
import {
  MACHINING_MAX_PENDING_JOBS, MACHINING_MAX_SEGMENTS_PER_JOB, MACHINING_TESSELLATE_BATCH, machiningRegistry,
  type MachiningChunkMeshBatch, type MachiningGridDesc, type MachiningSubtractAck, type MachiningToolSegment,
} from '../src/core/engine/rv-machining-registry';
import { MachiningManager, type MachiningSignalHost } from '../src/core/engine/rv-machining-manager';
import { RVMachiningVolume } from '../src/core/engine/rv-machining-volume';
import { RVMachiningTool } from '../src/core/engine/rv-machining-tool';
import { NodeRegistry } from '../src/core/engine/rv-node-registry';
import { applySchema, type ComponentContext } from '../src/core/engine/rv-component-registry';

/** In-process worker: async delivery both ways, structured-clone copies like a real Worker. */
function inProcessPort(options: { throwOn?: CsgRequest['type'] } = {}) {
  const port: CsgWorkerPort & { requests: CsgRequest[] } = {
    onmessage: null, onerror: null, requests: [],
    postMessage(message) {
      port.requests.push(message);
      const copy = structuredClone(message);
      setTimeout(() => {
        try {
          if (options.throwOn === copy.type) throw new Error('kernel trap');
          core.handle(copy);
        } catch (error) { reply({ type: 'fatal', message: String(error) }); }
      }, 0);
    },
    terminate() { port.onmessage = null; },
  };
  const reply = (msg: CsgResponse) => setTimeout(() => port.onmessage?.({ data: structuredClone(msg) }), 0);
  const core = new CsgWorkerCore((msg) => reply(msg), (fn) => { setTimeout(fn, 0); });
  setTimeout(() => reply({ type: 'ready' }), 0);
  return port;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function drain(turns = 200) { for (let i = 0; i < turns; i++) await tick(); }

const DESC: MachiningGridDesc = {
  resolution: { x: 48, y: 32, z: 40 }, sizeMm: { x: 100, y: 60, z: 80 }, shape: 'Box', cylinderAxis: 0, meshing: 'MarchingCubes', creaseAngleDeg: 35,
};
const I = { x: 0, y: 0, z: 0, w: 1 };
function sphereAt(origin: { x: number; y: number; z: number }, local: { x: number; y: number; z: number }, r = 8): MachiningToolSegment {
  const p = { x: local.x - origin.x, y: local.y - origin.y, z: local.z - origin.z };
  return { posStart: p, posEnd: p, rotStart: I, rotEnd: I, substeps: 1, radius: r, height: 0, cornerRadius: 0, coneRadiusTop: 0, shape: 0, boundingRadius: r };
}

afterEach(() => { machiningRegistry.clear(); });

describe('built-in machining provider — worker protocol', () => {
  it('builds the grid, streams the initial mesh in budgeted batches and ends with an idle ack', async () => {
    const provider = new BuiltinMachiningProvider(() => inProcessPort());
    await provider.init();
    expect(provider.ready).toBe(true);
    const grid = await provider.createGrid(DESC);
    expect(grid.chunkResolution).toEqual({ x: 3, y: 2, z: 3 });
    expect(grid.voxelSizeMm.x).toBeCloseTo(100 / 45, 12);
    expect(grid.gridOriginMm.y).toBeCloseTo(-30 - 1.5 * (60 / 29), 12);
    expect(grid.initialSolidVoxels).toBe(45 * 29 * 37);
    const batches: MachiningChunkMeshBatch[] = [];
    const acks: MachiningSubtractAck[] = [];
    provider.onChunkMeshes(grid, (b) => batches.push(b));
    provider.onAck(grid, (a) => acks.push(a));
    await drain();
    expect(batches.length).toBeGreaterThan(0);
    for (const b of batches) { expect(b.epoch).toBe(0); expect(b.chunks.length).toBeLessThanOrEqual(MACHINING_TESSELLATE_BATCH); }
    expect(new Set(batches.flatMap((b) => b.chunks.map((c) => c.chunkIndex))).size).toBe(grid.chunkCount); // every chunk holds box surface
    expect(acks.at(-1)).toEqual({ seq: -1, removedVoxels: 0, pendingJobs: 0, pendingChunks: 0 });
  });

  it('acknowledges cuts in order, bounds the backlog, and re-meshes only touched chunks', async () => {
    const provider = new BuiltinMachiningProvider(() => inProcessPort());
    await provider.init();
    const grid = await provider.createGrid(DESC);
    await drain();
    const acks: MachiningSubtractAck[] = [];
    const batches: MachiningChunkMeshBatch[] = [];
    provider.onAck(grid, (a) => acks.push(a));
    provider.onChunkMeshes(grid, (b) => batches.push(b));
    const results = Array.from({ length: MACHINING_MAX_PENDING_JOBS + 1 }, (_, i) =>
      provider.submitSubtract(grid, { segments: [sphereAt(grid.gridOriginMm, { x: -50 + i * 2, y: 30, z: 0 })] }));
    expect(results.slice(0, MACHINING_MAX_PENDING_JOBS).every((r) => r.accepted)).toBe(true);
    expect(results.at(-1)).toEqual({ accepted: false, reason: 'backlog' });
    await drain();
    const jobAcks = acks.filter((a) => a.seq >= 0);
    expect(jobAcks.map((a) => a.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(jobAcks[0].removedVoxels).toBeGreaterThan(0);
    expect(acks.at(-1)!.seq).toBe(-1);
    const touched = new Set(batches.flatMap((b) => b.chunks.map((c) => c.chunkIndex)));
    expect(touched.size).toBeLessThan(grid.chunkCount);
    expect(provider.submitSubtract(grid, { segments: [] }).accepted).toBe(true); // the backlog drained
    expect(await provider.countSolid(grid)).toBeLessThan(grid.initialSolidVoxels);
  });

  it('reset is a barrier: solid count restored, new epoch, whole mesh again', async () => {
    const provider = new BuiltinMachiningProvider(() => inProcessPort());
    await provider.init();
    const grid = await provider.createGrid(DESC);
    provider.submitSubtract(grid, { segments: [sphereAt(grid.gridOriginMm, { x: 0, y: 30, z: 0 }, 15)] });
    await drain();
    const batches: MachiningChunkMeshBatch[] = [];
    provider.onChunkMeshes(grid, (b) => batches.push(b));
    await provider.resetGrid(grid);
    await drain();
    expect(await provider.countSolid(grid)).toBe(grid.initialSolidVoxels);
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((b) => b.epoch === 1)).toBe(true);
  });

  it('destroyGrid is idempotent and closes the grid; a worker trap latches fail-off', async () => {
    const provider = new BuiltinMachiningProvider(() => inProcessPort({ throwOn: 'subtract' }));
    await provider.init();
    const grid = await provider.createGrid(DESC);
    const other = await provider.createGrid(DESC);
    await provider.destroyGrid(other);
    await provider.destroyGrid(other);
    expect(provider.submitSubtract(other, { segments: [] })).toEqual({ accepted: false, reason: 'closed' });
    machiningRegistry.register(provider);
    expect(machiningRegistry.provider).toBe(provider);
    expect(provider.submitSubtract(grid, { segments: [] }).accepted).toBe(true);
    await drain(20);
    expect(provider.failed).toBe(true);
    expect(machiningRegistry.provider).toBeNull();
    expect(provider.submitSubtract(grid, { segments: [] })).toEqual({ accepted: false, reason: 'closed' });
  });

  it('degrades substeps (not the path) above the segment cap', () => {
    const segs = Array.from({ length: MACHINING_MAX_SEGMENTS_PER_JOB * 2 }, () => ({ ...sphereAt({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), substeps: 10 }));
    const out = degradeSubsteps(segs);
    expect(out).toHaveLength(segs.length);
    expect(out.every((s) => s.substeps === 5)).toBe(true);
    const few = segs.slice(0, 3);
    expect(degradeSubsteps(few)).toBe(few); // at or below the cap the job is untouched
  });
});

class Signals implements MachiningSignalHost {
  readonly values = new Map<string, boolean | number>();
  getBoolByPath(path: string): boolean { return this.values.get(path) === true; }
  setByPath(path: string, value: boolean | number): void { this.values.set(path, value); }
}

describe('built-in machining provider — through the real MachiningManager', () => {
  it('replaces the authored workpiece with kernel chunks and carves where the tool is', async () => {
    const provider = new BuiltinMachiningProvider(() => inProcessPort());
    machiningRegistry.register(provider);
    const manager = new MachiningManager();
    manager.setSignalHost(new Signals());
    const registry = new NodeRegistry();
    const scene = new Scene();
    const node = new Object3D();
    node.name = 'Workpiece';
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    node.add(new Mesh(geo, new MeshStandardMaterial()));
    scene.add(node);
    const volume = new RVMachiningVolume(node);
    applySchema(volume as unknown as Record<string, unknown>, RVMachiningVolume.schema, { gridResolution: { x: 32, y: 32, z: 32 }, workpieceSize: { x: 100, y: 60, z: 80 } });
    const ctx = { registry, scene, signalStore: {}, transportManager: {}, root: new Object3D(), machiningManager: manager } as unknown as ComponentContext;
    volume.init(ctx);
    volume.onSceneReady(ctx);
    const toolNode = new Object3D();
    toolNode.name = 'Cutter';
    toolNode.position.set(0, 0.03, 0); // on the top face (meters)
    scene.add(toolNode);
    const tool = new RVMachiningTool(toolNode);
    applySchema(tool as unknown as Record<string, unknown>, RVMachiningTool.schema, { Shape: 'Sphere', ToolDiameter: 20, ToolLength: 20 });
    tool.init({} as ComponentContext);
    registry.registerNode('Cutter', toolNode);
    registry.register('MachiningTool', 'Cutter', tool);
    volume.Tools = [toolNode];
    volume.resolveTools();

    for (let i = 0; i < 40; i++) { manager.update(0.02); await drain(10); }
    expect(volume.IsInitialized).toBe(true);
    const meshes = (volume.chunkRoot?.children ?? []) as Mesh[];
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.some((m) => m.visible && (m.geometry.drawRange.count ?? 0) > 0)).toBe(true);
    expect(volume.VoxelsModified).toBeGreaterThan(0);
    manager.clear();
    await drain(5);
  });
});
