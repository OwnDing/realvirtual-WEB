// SPDX-License-Identifier: AGPL-3.0-only
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginGatePlugin } from '../src/plugins/login-gate-plugin';
import type { AccessSession } from '../src/access/client';
import type { RVViewer } from '../src/core/rv-viewer';
import { initI18n } from '../src/core/i18n';
import { createTestViewer, type TestViewerHandle } from './helpers/create-test-viewer';

const accessRequest = vi.hoisted(() => vi.fn());
vi.mock('../src/access/client', () => ({ accessRequest, accessWrite: vi.fn() }));

const admin: AccessSession = { username: 'admin', role: 'admin', shareId: null, csrf: '', expiresAt: 0 };
let pending: Array<(session: AccessSession) => void>;
let plugins: LoginGatePlugin[];
let handle: TestViewerHandle | undefined;

beforeEach(() => {
  initI18n();
  pending = [];
  plugins = [];
  accessRequest.mockReset().mockImplementation(() => new Promise<AccessSession>(resolve => pending.push(resolve)));
});

afterEach(async () => {
  await act(async () => {
    plugins.forEach(plugin => plugin.dispose());
    handle?.dispose();
    pending.forEach(resolve => resolve(admin));
  });
  handle = undefined;
});

function makePlugin() {
  const plugin = new LoginGatePlugin();
  plugins.push(plugin);
  return plugin;
}

function gateState(gate: Promise<void>) {
  const state = { outcome: 'pending', error: undefined as unknown };
  void gate.then(() => { state.outcome = 'released'; }, error => { state.outcome = 'cancelled'; state.error = error; });
  return state;
}

describe('login gate lifecycle', () => {
  it.each(['remove plugin', 'dispose viewer'])('cancels a real pending model load on %s', async action => {
    handle = await createTestViewer();
    const { viewer } = handle;
    const plugin = makePlugin();
    viewer.use(plugin);
    await act(async () => { plugin.installGate(viewer); });

    // Invalid bytes would fail parsing if teardown accidentally released the gate.
    // The real loadModel must instead reject before the parser is reached.
    const load = viewer.loadModel('blocked.glb', { data: new ArrayBuffer(0) });
    let outcome: unknown = 'pending';
    void load.then(() => { outcome = 'loaded'; }, error => { outcome = error; });
    await act(async () => {});
    expect(outcome).toBe('pending');

    await act(async () => {
      if (action === 'remove plugin') expect(viewer.removePlugin(plugin.id)).toBe(true);
      else handle!.dispose();
    });
    await expect.poll(() => (outcome as Error)?.name).toBe('AbortError');
    await act(async () => { pending.forEach(resolve => resolve(admin)); });
    expect((outcome as Error).name).toBe('AbortError');
    expect(document.getElementById('rv-login-gate-root')).toBeNull();
  });

  it('releases the gate only for an unscoped administrator session', async () => {
    const plugin = makePlugin();
    const viewer = { loadGate: null } as unknown as RVViewer;
    await act(async () => { plugin.installGate(viewer); });
    const state = gateState(viewer.loadGate!);
    await act(async () => { pending.forEach(resolve => resolve(admin)); });
    expect(state.outcome).toBe('released');
    expect(document.getElementById('rv-login-gate-root')).toBeNull();
    plugin.dispose();
    expect(state.outcome).toBe('released');
  });

  it.each([
    { ...admin, role: 'visitor' as const },
    { ...admin, shareId: 'scoped-share' },
  ])('keeps unauthorized sessions blocked until cancellation: %j', async session => {
    const plugin = makePlugin();
    const viewer = { loadGate: null } as unknown as RVViewer;
    await act(async () => { plugin.installGate(viewer); });
    const state = gateState(viewer.loadGate!);
    await act(async () => { pending.forEach(resolve => resolve(session)); });
    expect(state.outcome).toBe('pending');
    await act(async () => { plugin.dispose(); });
    expect(state.outcome).toBe('cancelled');
    expect(state.error).toMatchObject({ name: 'AbortError' });
  });

  it('cancels a replaced gate and ignores its late authentication responses', async () => {
    const plugin = makePlugin();
    const viewer = { loadGate: null } as unknown as RVViewer;
    await act(async () => { plugin.installGate(viewer); });
    const first = gateState(viewer.loadGate!);
    const previousRequests = pending.splice(0);
    await act(async () => { plugin.installGate(viewer); });
    const replacement = gateState(viewer.loadGate!);
    expect(first.outcome).toBe('cancelled');
    expect(first.error).toMatchObject({ name: 'AbortError' });
    await act(async () => { previousRequests.forEach(resolve => resolve(admin)); });
    expect(replacement.outcome).toBe('pending');
    await act(async () => { pending.forEach(resolve => resolve(admin)); });
    expect(replacement.outcome).toBe('released');
  });

  it('handles cancellation before a consumer awaits, and rejects reuse after disposal', async () => {
    const plugin = makePlugin();
    const viewer = { loadGate: null } as unknown as RVViewer;
    await act(async () => { plugin.installGate(viewer); });
    const gate = viewer.loadGate!;
    await act(async () => { plugin.dispose(); plugin.dispose(); });
    // Allow the browser to report unhandledrejection before attaching a late consumer.
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(gate).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => plugin.installGate(viewer)).toThrow();
    expect(viewer.loadGate).toBe(gate);
    expect(document.getElementById('rv-login-gate-root')).toBeNull();
  });
});
