// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, Vector2, type WebGLRenderer } from 'three';
import { createTestViewer, type TestViewerHandle } from './helpers/create-test-viewer';
import { captureDimensions, chooseRecordingMime, exportImage, recordScene, validateCapture, MAX_RECORD_BYTES, type CaptureOptions } from '../src/core/presentation/capture';
let handle: TestViewerHandle | null = null;
afterEach(() => { vi.restoreAllMocks(); handle?.dispose(); handle = null; });
const options: CaptureOptions = { width: 320, height: 180, background: 'transparent', color: '#ffffff', annotations: false };
async function setup() {
  handle = await createTestViewer('webgl', { width: 200, height: 150 });
  const viewer = handle.viewer;
  viewer.renderMode = 'simple'; viewer.aoMode = 'off';
  const root = new Group(); root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#ca3823' })));
  viewer.scene.add(root); (viewer as unknown as { currentModel: Group }).currentModel = root;
  viewer.camera.position.set(0, 0, 4); viewer.controls.target.set(0, 0, 0); viewer.camera.lookAt(0, 0, 0); viewer.controls.enabled = false;
  viewer.scene.background = new Color('#123456');
  return viewer;
}
async function pixels(blob: Blob) {
  const image = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); image.close(); return { canvas, ctx };
}
describe('presentation output', () => {
  it('computes framing sizes, rejects oversize and chooses only a supported codec', () => {
    expect(captureDimensions('4k', 'portrait', { width: 200, height: 100 })).toEqual([2160, 3840]);
    expect(() => validateCapture({ ...options, width: 4000 })).toThrow();
    expect(() => validateCapture({ ...options, width: NaN })).toThrow();
    expect(chooseRecordingMime(mime => mime === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8');
    expect(chooseRecordingMime(() => false)).toBeNull();
  });
  it('renders actual dimensions, transparent corners and opaque subject, restoring all viewer state', async () => {
    const viewer = await setup(), renderer = viewer.renderer as unknown as WebGLRenderer;
    const size = renderer.getSize(new Vector2()).clone(), position = viewer.camera.position.clone(), background = viewer.scene.background;
    viewer.adaptiveQuality.setMode('auto', 1);
    const ratio = renderer.getPixelRatio();
    const output = await exportImage(viewer, options, 'image/png', new AbortController().signal);
    const { canvas, ctx } = await pixels(output);
    expect([canvas.width, canvas.height]).toEqual([320, 180]);
    expect(ctx.getImageData(1, 1, 1, 1).data[3]).toBe(0);
    const center = ctx.getImageData(160, 90, 1, 1).data; expect(center[3]).toBe(255); expect(center[0]).toBeGreaterThan(center[1] * 1.5);
    expect(renderer.getSize(new Vector2())).toEqual(size); expect(renderer.getPixelRatio()).toBe(ratio);
    expect(viewer.camera.position).toEqual(position); expect(viewer.scene.background).toBe(background);
    expect(viewer.adaptiveQuality.getSnapshot()).toEqual({ mode: 'auto', tier: 1 });
  });
  it('restores after rendering throws and allows a later capture', async () => {
    const viewer = await setup(), background = viewer.scene.background;
    const broken = vi.spyOn(viewer, 'renderFrameForCapture').mockImplementationOnce(() => { throw new Error('render failed'); });
    await expect(exportImage(viewer, options, 'image/png', new AbortController().signal)).rejects.toThrow('render failed');
    expect(viewer.scene.background).toBe(background); broken.mockRestore();
    expect((await exportImage(viewer, options, 'image/png', new AbortController().signal)).size).toBeGreaterThan(100);
  });
  it('records a playable real browser video and restores its camera and render surface', async () => {
    const viewer = await setup(), camera = viewer.camera.position.clone();
    const mime = chooseRecordingMime(type => MediaRecorder.isTypeSupported(type)); expect(mime).not.toBeNull();
    const job = recordScene(viewer, { ...options, background: 'scene' }, mime!, 'orbit', new AbortController().signal, () => {});
    await new Promise(resolve => setTimeout(resolve, 1100)); job.stop();
    const result = await job.result; expect(result.blob.size).toBeGreaterThan(100); expect(result.frames).toBeGreaterThan(0);
    const url = URL.createObjectURL(result.blob), video = document.createElement('video');
    try {
      const ready = new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('not playable')); });
      video.src = url; video.load(); await ready; expect(video.videoWidth).toBe(320); expect(video.videoHeight).toBe(180);
    } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    expect(viewer.camera.position).toEqual(camera);
  });
  it('abort restores synchronously and never returns a downloadable recording', async () => {
    const viewer = await setup(), controller = new AbortController(), bg = viewer.scene.background;
    const mime = chooseRecordingMime(type => MediaRecorder.isTypeSupported(type))!;
    const job = recordScene(viewer, { ...options, background: 'solid' }, mime, 'manual', controller.signal, () => {});
    const rejected = expect(job.result).rejects.toMatchObject({ name: 'AbortError' }); controller.abort();
    expect(viewer.scene.background).toBe(bg); await rejected;
    expect((await exportImage(viewer, options, 'image/png', new AbortController().signal)).size).toBeGreaterThan(100);
  });
  it('renders 4K from the 200px viewport and returns a solid JPEG without changing projection', async () => {
    const viewer = await setup(), matrix = viewer.camera.projectionMatrix.clone();
    const result = await pixels(await exportImage(viewer, { ...options, width: 3840, height: 2160, background: 'solid', color: '#ffffff' }, 'image/jpeg', new AbortController().signal));
    expect([result.canvas.width, result.canvas.height]).toEqual([3840, 2160]);
    expect([...result.ctx.getImageData(1, 1, 1, 1).data]).toEqual([255, 255, 255, 255]);
    expect(viewer.camera.projectionMatrix).toEqual(matrix);
  });
  it('rejects overlapping exports and saves a playable clip when moving to background', async () => {
    const viewer = await setup(), mime = chooseRecordingMime(type => MediaRecorder.isTypeSupported(type))!;
    const job = recordScene(viewer, { ...options, background: 'scene' }, mime, 'manual', new AbortController().signal, () => {});
    await expect(exportImage(viewer, options, 'image/png', new AbortController().signal)).rejects.toMatchObject({ code: 'busy' });
    await new Promise(resolve => setTimeout(resolve, 1100));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    const result = await job.result; expect(result.reason).toBe('background'); expect(result.blob.size).toBeGreaterThan(100);
  });
  it('restores after encoder start failure, encoded-size overflow and null image encoding', async () => {
    const viewer = await setup(), background = viewer.scene.background, mime = chooseRecordingMime(type => MediaRecorder.isTypeSupported(type))!;
    const start = vi.spyOn(MediaRecorder.prototype, 'start').mockImplementationOnce(() => { throw new Error('codec unavailable'); });
    const failed = recordScene(viewer, { ...options, background: 'solid' }, mime, 'orbit', new AbortController().signal, () => {});
    await expect(failed.result).rejects.toThrow('codec unavailable'); expect(viewer.scene.background).toBe(background); start.mockRestore();
    const oversized = vi.spyOn(MediaRecorder.prototype, 'start').mockImplementationOnce(function (this: MediaRecorder) {
      queueMicrotask(() => this.ondataavailable?.call(this, { data: { size: MAX_RECORD_BYTES + 1 } } as BlobEvent));
    });
    const overflow = recordScene(viewer, { ...options, background: 'solid' }, mime, 'manual', new AbortController().signal, () => {});
    await expect(overflow.result).rejects.toMatchObject({ code: 'size' }); expect(viewer.scene.background).toBe(background); oversized.mockRestore();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce(cb => cb(null));
    await expect(exportImage(viewer, options, 'image/png', new AbortController().signal)).rejects.toMatchObject({ code: 'encoding' });
    expect(viewer.scene.background).toBe(background);
  });
  it('records an imported tour to automatic completion and restores the camera', async () => {
    const viewer = await setup(), camera = viewer.camera.position.clone(), mime = chooseRecordingMime(type => MediaRecorder.isTypeSupported(type))!;
    const shot = { position: [0, 0, 4] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 45 };
    const job = recordScene(viewer, { ...options, background: 'scene' }, mime, {
      schemaVersion: 1, title: 'Tour', locale: 'en-US', startCamera: shot, loop: false,
      steps: [{ id: 'one', title: '', description: '', durationMs: 200, dwellMs: 1000, camera: { ...shot, position: [1, 0, 4] } }],
    }, new AbortController().signal, () => {});
    const result = await job.result; expect(result.blob.size).toBeGreaterThan(100); expect(result.frames).toBeGreaterThan(0);
    expect(viewer.camera.position).toEqual(camera);
  });
});
