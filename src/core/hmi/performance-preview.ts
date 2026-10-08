// SPDX-License-Identifier: AGPL-3.0-only
import {
  Box3,
  Color,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PerformanceAssets } from '../engine/rv-performance-assets';
/** Isolated visual-only viewport. Never enters NodeRegistry, plugins, signal or save paths. */
export class PreviewViewport {
  private renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, 1, 0.01, 1e7);
  private controls: OrbitControls;
  private meshes = new Map<number, Mesh>();
  private textures = new Map<number, Texture>();
  private closed = false;
  private unsubscribe: () => void;
  private resize: ResizeObserver;
  private frame = 0;
  private interacted = false;
  constructor(
    private element: HTMLElement,
    private assets: PerformanceAssets,
  ) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.setClearColor(0x101820);
    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const light = new DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 2, 3);
    this.scene.add(light);
    element.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    const b = assets.manifest.bounds,
      box = new Box3(
        new Vector3(...(b.slice(0, 3) as [number, number, number])),
        new Vector3(...(b.slice(3) as [number, number, number])),
      );
    const center = box.getCenter(new Vector3()),
      size = Math.max(0.1, box.getSize(new Vector3()).length());
    this.camera.position.copy(center).add(new Vector3(size * 0.6, size * 0.45, size * 0.9));
    this.camera.near = Math.max(0.001, size / 10000);
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(element);
    this.unsubscribe = assets.subscribe(() => this.sync());
    this.sync();
    this.controls.addEventListener('change', this.draw);
    this.controls.addEventListener('start', () => {
      this.interacted = true;
    });
    const tick = () => {
      if (this.closed) return;
      if (!document.hidden) assets.refine(this.camera, 1);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  private sync(): void {
    for (const [i, asset] of this.assets.assets) {
      let mesh = this.meshes.get(i);
      if (mesh?.geometry === asset.geometry) continue;
      const part = this.assets.manifest.parts[i];
      if (!mesh) {
        const material = new MeshLambertMaterial({
          color: new Color().fromArray(part.color),
          opacity: part.color[3],
          transparent: part.color[3] < 1,
          side: DoubleSide,
        });
        mesh = new Mesh(asset.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(part.matrix);
        this.scene.add(mesh);
        this.meshes.set(i, mesh);
      } else mesh.geometry = asset.geometry;
      if (asset.texture) {
        const generation = asset.geometry;
        void createImageBitmap(new Blob([asset.texture], { type: 'image/png' }))
          .then((bitmap) => {
            if (this.closed || this.meshes.get(i)?.geometry !== generation) {
              bitmap.close();
              return;
            }
            const previous = this.textures.get(i);
            if (previous) {
              previous.dispose();
              (previous.image as ImageBitmap).close();
            }
            const texture = new Texture(bitmap);
            texture.colorSpace = SRGBColorSpace;
            texture.flipY = false;
            texture.needsUpdate = true;
            this.textures.set(i, texture);
            const material = mesh!.material as MeshLambertMaterial;
            material.map = texture;
            material.needsUpdate = true;
            this.draw();
          })
          .catch(() => {
            if (!this.closed) this.assets.session.warn();
          });
      }
    }
    this.draw();
  }
  private draw = (): void => {
    if (this.closed) return;
    if (this.interacted)
      this.assets.previewCamera = {
        position: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
      };
    const w = Math.max(1, this.element.clientWidth),
      h = Math.max(1, this.element.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  };
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.frame);
    this.unsubscribe();
    this.resize.disconnect();
    this.controls.dispose();
    for (const mesh of this.meshes.values()) (mesh.material as MeshLambertMaterial).dispose();
    for (const texture of this.textures.values()) {
      texture.dispose();
      (texture.image as ImageBitmap).close();
    }
    this.meshes.clear();
    this.textures.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
