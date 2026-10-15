// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { collectReport, collectSection } from '../src/core/diagnostics/collect';
import { ViewerDiagnosticSource } from '../src/core/diagnostics/viewer-source';
import { DiagnosticSession } from '../src/core/diagnostics/session';
import { DIAGNOSTIC_LIMITS, section } from '../src/core/diagnostics/types';
import type { RVViewer } from '../src/core/rv-viewer';
import { createDiagnosticDownload, finalizeReport } from '../src/core/diagnostics/export';
import { getComponentInstances } from '../src/core/engine/rv-component-registry';
function viewer(root: Group | null) { return { currentModelRoot: root, loading: { getSnapshot: () => ({ phase: 'ready', loaded: 42, total: 42, timings: {}, elapsedMs: 10 }) }, modes: { activeMode: 'hmi' }, errorStore: { getCount: () => 0 }, signalStore: null } as unknown as RVViewer; }
describe('bounded read-only diagnostic collection', () => {
  it('exports useful environment without a Viewer and honors scope exclusions', async () => {
    const report = await collectReport({ logs: false, scene: false }, new AbortController().signal, new DiagnosticSession());
    expect(report.environment.status).toBe('ok'); expect(report.graphics.status).toBe('unavailable'); expect(report.scene.status).toBe('excluded'); expect(report.logs).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(location.origin);
  });
  it('collects and packages with network, storage writes and active GPU probes forbidden', async () => {
    const calls = [
      vi.spyOn(window, 'fetch'), vi.spyOn(XMLHttpRequest.prototype, 'open'),
      vi.spyOn(Storage.prototype, 'setItem'), vi.spyOn(indexedDB, 'open'),
      vi.spyOn(navigator.storage, 'getDirectory'),
      ...(navigator.gpu ? [vi.spyOn(navigator.gpu, 'requestAdapter')] : []),
    ];
    const connect = vi.fn(() => { throw new Error('Unexpected connection'); });
    vi.stubGlobal('WebSocket', connect);
    for (const call of calls) call.mockImplementation(() => { throw new Error('Unexpected IO'); });
    try {
      const stub = viewer(new Group()) as any;
      Object.assign(stub, { rendererKind: 'webgl', hasCompute: false, renderer: {}, getGPUInfo: () => null, getRendererInfo: () => ({ triangles: 0 }) });
      const session = new DiagnosticSession(); session.attach(new ViewerDiagnosticSource(stub, getComponentInstances));
      const report = finalizeReport(await collectReport({ logs: true, scene: true }, new AbortController().signal, session));
      const download = await createDiagnosticDownload(report, new AbortController().signal);
      expect(download.fallback).toBe(false); expect(report.scene.status).toBe('ok');
      for (const call of calls) expect(call).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
  it('isolates exceptions, deadlines and cancellation', async () => {
    expect((await collectSection(() => { throw new Error('fixture-secret'); }, new AbortController().signal)).code).toBe('COLLECTION_FAILED');
    expect((await collectSection(() => new Promise(() => {}), new AbortController().signal, 10)).status).toBe('timeout');
    const controller = new AbortController(); const pending = collectSection(() => new Promise(() => {}), controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('discards a scene collected across a generation change', async () => {
    const session = new DiagnosticSession(); let generation = 1;
    session.attach({ generation: () => generation, graphics: () => section('ok', 'GRAPHICS'), scene: async () => { generation++; return section('ok', 'SCENE', { nodes: 1 }); } });
    const report = await collectReport({ logs: false, scene: true }, new AbortController().signal, session);
    expect(report.scene).toEqual(section('changed', 'SCENE_CHANGED'));
  });
  it('counts empty/loaded scenes without exporting names or userData', async () => {
    const root = new Group(); root.name = 'fixture-customer'; root.userData.secret = 'fixture-secret'; root.add(new Group());
    const source = new ViewerDiagnosticSource(viewer(root), getComponentInstances);
    const result = await source.scene(new AbortController().signal);
    expect(result.data?.nodes).toBe(2); expect(JSON.stringify(result)).not.toContain('fixture-');
    const empty = await new ViewerDiagnosticSource(viewer(null), getComponentInstances).scene(new AbortController().signal);
    expect(empty.data?.loaded).toBe(false); expect(empty.data?.nodes).toBe(0);
  });
  it('yields while counting a large scene, supports cancellation and caps work', async () => {
    const root = new Group(), leaf = new Group();
    root.children = Array.from({ length: DIAGNOSTIC_LIMITS.nodes + 1 }, () => leaf);
    const source = new ViewerDiagnosticSource(viewer(root), getComponentInstances);
    const controller = new AbortController(); const pending = source.scene(controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const start = performance.now();
    const result = await source.scene(new AbortController().signal);
    expect(result.status).toBe('truncated'); expect(result.data?.nodes).toBeLessThanOrEqual(DIAGNOSTIC_LIMITS.nodes);
    console.info(`[diagnostics-test] bounded 100001-child scene: ${Math.round(performance.now() - start)} ms; nodes=${result.data?.nodes}`);
  });
  it('reports a real backend separately from WebGPU renderer GL fallback', () => {
    const stub = viewer(null) as any;
    Object.assign(stub, { rendererKind: 'webgpu-gl', hasCompute: false, renderer: {}, getGPUInfo: () => null, getRendererInfo: () => ({ triangles: 10 }) });
    const result = new ViewerDiagnosticSource(stub, getComponentInstances).graphics();
    expect(result.data?.rendererKind).toBe('webgpu-gl'); expect(result.data?.capabilityStatus).toBe('unavailable');
  });
  it('reads WebGPU device capabilities without requesting another adapter', () => {
    const stub = viewer(null) as any;
    Object.assign(stub, { rendererKind: 'webgpu', hasCompute: true, renderer: { backend: { device: { limits: { maxTextureDimension2D: 8192 }, adapterInfo: { vendor: 'test-gpu', device: 'test-device' } } } }, getGPUInfo: () => null, getRendererInfo: () => ({ triangles: 10 }) });
    const result = new ViewerDiagnosticSource(stub, getComponentInstances).graphics();
    expect(result.data?.capabilityStatus).toBe('ok'); expect(result.data?.capabilitySource).toBe('device');
    expect(result.data?.gpu).toMatchObject({ vendor: 'test-gpu', renderer: 'test-device' });
  });
});
