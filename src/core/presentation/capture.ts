// SPDX-License-Identifier: AGPL-3.0-only
import { Color, PerspectiveCamera, OrthographicCamera, Vector3, type Object3D, type WebGLRenderer } from 'three';
import type { RVViewer } from '../rv-viewer';
import { PresentationError } from './look';
import { getRenderMode } from '../rv-render-modes';
import { getLicenseSnapshot } from '../licensing/rv-lic-store';
import { rvT } from '../i18n';
import { type DemoRecipe } from '../demo-package/recipe';
import { HIGHLIGHT_OVERLAY_LAYER } from '../engine/rv-group-registry';
import { MEASUREMENT_LAYER } from '../engine/rv-constants';
export interface CaptureOptions {
  width: number; height: number; background: 'scene' | 'solid' | 'transparent'; color: string; annotations: boolean;
}
export const MAX_RECORD_BYTES = 256 * 1024 * 1024;
export const MAX_RECORD_MS = 180_000;
const active = new WeakSet<RVViewer>();
export function validateCapture(options: CaptureOptions, maxSize = 3840): void {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || Math.max(width, height) > Math.min(3840, maxSize) || width * height > 3840 * 2160) throw new PresentationError('size');
  if (!['scene', 'solid', 'transparent'].includes(options.background) || !/^#[0-9a-f]{6}$/i.test(options.color)) throw new PresentationError('invalid');
}
export function chooseRecordingMime(supports: (type: string) => boolean): string | null {
  return ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(supports) ?? null;
}
export function captureDimensions(size: 'viewport' | '1080' | '4k', shape: 'wide' | 'square' | 'portrait', view: { width: number; height: number }): [number, number] {
  if (size === 'viewport') return [view.width, view.height];
  const long = size === '4k' ? 3840 : 1920, short = size === '4k' ? 2160 : 1080;
  return shape === 'wide' ? [long, short] : shape === 'portrait' ? [short, long] : [short, short];
}
/** Owns the renderer only until copied pixels are handed to the encoder. */
class CaptureSession {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private restorers: (() => void)[] = [];
  private disposed = false;
  private readonly root: Object3D | null;
  private readonly camera;
  readonly fovCrop: number;
  constructor(private viewer: RVViewer, options: CaptureOptions, private signal: AbortSignal) {
    signal.throwIfAborted();
    if (active.has(viewer)) throw new PresentationError('busy');
    if (viewer.renderBackend !== 'three' || viewer.renderer.domElement.style.display === 'none' || viewer.isWebGPU || (viewer.renderer as unknown as WebGLRenderer).xr.isPresenting) throw new PresentationError('renderer');
    if (!viewer.currentModelRoot) throw new PresentationError('empty');
    if (getRenderMode(viewer.renderMode).capabilities.environment && !viewer.scene.environment) throw new PresentationError('resources');
    const gl = viewer.renderer as unknown as WebGLRenderer;
    validateCapture(options, Math.min(gl.capabilities.maxTextureSize, gl.getContext().getParameter(gl.getContext().MAX_RENDERBUFFER_SIZE) as number));
    if (gl.getContext().isContextLost()) throw new PresentationError('resources');
    this.root = viewer.currentModelRoot; this.camera = viewer.camera;
    this.fovCrop = viewer.camera instanceof PerspectiveCamera ? Math.min(1, viewer.camera.aspect / (options.width / options.height)) : 1;
    this.canvas.width = options.width; this.canvas.height = options.height;
    const ctx = this.canvas.getContext('2d'); if (!ctx) throw new PresentationError('encoding'); this.ctx = ctx;
    active.add(viewer);
    try {
      const quality = viewer.adaptiveQuality.getSnapshot();
      viewer.adaptiveQuality.setMode('manual');
      this.restorers.push(() => viewer.adaptiveQuality.setMode(quality.mode, quality.tier));
      this.restorers.push(viewer.beginMediaCaptureSize(options.width, options.height, options.annotations));
      const camera = viewer.camera;
      const copy = camera.clone(), position = camera.position.clone(), quaternion = camera.quaternion.clone(), target = viewer.controls.target.clone();
      this.restorers.push(() => { if (camera instanceof PerspectiveCamera && copy instanceof PerspectiveCamera) camera.copy(copy);
        else if (camera instanceof OrthographicCamera && copy instanceof OrthographicCamera) camera.copy(copy); camera.position.copy(position); camera.quaternion.copy(quaternion); viewer.controls.target.copy(target); });
      const aspect = options.width / options.height;
      if (camera instanceof PerspectiveCamera) {
        camera.fov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * this.fovCrop) * 180 / Math.PI;
        camera.aspect = aspect;
      } else if (camera instanceof OrthographicCamera) {
        const w = camera.right - camera.left, h = camera.top - camera.bottom, cx = (camera.right + camera.left) / 2, cy = (camera.top + camera.bottom) / 2;
        const nh = Math.min(h, w / aspect), nw = nh * aspect;
        camera.left = cx - nw / 2; camera.right = cx + nw / 2; camera.top = cy + nh / 2; camera.bottom = cy - nh / 2;
      }
      camera.updateProjectionMatrix();
      const bg = viewer.scene.background, alpha = gl.getClearAlpha(), clear = gl.getClearColor(new Color()).clone();
      this.restorers.push(() => { viewer.scene.background = bg; gl.setClearColor(clear, alpha); });
      if (options.background !== 'scene') {
        viewer.scene.background = options.background === 'solid' ? new Color(options.color) : null;
        gl.setClearColor(options.color, options.background === 'transparent' ? 0 : 1);
      }
      if (options.background === 'transparent') {
        const ground = viewer.groundEnabled, reflection = viewer.reflectionEnabled, ao = viewer.aoMode, bloom = viewer.bloomEnabled, outline = viewer.toonOutlineAmount;
        this.restorers.push(() => { viewer.groundEnabled = ground; viewer.reflectionEnabled = reflection; viewer.aoMode = ao; viewer.bloomEnabled = bloom; viewer.toonOutlineAmount = outline; });
        viewer.groundEnabled = false; viewer.reflectionEnabled = false; viewer.aoMode = 'off'; viewer.bloomEnabled = false; viewer.toonOutlineAmount = 0;
      }
      const visibility: Array<[Object3D, boolean]> = [];
      viewer.scene.traverse(node => {
        const overlay = (node.layers.mask & (1 << HIGHLIGHT_OVERLAY_LAYER)) !== 0;
        const annotation = (node.layers.mask & (1 << MEASUREMENT_LAYER)) !== 0;
        if (overlay || (!options.annotations && annotation) || node.userData._rvGizmo || /Helper$/.test(node.type)) {
          visibility.push([node, node.visible]); node.visible = false;
        }
      });
      this.restorers.push(() => { for (const [node, visible] of visibility) node.visible = visible; });
      const passes = [viewer.outlineManager.pass, viewer.outlineManager.hoverPass, viewer.outlineManager.chainPass].filter(p => p !== null);
      const strengths = passes.map(p => p.edgeStrength);
      passes.forEach(p => { p.edgeStrength = 0; });
      this.restorers.push(() => passes.forEach((p, i) => { p.edgeStrength = strengths[i]; }));
    } catch (error) { this.dispose(); throw error; }
  }
  frame(): HTMLCanvasElement {
    this.signal.throwIfAborted();
    if (this.viewer.currentModelRoot !== this.root || this.viewer.camera !== this.camera) throw new PresentationError('changed');
    if (this.viewer.renderBackend !== 'three' || this.viewer.renderer.domElement.style.display === 'none') throw new PresentationError('renderer');
    if ((this.viewer.renderer as unknown as WebGLRenderer).getContext().isContextLost()) throw new PresentationError('resources');
    this.viewer.renderFrameForCapture();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.viewer.renderer.domElement, 0, 0);
    if (getLicenseSnapshot().evaluation.watermark) {
      this.ctx.font = `${Math.max(16, this.canvas.width / 100)}px sans-serif`; this.ctx.textAlign = 'right';
      this.ctx.fillStyle = '#4d4537'; this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 3;
      const text = rvT('shell', 'license.watermark');
      this.ctx.strokeText(text, this.canvas.width - 20, this.canvas.height - 20); this.ctx.fillText(text, this.canvas.width - 20, this.canvas.height - 20);
    }
    return this.canvas;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    try { for (const restore of this.restorers.reverse()) { try { restore(); } catch (error) { console.error('[presentation] Restore failed', error); } } }
    finally { active.delete(this.viewer); this.viewer.markRenderDirty(); }
  }
}
export async function exportImage(viewer: RVViewer, options: CaptureOptions, format: 'image/png' | 'image/jpeg', signal: AbortSignal): Promise<Blob> {
  if (format === 'image/jpeg' && options.background === 'transparent') throw new PresentationError('invalid');
  const root = viewer.currentModelRoot;
  await viewer.whenLoadingIdle(); signal.throwIfAborted();
  if (root !== viewer.currentModelRoot) throw new PresentationError('changed');
  const session = new CaptureSession(viewer, options, signal);
  let pending: Promise<Blob>;
  try {
    const canvas = session.frame();
    pending = new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new PresentationError('encoding')), format, 0.95));
  } finally { session.dispose(); }
  const blob = await pending; signal.throwIfAborted(); return blob;
}
export interface RecordingResult { blob: Blob; reason: 'stopped' | 'background' | 'limit'; frames: number; durationMs: number }
export interface Recording { stop(): void; cancel(): void; result: Promise<RecordingResult> }
export function recordScene(viewer: RVViewer, options: CaptureOptions, mime: string, motion: 'manual' | 'orbit' | DemoRecipe, signal: AbortSignal, progress: (ms: number, frames: number) => void): Recording {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(mime)) throw new PresentationError('encoding');
  if (options.background === 'transparent') throw new PresentationError('invalid');
  if (document.hidden) throw new PresentationError('changed');
  if (typeof motion === 'object' && !(viewer.camera instanceof PerspectiveCamera)) throw new PresentationError('invalid');
  const session = new CaptureSession(viewer, options, signal);
  let stream: MediaStream | undefined, recorder: MediaRecorder;
  try {
    if (motion !== 'manual') viewer.cancelCameraAnimation();
    if (typeof motion === 'object') {
      viewer.camera.position.set(...motion.startCamera.position); viewer.controls.target.set(...motion.startCamera.target);
      if (viewer.camera instanceof PerspectiveCamera) {
        viewer.camera.fov = 2 * Math.atan(Math.tan(motion.startCamera.fov * Math.PI / 360) * session.fovCrop) * 180 / Math.PI; viewer.camera.updateProjectionMatrix();
      }
      viewer.camera.lookAt(viewer.controls.target);
    }
    session.frame(); stream = session.canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  } catch (error) { stream?.getTracks().forEach(t => t.stop()); session.dispose(); throw error; }
  const camera = viewer.camera, target = viewer.controls.target.clone(), startPosition = camera.position.clone(), controlsEnabled = viewer.controls.enabled;
  if (motion !== 'manual') { viewer.cancelCameraAnimation(); viewer.controls.enabled = false; }
  const delta = new Vector3().subVectors(startPosition, target), axis = new Vector3(0, 1, 0), shotPosition = new Vector3(), shotTarget = new Vector3();
  const totalTourMs = typeof motion === 'object' ? motion.steps.reduce((sum, step) => sum + step.durationMs + step.dwellMs, 0) : 0;
  const chunks: Blob[] = []; let bytes = 0, frames = 0, raf = 0, last = 0, notifyAt = 0, cancelled = false, settled = false;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let reason: RecordingResult['reason'] = 'stopped'; const started = performance.now();
  let resolve!: (value: RecordingResult) => void, reject!: (error: unknown) => void;
  const result = new Promise<RecordingResult>((yes, no) => { resolve = yes; reject = no; });
  const cleanup = () => { clearTimeout(stopTimer); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); signal.removeEventListener('abort', cancel); stream?.getTracks().forEach(t => t.stop()); viewer.controls.enabled = controlsEnabled; session.dispose(); };
  const fail = (error: unknown) => { if (settled) return; settled = true; try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* The original failure is reported below. */ } finally { cleanup(); reject(error); } };
  const stop = () => {
    if (settled || stopTimer) return; cancelAnimationFrame(raf);
    stopTimer = setTimeout(() => fail(new PresentationError('encoding')), 10_000);
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { fail(new PresentationError('encoding')); }
  };
  const cancel = () => { cancelled = true; fail(new DOMException('Cancelled', 'AbortError')); };
  const visibility = () => { if (document.hidden) { reason = 'background'; stop(); } };
  recorder.ondataavailable = event => { if (!settled && !cancelled && event.data.size) { bytes += event.data.size; if (bytes > MAX_RECORD_BYTES) { fail(new PresentationError('size')); return; } chunks.push(event.data); if (bytes >= MAX_RECORD_BYTES) { reason = 'limit'; stop(); } } };
  recorder.onerror = () => fail(new PresentationError('encoding'));
  recorder.onstop = () => {
    if (settled) return; settled = true; cleanup();
    if (cancelled || signal.aborted) reject(new DOMException('Cancelled', 'AbortError'));
    else if (!bytes) reject(new PresentationError('encoding'));
    else if (bytes > MAX_RECORD_BYTES) reject(new PresentationError('size'));
    else resolve({ blob: new Blob(chunks, { type: recorder.mimeType }), reason, frames, durationMs: performance.now() - started });
  };
  const tick = (now: number) => {
    if (settled || recorder.state !== 'recording') return;
    try {
      const elapsed = now - started;
      if (elapsed >= MAX_RECORD_MS) { reason = 'limit'; stop(); return; }
      if (now - last >= 1000 / 30) {
        last = now;
        if (motion === 'orbit') { camera.position.copy(delta).applyAxisAngle(axis, elapsed / 30_000 * Math.PI * 2).add(target); camera.lookAt(target); }
        else if (typeof motion === 'object') {
          let remaining = motion.loop && totalTourMs > 0 ? elapsed % totalTourMs : elapsed, from = motion.startCamera; let done = true;
          for (const step of motion.steps) {
            const duration = step.durationMs + step.dwellMs;
            if (remaining <= duration) {
              const t = step.durationMs ? Math.min(1, remaining / step.durationMs) : 1, smooth = t * t * (3 - 2 * t);
              camera.position.set(...from.position).lerp(shotPosition.set(...step.camera.position), smooth);
              viewer.controls.target.set(...from.target).lerp(shotTarget.set(...step.camera.target), smooth);
              if (camera instanceof PerspectiveCamera) { camera.fov = 2 * Math.atan(Math.tan((from.fov + (step.camera.fov - from.fov) * smooth) * Math.PI / 360) * session.fovCrop) * 180 / Math.PI; camera.updateProjectionMatrix(); }
              camera.lookAt(viewer.controls.target); done = false; break;
            }
            remaining -= duration; from = step.camera;
          }
          if (done) { stop(); return; }
        }
        session.frame(); frames++;
        if (now - notifyAt > 500) { notifyAt = now; progress(elapsed, frames); }
      }
      raf = requestAnimationFrame(tick);
    } catch (error) { fail(error); }
  };
  try { recorder.start(1000); signal.addEventListener('abort', cancel, { once: true }); document.addEventListener('visibilitychange', visibility); if (signal.aborted) cancel(); else raf = requestAnimationFrame(tick); }
  catch (error) { fail(error); }
  return { stop, cancel, result };
}
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
