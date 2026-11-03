// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ADR-0028 — the multiuser role comes from the HMI session where accounts exist.
 *
 * The rule (multiuser-role.ts) as a matrix, and the plugin behaviour that makes
 * it observable: what goes into `room_join`, that an observer sends no
 * write-class message, that a session change rejoins with the new role, and that
 * an Appliance deployment defaults to the guarded same-origin endpoint.
 * Server-side enforcement is covered by gateway/test/multiuser.test.mjs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { MultiuserPlugin, type MultiuserTransport } from '../src/plugins/multiuser-plugin';
import {
  effectiveMultiuserRole,
  multiuserRoleCeiling,
  normalizeMultiuserRole,
} from '../src/core/hmi/multiuser-role';
import { __setHmiSessionForTests, type HmiSessionSnapshot } from '../src/core/hmi/hmi-session-store';
import { setAppConfig } from '../src/core/rv-app-config';
import type { RVViewer } from '../src/core/rv-viewer';
import type { LoadResult } from '../src/core/engine/rv-scene-loader';
import { Scene } from 'three';

const session = (status: HmiSessionSnapshot['status'], role: HmiSessionSnapshot['role'] = null): HmiSessionSnapshot => ({
  status, role, username: role ? 'user' : null, csrf: role ? 'csrf' : null,
});

class MockTransport implements MultiuserTransport {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void { this.sent.push(JSON.parse(data)); }
  close(): void { this.readyState = 3; }
  open(): void { this.readyState = 1; this.onopen?.(); }
}

function joinedPlugin(requested: string) {
  setAppConfig({ egress: { mode: 'allow-listed', allow: [{ origin: 'ws://mock:7000', purposes: ['multiuser'] }] } });
  const plugin = new MultiuserPlugin();
  const transports: MockTransport[] = [];
  plugin.transportFactory = () => { const t = new MockTransport(); transports.push(t); return t; };
  (plugin as unknown as { viewer: RVViewer }).viewer = { signalStore: null, drives: [], emit: () => {} } as unknown as RVViewer;
  plugin.joinSession('ws://mock:7000', 'Tester', '#fff', requested);
  transports.at(-1)!.open();
  return { plugin, transports };
}

afterEach(() => {
  __setHmiSessionForTests(session('disabled'));
  setAppConfig({});
});

describe('multiuser role rule (ADR-0028)', () => {
  it('caps by the session where accounts exist and keeps the request where they do not', () => {
    expect(effectiveMultiuserRole('operator', session('disabled'))).toBe('operator');
    expect(effectiveMultiuserRole('observer', session('disabled'))).toBe('observer');
    expect(effectiveMultiuserRole('operator', session('signed-in', 'viewer'))).toBe('observer');
    for (const role of ['operator', 'engineer', 'admin'] as const) {
      expect(effectiveMultiuserRole('operator', session('signed-in', role))).toBe('operator');
      expect(effectiveMultiuserRole('observer', session('signed-in', role))).toBe('observer');
    }
    for (const status of ['loading', 'signed-out', 'error'] as const) {
      expect(effectiveMultiuserRole('operator', session(status))).toBe('observer');
    }
  });

  it('treats anything but "operator" as observer and reports no ceiling without accounts', () => {
    expect(normalizeMultiuserRole('admin')).toBe('observer');
    expect(normalizeMultiuserRole(undefined)).toBe('observer');
    expect(multiuserRoleCeiling(session('disabled'))).toBeNull();
    expect(multiuserRoleCeiling(session('signed-in', 'viewer'))).toBe('observer');
  });
});

describe('MultiuserPlugin under a session (ADR-0028)', () => {
  it('a viewer asking for operator joins as observer and sends no writes', () => {
    __setHmiSessionForTests(session('signed-in', 'viewer'));
    const { plugin, transports } = joinedPlugin('operator');
    expect(transports[0].sent[0]).toMatchObject({ type: 'room_join', role: 'observer' });
    expect(plugin.localRole).toBe('observer');

    plugin.writeSignal('Cell/Signals/Start', true);
    plugin.jogDrive('Cell/Conveyor', true);
    plugin.stopDrive('Cell/Conveyor');
    plugin.toggleSharedView(true);
    plugin.sendCursorRay([0, 0, 0], [0, 0, 1]);
    expect(transports[0].sent.map((m) => m.type)).toEqual(['room_join', 'cursor_ray']);
    expect(plugin.isSharedViewOperator).toBe(false);
    plugin.leaveSession();
  });

  it('an operator session keeps the operator role and may write', () => {
    __setHmiSessionForTests(session('signed-in', 'operator'));
    const { plugin, transports } = joinedPlugin('operator');
    expect(transports[0].sent[0]).toMatchObject({ type: 'room_join', role: 'operator' });
    plugin.writeSignal('Cell/Signals/Start', true);
    expect(transports[0].sent.at(-1)).toEqual({ type: 'signal_write', signalPath: 'Cell/Signals/Start', value: true });
    plugin.leaveSession();
  });

  it('a session that resolves after an URL auto-join rejoins with the new role', () => {
    __setHmiSessionForTests(session('loading'));
    const { plugin, transports } = joinedPlugin('operator');
    expect(transports[0].sent[0]).toMatchObject({ role: 'observer' });

    __setHmiSessionForTests(session('signed-in', 'engineer'));
    expect(plugin.localRole).toBe('operator');
    expect(transports).toHaveLength(2);
    transports[1].open();
    expect(transports[1].sent[0]).toMatchObject({ type: 'room_join', role: 'operator' });

    __setHmiSessionForTests(session('signed-out'));
    expect(plugin.localRole).toBe('observer');
    expect(transports).toHaveLength(3);
    plugin.leaveSession();
  });
});

describe('default multiuser server (ADR-0028)', () => {
  function defaultUrl(): string {
    const plugin = new MultiuserPlugin();
    (plugin as unknown as { viewer: RVViewer }).viewer = {
      scene: new Scene(), camera: null, getPlugin: () => undefined, signalStore: null, drives: [], emit: () => {},
    } as unknown as RVViewer;
    (plugin as unknown as { onStart(result: LoadResult): void }).onStart({} as LoadResult);
    const url = plugin.serverUrl;
    plugin.leaveSession();
    return url;
  }

  it('uses the guarded same-origin endpoint when the deployment names one', () => {
    setAppConfig({ services: { multiuser: { url: '/gateway/multiuser' } } });
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    expect(defaultUrl()).toBe(`${scheme}://${window.location.host}/gateway/multiuser`);
  });

  it('keeps the Unity port 7000 default elsewhere', () => {
    setAppConfig({});
    expect(defaultUrl()).toBe(`ws://${window.location.hostname || 'localhost'}:7000`);
  });
});
