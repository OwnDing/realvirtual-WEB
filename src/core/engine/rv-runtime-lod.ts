// SPDX-License-Identifier: AGPL-3.0-only
import { Camera, Group, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { isBatchSafe } from './rv-batched-render';
import type { PerformanceAssets } from './rv-performance-assets';
interface Entry {
  source: Mesh;
  proxy: Mesh;
  mask: number;
  low: boolean;
  radius: number;
}
/** Render-only LOD. Original geometry, visibility, hierarchy, picking and export stay authoritative. */
export class RuntimeLod {
  private group = new Group();
  private entries: Entry[] = [];
  private position = new Vector3();
  private cameraPosition = new Vector3();
  private scale = new Vector3();
  private disposed = false;
  private onAssetsDisposed = () => this.dispose();
  constructor(
    root: Object3D,
    indices: Map<Object3D, number>,
    private assets: PerformanceAssets,
  ) {
    assets.signal.addEventListener('abort', this.onAssetsDisposed, { once: true });
    this.group.userData._rvBatchedRender = true;
    const byIndex = new Map<number, number>();
    const duplicate = new Set<number>();
    assets.manifest.parts.forEach((part, i) => {
      if (byIndex.has(part.nodeIndex)) duplicate.add(part.nodeIndex);
      byIndex.set(part.nodeIndex, i);
    });
    // Bound draw-call and reconciliation overhead; prioritize expensive meshes.
    const candidates = [...indices]
      .filter(
        ([node, index]) => node instanceof Mesh && !duplicate.has(index) && byIndex.has(index),
      )
      .sort(
        ([a], [b]) =>
          ((b as Mesh).geometry.index?.count ?? 0) - ((a as Mesh).geometry.index?.count ?? 0),
      )
      .slice(0, 256);
    for (const [node, index] of candidates) {
      const mesh = node as Mesh,
        partIndex = byIndex.get(index)!,
        part = assets.manifest.parts[partIndex],
        asset = assets.assets.get(partIndex);
      if (
        !part.runtimeLod ||
        !asset ||
        !isBatchSafe(mesh, root) ||
        mesh.geometry.getAttribute('color') ||
        mesh.geometry.groups.length > 1 ||
        Array.isArray(mesh.material)
      )
        continue;
      const originalCount =
        mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
      if (
        (asset.geometry.index?.count ?? originalCount) >= originalCount * 0.8 ||
        originalCount < 3000
      )
        continue;
      mesh.userData._rvLodSource = true;
      const proxy = new Mesh(asset.geometry, mesh.material);
      proxy.matrixAutoUpdate = false;
      proxy.matrixWorldAutoUpdate = false;
      proxy.visible = false;
      proxy.userData._rvBatchedRender = true;
      proxy.castShadow = mesh.castShadow;
      proxy.receiveShadow = mesh.receiveShadow;
      this.group.add(proxy);
      mesh.geometry.computeBoundingSphere();
      this.entries.push({
        source: mesh,
        proxy,
        mask: mesh.layers.mask,
        low: false,
        radius: mesh.geometry.boundingSphere?.radius ?? 0,
      });
    }
  }
  attach(scene: Scene): void {
    scene.add(this.group);
  }
  update(camera: Camera, tier: number): boolean {
    camera.getWorldPosition(this.cameraPosition);
    let changed = false;
    for (const entry of this.entries) {
      const { source, proxy } = entry;
      // Does not walk the full scene; only bounded candidates and their ancestor chain.
      let visible = true,
        ancestor: Object3D | null = source;
      while (ancestor) {
        if (!ancestor.visible) {
          visible = false;
          break;
        }
        ancestor = ancestor.parent;
      }
      source.updateWorldMatrix(true, false);
      this.position.setFromMatrixPosition(source.matrixWorld);
      this.scale.setFromMatrixScale(source.matrixWorld);
      const angular =
        (entry.radius * Math.max(this.scale.x, this.scale.y, this.scale.z)) /
        Math.max(0.001, this.position.distanceTo(this.cameraPosition));
      const threshold = tier === 0 ? 0.32 : tier === 1 ? 0.16 : 0.08;
      const low =
        camera instanceof PerspectiveCamera && angular < threshold * (entry.low ? 1.3 : 1);
      if (low !== entry.low || proxy.visible !== (low && visible)) {
        changed = true;
        entry.low = low;
      }
      source.layers.mask = low ? 0 : entry.mask;
      proxy.visible = low && visible;
      proxy.matrix.copy(source.matrixWorld);
      proxy.matrixWorld.copy(source.matrixWorld);
      proxy.material = source.material;
    }
    return changed;
  }
  get size(): number {
    return this.entries.length;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.signal.removeEventListener('abort', this.onAssetsDisposed);
    this.group.removeFromParent();
    for (const entry of this.entries) {
      entry.source.layers.mask = entry.mask;
      delete entry.source.userData._rvLodSource;
    }
    this.entries.length = 0;
    this.assets.dispose();
  }
}
