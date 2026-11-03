// SPDX-License-Identifier: AGPL-3.0-only

/**
 * csg-worker-core — the machining worker's message body (ADR-0026).
 *
 * Runs inside `csg-worker.ts` and, in tests, in-process with an injected
 * scheduler. Protocol (one grid per id):
 *
 * - `create` builds the grid and queues every chunk for tessellation (the
 *   initial workpiece mesh); `reset` is a barrier: queued jobs are discarded, the
 *   grid is re-initialised, the epoch increments and every chunk is queued again.
 * - `subtract` jobs are processed strictly in arrival order; each produces one
 *   ack with the momentary queue depths. Each pump turn handles one job and one
 *   tessellation batch of at most MACHINING_TESSELLATE_BATCH chunks.
 * - Once both queues drain after any work, one idle ack (`seq = −1`) follows.
 * - More than MACHINING_MAX_SEGMENTS_PER_JOB segments: every segment keeps its
 *   endpoints and its substeps are reduced proportionally (lossy, deterministic).
 */

import {
  MACHINING_MAX_SEGMENTS_PER_JOB, MACHINING_TESSELLATE_BATCH,
  type MachiningChunkMesh, type MachiningChunkMeshBatch, type MachiningGridDesc, type MachiningSubtractAck, type MachiningToolSegment,
} from '../rv-machining-registry';
import { allChunks, chunkCount, countSolid, createGrid, resetGrid, subtract, tessellateChunk, type CsgGrid } from './csg-kernel';

export interface CsgGridInfo {
  resolution: { x: number; y: number; z: number };
  chunkResolution: { x: number; y: number; z: number };
  chunkCount: number;
  voxelSizeMm: { x: number; y: number; z: number };
  gridOriginMm: { x: number; y: number; z: number };
  totalVoxels: number;
  initialSolidVoxels: number;
}

export type CsgRequest =
  | { type: 'create'; id: number; desc: MachiningGridDesc }
  | { type: 'destroy'; id: number }
  | { type: 'reset'; id: number; token: number }
  | { type: 'subtract'; id: number; seq: number; segments: MachiningToolSegment[] }
  | { type: 'count'; id: number; token: number };

export type CsgResponse =
  | { type: 'ready' }
  | { type: 'created'; id: number; info: CsgGridInfo }
  | { type: 'create-failed'; id: number; message: string }
  | { type: 'ack'; id: number; ack: MachiningSubtractAck }
  | { type: 'chunks'; id: number; batch: MachiningChunkMeshBatch }
  | { type: 'reset-done'; id: number; token: number }
  | { type: 'count-result'; id: number; token: number; count: number }
  | { type: 'fatal'; message: string };

/** Keep the path, reduce its density, when a coalesced job exceeds the segment cap. */
export function degradeSubsteps(segments: MachiningToolSegment[]): MachiningToolSegment[] {
  if (segments.length <= MACHINING_MAX_SEGMENTS_PER_JOB) return segments;
  const factor = MACHINING_MAX_SEGMENTS_PER_JOB / segments.length;
  return segments.map((s) => ({ ...s, substeps: Math.max(1, Math.floor(s.substeps * factor)) }));
}

interface GridState {
  grid: CsgGrid;
  epoch: number;
  jobs: Array<{ seq: number; segments: MachiningToolSegment[] }>;
  dirty: Set<number>;
  needsIdle: boolean;
}

export class CsgWorkerCore {
  private readonly grids = new Map<number, GridState>();
  private scheduled = false;

  constructor(
    private readonly post: (msg: CsgResponse, transfer: Transferable[]) => void,
    private readonly schedule: (fn: () => void) => void,
  ) {}

  handle(req: CsgRequest): void {
    switch (req.type) {
      case 'create': {
        let grid: CsgGrid;
        try {
          grid = createGrid(req.desc);
        } catch (error) {
          this.post({ type: 'create-failed', id: req.id, message: error instanceof Error ? error.message : String(error) }, []);
          return;
        }
        this.grids.set(req.id, { grid, epoch: 0, jobs: [], dirty: new Set(allChunks(grid)), needsIdle: true });
        this.post({ type: 'created', id: req.id, info: infoOf(grid) }, []);
        this.kick();
        return;
      }
      case 'destroy':
        this.grids.delete(req.id);
        return;
      case 'reset': {
        const state = this.grids.get(req.id);
        if (state) {
          state.jobs.length = 0;
          resetGrid(state.grid);
          state.epoch++;
          state.dirty = new Set(allChunks(state.grid));
          state.grid.meshed.fill(0);
          state.needsIdle = true;
          this.kick();
        }
        this.post({ type: 'reset-done', id: req.id, token: req.token }, []);
        return;
      }
      case 'subtract': {
        const state = this.grids.get(req.id);
        if (!state) return;
        state.jobs.push({ seq: req.seq, segments: degradeSubsteps(req.segments) });
        this.kick();
        return;
      }
      case 'count': {
        const state = this.grids.get(req.id);
        this.post({ type: 'count-result', id: req.id, token: req.token, count: state ? countSolid(state.grid) : 0 }, []);
        return;
      }
    }
  }

  private kick(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => { this.scheduled = false; this.pump(); });
  }

  /** One turn: per grid, one job and one tessellation batch. */
  pump(): void {
    let more = false;
    for (const [id, state] of this.grids) {
      const job = state.jobs.shift();
      if (job) {
        const removed = subtract(state.grid, job.segments, state.dirty);
        state.needsIdle = true;
        this.post({ type: 'ack', id, ack: { seq: job.seq, removedVoxels: removed, pendingJobs: state.jobs.length, pendingChunks: state.dirty.size } }, []);
      }
      if (state.dirty.size > 0) {
        const chunks: MachiningChunkMesh[] = [];
        const transfer: Transferable[] = [];
        for (const index of state.dirty) {
          if (chunks.length >= MACHINING_TESSELLATE_BATCH) break;
          state.dirty.delete(index);
          const hadMesh = state.grid.meshed[index] === 1;
          const mesh = tessellateChunk(state.grid, index);
          // An empty chunk is only news when it used to show something.
          if (mesh.indexCount > 0 || hadMesh) {
            chunks.push(mesh);
            transfer.push(mesh.positions.buffer, mesh.normals.buffer, mesh.uvs.buffer, mesh.indices.buffer);
          }
        }
        if (chunks.length > 0) this.post({ type: 'chunks', id, batch: { epoch: state.epoch, chunks, pendingChunks: state.dirty.size } }, transfer);
      }
      if (state.jobs.length > 0 || state.dirty.size > 0) more = true;
      else if (state.needsIdle) {
        state.needsIdle = false;
        this.post({ type: 'ack', id, ack: { seq: -1, removedVoxels: 0, pendingJobs: 0, pendingChunks: 0 } }, []);
      }
    }
    if (more) this.kick();
  }
}

function infoOf(grid: CsgGrid): CsgGridInfo {
  return {
    resolution: { ...grid.res },
    chunkResolution: { ...grid.chunkRes },
    chunkCount: chunkCount(grid),
    voxelSizeMm: { ...grid.voxel },
    gridOriginMm: { ...grid.origin },
    totalVoxels: grid.res.x * grid.res.y * grid.res.z,
    initialSolidVoxels: grid.initialSolid,
  };
}
