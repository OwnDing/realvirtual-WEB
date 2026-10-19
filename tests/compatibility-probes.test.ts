// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedCheck, checkDirectoryPermission, probeOpfs, probeWebgl, probeWebgpu, probeXr, runEnvironmentCheck } from '../src/core/compatibility/probes.mjs';
import matrix from '../src/core/compatibility/support-matrix.json';
afterEach(() => vi.restoreAllMocks());
function storageFixture() {
  let contents = '';
  const writer = { write: vi.fn(async (text: string) => { contents = text; }), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  const file = { createWritable: vi.fn(async () => writer), getFile: vi.fn(async () => ({ text: async () => contents })) };
  const root = { getFileHandle: vi.fn(async (_name: string, _options: object) => file), removeEntry: vi.fn(async () => {}) };
  return { storage: { getDirectory: vi.fn(async () => root) } as any, root, file, writer };
}
describe('explicit compatibility checks', () => {
  it('round trips a real isolated OPFS file and leaves no diagnostic files', async () => {
    const root = await navigator.storage.getDirectory();
    const names = async () => { const result: string[] = []; for await (const name of (root as any).keys()) if (name.startsWith('.xyvirtual-compatibility-')) result.push(name); return result.sort(); };
    const before = await names(); expect((await probeOpfs(navigator.storage)).code).toBe('OPFS_ROUNDTRIP_OK'); expect(await names()).toEqual(before);
  });
  it('cleans after write rejection and records quota/cleanup failures without error text', async () => {
    const f = storageFixture();
    f.writer.write.mockRejectedValue(new DOMException('fixture-secret', 'QuotaExceededError'));
    expect(await probeOpfs(f.storage)).toEqual({ status: 'fail', code: 'OPFS_QUOTA_EXCEEDED' });
    expect(f.writer.abort).toHaveBeenCalledOnce(); expect(f.root.removeEntry).toHaveBeenCalledOnce();
    expect(f.root.getFileHandle.mock.calls[0][0]).toMatch(/^\.xyvirtual-compatibility-/);
    f.root.removeEntry.mockRejectedValue(new DOMException('fixture-secret', 'NotAllowedError'));
    expect((await probeOpfs(f.storage)).code).toBe('OPFS_CLEANUP_FAILED');
  });
  it('times out without reporting success and cleans a late-created file', async () => {
    const f = storageFixture(); let finish!: (value: any) => void;
    f.root.getFileHandle.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const result = await boundedCheck(signal => probeOpfs(f.storage, signal), undefined, 20);
    expect(result.code).toBe('CHECK_TIMEOUT'); finish(f.file);
    await vi.waitFor(() => expect(f.root.removeEntry).toHaveBeenCalledOnce());
    expect(f.file.createWritable).not.toHaveBeenCalled();
  });
  it('does not create files if cancellation occurs while resolving the root', async () => {
    const f = storageFixture(); let finish!: (value: any) => void; const controller = new AbortController();
    f.storage.getDirectory.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = probeOpfs(f.storage, controller.signal); controller.abort(); finish(f.root);
    expect((await pending).code).toBe('CHECK_CANCELLED'); expect(f.root.getFileHandle).not.toHaveBeenCalled();
  });
  it('releases real WebGL contexts and reports unsupported contexts', () => {
    expect(probeWebgl().code).toBe('WEBGL2_RENDER_OK');
    const documentObject = { createElement: () => ({ getContext: () => null }) } as any;
    expect(probeWebgl(documentObject).code).toBe('WEBGL2_UNAVAILABLE');
  });
  it('handles missing WebGPU, absent adapters and failed initialization', async () => {
    expect((await probeWebgpu(undefined)).code).toBe('WEBGPU_API_MISSING');
    expect((await probeWebgpu({ requestAdapter: async () => null } as any)).code).toBe('WEBGPU_ADAPTER_MISSING');
    expect((await probeWebgpu({ requestAdapter: async () => ({ requestDevice: async () => { throw new Error('fixture-secret'); } }) } as any)).code).toBe('WEBGPU_INITIALIZATION_FAILED');
  });
  it('destroys a device that arrives after timeout', async () => {
    let finish!: (value: any) => void; const destroy = vi.fn();
    const gpu = { requestAdapter: async () => ({ requestDevice: () => new Promise(resolve => { finish = resolve; }) }) } as any;
    const result = await boundedCheck(signal => probeWebgpu(gpu, signal), undefined, 20);
    expect(result.code).toBe('CHECK_TIMEOUT'); finish({ destroy });
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
  });
  it('reports XR permission failures without starting any session', async () => {
    const xr = { isSessionSupported: vi.fn(async () => { throw new DOMException('fixture-secret', 'SecurityError'); }), requestSession: vi.fn() };
    expect((await probeXr(xr as any, 'immersive-vr')).code).toBe('WEBXR_POLICY_BLOCKED'); expect(xr.requestSession).not.toHaveBeenCalled();
  });
  it('folder permission checks neither write nor retain the selected handle', async () => {
    const handle = { queryPermission: vi.fn(async () => 'granted'), getFileHandle: vi.fn() };
    const windowObject = { showDirectoryPicker: vi.fn(async () => handle) };
    expect(await checkDirectoryPermission(windowObject as any)).toEqual({ status: 'pass', code: 'DIRECTORY_PERMISSION_GRANTED' });
    expect(handle.getFileHandle).not.toHaveBeenCalled(); expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    windowObject.showDirectoryPicker.mockRejectedValue(new DOMException('fixture-secret', 'AbortError'));
    expect((await checkDirectoryPermission(windowObject as any)).code).toBe('DIRECTORY_CANCELLED');
  });
  it('does no network, socket, directory prompting or storage write for a viewer check', async () => {
    const fetch = vi.spyOn(window, 'fetch').mockRejectedValue(new Error('Forbidden I/O'));
    const storage = vi.spyOn(navigator.storage, 'getDirectory');
    const sockets = vi.spyOn(window, 'WebSocket');
    const report = await runEnvironmentCheck({ matrix });
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(sockets).not.toHaveBeenCalled();
    expect(report.assessment.certification).toBe('unverified'); expect(report.checks.secureContext.code).toBe('PRODUCTION_HTTPS_REQUIRED');
    const serialized = JSON.stringify(report); expect(serialized).not.toContain(location.origin); expect(serialized).not.toContain(navigator.userAgent);
    expect(report.environment.osRelease).toBeNull(); expect(report.environment.arch).toBeNull();
  });
});
