// SPDX-License-Identifier: AGPL-3.0-only
import { Box3, BufferGeometry, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { downloadModel } from './rv-model-download';
import {
  decodePerformanceGeometry,
  parsePerformancePackage,
  performanceResourceUrl,
  verifyPerformanceBytes,
  validatePerformanceTexture,
  PERFORMANCE_LIMITS,
  type PerformancePackage,
  type PerformanceResource,
} from './rv-performance-package';
import type { ModelLoadSession } from './rv-load-session';
export interface PerformanceAsset {
  geometry: BufferGeometry;
  texture: ArrayBuffer | null;
  bytes: number;
  level: number;
}
/** Bounded sequential refinement: at most two baseline requests and one refinement in flight. */
export class PerformanceAssets {
  previewCamera?: { position: [number, number, number]; target: [number, number, number] };
  readonly assets = new Map<number, PerformanceAsset>();
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private listeners = new Set<() => void>();
  private refining = false;
  private frozen = false;
  private failed = new Set<string>();
  private resident = 0;
  private lastSchedule = 0;
  private frustum = new Frustum();
  private projection = new Matrix4();
  private box = new Box3();
  private transform = new Matrix4();
  private center = new Vector3();
  private abort: () => void;
  constructor(
    readonly manifest: PerformancePackage,
    readonly url: string,
    readonly session: ModelLoadSession,
    private parentSignal = session.signal,
  ) {
    this.abort = () => this.dispose();
    parentSignal.addEventListener('abort', this.abort, { once: true });
    if (parentSignal.aborted) this.dispose();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const fn of this.listeners) fn();
  }
  private async resource(resource: PerformanceResource): Promise<ArrayBuffer> {
    const data = await downloadModel(performanceResourceUrl(this.url, resource.uri), {
      signal: this.signal,
      maxBytes: resource.byteLength,
      timeoutMs: 15_000,
    });
    verifyPerformanceBytes(data, resource);
    this.signal.throwIfAborted();
    return data;
  }
  private async load(index: number, level: number): Promise<void> {
    const resource = this.manifest.parts[index].levels[level];
    const bytes = resource.byteLength + (resource.texture?.byteLength ?? 0);
    // Includes decoded normals/positions and decoded 512² texture rather than just transfer bytes.
    const cost = bytes * 3 + (resource.texture ? 512 * 512 * 4 : 0);
    const previous = this.assets.get(index);
    if (this.resident + cost > PERFORMANCE_LIMITS.resident) throw new Error('PERF_RESIDENT_BUDGET');
    this.resident += cost;
    try {
      const data = await this.resource(resource);
      const texture = resource.texture ? await this.resource(resource.texture) : null;
      if (texture) validatePerformanceTexture(texture);
      this.signal.throwIfAborted();
      if (this.frozen && level > 0) throw new DOMException('Refinement stopped', 'AbortError');
      const geometry = decodePerformanceGeometry(data);
      this.assets.set(index, { geometry, texture, bytes: cost, level });
      this.resident -= previous?.bytes ?? 0;
      this.notify(); // Consumers synchronously replace their borrowed geometry before disposal.
      previous?.geometry.dispose();
    } catch (error) {
      this.resident -= cost;
      throw error;
    }
  }
  async baseline(): Promise<void> {
    let next = 0;
    const worker = async () => {
      for (;;) {
        const index = next++;
        if (index >= this.manifest.parts.length) return;
        await this.load(index, 0);
      }
    };
    await Promise.all([worker(), worker()]);
  }
  /** Camera changes only; no per-frame full scene traversal or React updates. */
  refine(camera: PerspectiveCamera, quality: number, now = performance.now()): void {
    if (
      this.frozen ||
      this.signal.aborted ||
      this.refining ||
      now - this.lastSchedule < 250 ||
      quality === 0
    )
      return;
    this.lastSchedule = now;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(
      this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    let candidate = -1,
      score = 0;
    for (let i = 0; i < this.manifest.parts.length; i++) {
      const part = this.manifest.parts[i],
        current = this.assets.get(i);
      if (!current || current.level === 1 || this.failed.has(`${i}:1`)) continue;
      const b = part.bounds;
      this.box.min.set(b[0], b[1], b[2]);
      this.box.max.set(b[3], b[4], b[5]);
      this.box.applyMatrix4(this.transform.fromArray(part.matrix));
      if (!this.frustum.intersectsBox(this.box)) continue;
      this.box.getCenter(this.center);
      const importance =
        this.box.min.distanceTo(this.box.max) /
        Math.max(0.001, this.center.distanceTo(camera.position));
      if (importance > score) {
        candidate = i;
        score = importance;
      }
    }
    if (candidate < 0) return;
    this.refining = true;
    void this.load(candidate, 1)
      .catch(() => {
        this.failed.add(`${candidate}:1`);
        if (!this.signal.aborted && !this.frozen) this.session.warn();
      })
      .finally(() => {
        this.refining = false;
      });
  }
  freeze(): void {
    this.frozen = true;
  }
  verifySource(data: ArrayBuffer): void {
    verifyPerformanceBytes(data, this.manifest.source);
  }
  dispose(): void {
    if (this.signal.aborted) return;
    this.controller.abort();
    this.parentSignal.removeEventListener('abort', this.abort);
    for (const asset of this.assets.values()) asset.geometry.dispose();
    this.assets.clear();
    this.listeners.clear();
    this.resident = 0;
  }
}
export async function preparePerformanceAssets(
  url: string,
  session: ModelLoadSession,
  signal = session.signal,
): Promise<PerformanceAssets | null> {
  let assets: PerformanceAssets | null = null;
  try {
    const parsed = new URL(url, location.href);
    // Private/encrypted/project/blob sources never discover unrelated public companions.
    if (
      !/^https?:$/.test(parsed.protocol) ||
      !parsed.pathname.endsWith('.glb') ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    )
      return null;
    parsed.pathname += '.perf.json';
    const data = await downloadModel(parsed.href, {
      signal,
      maxBytes: PERFORMANCE_LIMITS.manifest,
      timeoutMs: 3000,
    });
    session.assertCurrent();
    signal.throwIfAborted();
    assets = new PerformanceAssets(
      parsePerformancePackage(JSON.parse(new TextDecoder().decode(data))),
      parsed.href,
      session,
      signal,
    );
    await assets.baseline();
    session.assertCurrent();
    return assets;
  } catch (error) {
    assets?.dispose();
    if (!(error instanceof Error && /MODEL_HTTP_404/.test(error.message)) && !signal.aborted)
      session.warn();
    return null;
  }
}
