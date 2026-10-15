// SPDX-License-Identifier: AGPL-3.0-only
import type { Object3D } from 'three';
import type { RVViewer } from '../rv-viewer';
import { browserText, numberOrNull } from './sanitize';
import { numbers } from './collect';
import { abortIfNeeded, DIAGNOSTIC_LIMITS, section, type DiagnosticSource, type Section, type Json } from './types';
const loadPhases = ['idle', 'download', 'verify', 'decode', 'compose', 'construct', 'batch', 'render', 'ready', 'error', 'cancelled'];
export class ViewerDiagnosticSource implements DiagnosticSource {
  private revision = 0;
  constructor(private readonly viewer: RVViewer, private readonly componentsOf: (node: Object3D) => readonly object[]) {}
  generation = () => this.revision;
  changed(): void { this.revision++; }
  graphics(): Section {
    const viewer = this.viewer, gpu = viewer.getGPUInfo();
    const renderer = viewer.renderer as unknown as {
      getContext?: () => WebGL2RenderingContext;
      backend?: { getContext?: () => WebGL2RenderingContext; adapter?: GPUAdapter; device?: GPUDevice };
    };
    const data: Record<string, Json> = {
      rendererKind: ['webgl', 'webgpu-gl', 'webgpu'].includes(viewer.rendererKind) ? viewer.rendererKind : 'unknown',
      gpu: gpu ? { vendor: browserText(gpu.active.vendor), renderer: browserText(gpu.active.renderer), architecture: browserText(gpu.active.architecture) } : null,
      statistics: numbers(viewer.getRendererInfo(), ['triangles', 'drawCalls', 'geometries', 'textures', 'programs', 'materialsUnique', 'batchCount', 'batchInstances']),
      capabilities: null, capabilityStatus: 'unavailable', contextLost: null,
    };
    try {
      if (viewer.hasCompute) {
        // Three r185 retains the device, not the adapter used to create it.
        const device = renderer.backend?.device, adapter = renderer.backend?.adapter;
        const limits = device?.limits ?? adapter?.limits;
        if (limits) {
          data.capabilities = numbers(limits, ['maxTextureDimension2D', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize']);
          data.capabilityStatus = 'ok';
          data.capabilitySource = device ? 'device' : 'adapter';
        }
        const info = device?.adapterInfo;
        if (info) data.gpu = { vendor: browserText(info.vendor), renderer: browserText(info.device || info.description), architecture: browserText(info.architecture) };
      } else {
        const gl = renderer.getContext?.() ?? renderer.backend?.getContext?.();
        if (gl) {
          data.contextLost = gl.isContextLost();
          if (!data.contextLost) {
            data.capabilities = {
              maxTextureSize: numberOrNull(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
              maxRenderbufferSize: numberOrNull(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
              maxTextureUnits: numberOrNull(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)),
              maxSamples: numberOrNull(gl.getParameter(gl.MAX_SAMPLES)),
            };
            data.capabilityStatus = 'ok';
          } else data.capabilityStatus = 'context-lost';
        }
      }
    } catch { data.capabilityStatus = 'failed'; }
    return section('ok', 'GRAPHICS_COLLECTED', data);
  }
  async scene(signal: AbortSignal): Promise<Section> {
    const viewer = this.viewer, revision = this.revision, root = viewer.currentModelRoot;
    const snapshot = viewer.loading.getSnapshot();
    const phase = loadPhases.includes(snapshot.phase) ? snapshot.phase : 'unknown';
    const data: Record<string, Json> = {
      generation: revision, loaded: !!root,
      mode: ['hmi', 'viewer', 'planner', 'des', 'editor', 'commissioning'].includes(viewer.modes.activeMode ?? '') ? viewer.modes.activeMode : null,
      nodes: 0, meshes: 0, components: 0, activeAlarms: viewer.errorStore.getCount(),
      registeredSignals: viewer.signalStore?.registeredSignalCount ?? null,
      loading: { phase, ...numbers(snapshot, ['loaded', 'total', 'elapsedMs', 'previewMs']), timings: numbers(snapshot.timings, loadPhases) },
    };
    let nodes = 0, meshes = 0, components = 0;
    // Iterator frames keep memory O(depth), including roots with 100k children.
    const frames: { node: Object3D; next: number }[] = root ? [{ node: root, next: -1 }] : [];
    const started = performance.now();
    while (frames.length && nodes < DIAGNOSTIC_LIMITS.nodes) {
      abortIfNeeded(signal);
      if (revision !== this.revision || viewer.currentModelRoot !== root) return section('changed', 'SCENE_CHANGED');
      const frame = frames[frames.length - 1];
      if (frame.next === -1) {
        frame.next = 0; nodes++;
        if ((frame.node as Object3D & { isMesh?: boolean }).isMesh) meshes++;
        components += this.componentsOf(frame.node).length;
        if (nodes % 500 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          if (performance.now() - started >= DIAGNOSTIC_LIMITS.timeoutMs) break;
        }
      } else if (frame.next < frame.node.children.length) {
        frames.push({ node: frame.node.children[frame.next++], next: -1 });
      } else frames.pop();
    }
    abortIfNeeded(signal);
    if (revision !== this.revision || viewer.currentModelRoot !== root) return section('changed', 'SCENE_CHANGED');
    Object.assign(data, { nodes, meshes, components });
    return section(frames.length ? 'truncated' : 'ok', frames.length ? 'SCENE_LIMIT_REACHED' : 'SCENE_COLLECTED', data);
  }
}
