// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0024: the browser's HMI session, role → capability, and the read-only client. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAppConfig } from '../src/core/rv-app-config';
import {
  __setHmiSessionForTests, hmiCan, hmiSessionStore, initHmiSession, logoutHmi, reportHmiEvent,
} from '../src/core/hmi/hmi-session-store';
import { BaseIndustrialInterface, type SignalDescriptor } from '../src/interfaces/base-industrial-interface';
import { SignalStore } from '../src/core/engine/rv-signal-store';
import type { InterfaceSettings } from '../src/interfaces/interface-settings-store';
import type { LoadResult } from '../src/core/engine/rv-scene-loader';
import type { RVViewer } from '../src/core/rv-viewer';

const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  setAppConfig({});
  __setHmiSessionForTests({ status: 'disabled', username: null, role: null, csrf: null });
  vi.restoreAllMocks();
});

describe('HMI session (ADR-0024)', () => {
  it('stays disabled and grants everything where the deployment has no accounts', async () => {
    const fetchImpl = vi.fn();
    expect((await initHmiSession(fetchImpl as unknown as typeof fetch)).status).toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const capability of ['write-signals', 'force-signals', 'save-server-projects', 'manage-users'] as const) expect(hmiCan(capability)).toBe(true);
  });

  it('maps each role to exactly its capabilities', async () => {
    setAppConfig({ services: { access: { url: '/api/access/v1' } } });
    const expected = {
      viewer: [false, false, false, false, false, false, false],
      operator: [true, false, false, false, true, false, false],
      engineer: [true, true, true, false, true, true, true],
      admin: [true, true, true, true, true, true, true],
    } as const;
    for (const [role, grants] of Object.entries(expected)) {
      const fetchImpl = vi.fn(async () => json(200, { username: `u-${role}`, role, csrf: 'c' }));
      const snapshot = await initHmiSession(fetchImpl as unknown as typeof fetch);
      expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe('/api/access/v1/session');
      expect(snapshot).toMatchObject({ status: 'signed-in', role, username: `u-${role}` });
      expect((['write-signals', 'force-signals', 'save-server-projects', 'manage-users', 'ack-alarms', 'shelve-alarms', 'configure-hmi'] as const).map((c) => hmiCan(c))).toEqual(grants);
    }
  });

  it('denies everything while loading, when signed out, for a visitor and on errors', async () => {
    setAppConfig({ services: { access: { url: '/api/access/v1' } } });
    let release: (r: Response) => void = () => {};
    const pending = initHmiSession((() => new Promise<Response>((resolve) => { release = resolve; })) as unknown as typeof fetch);
    expect(hmiSessionStore.getSnapshot().status).toBe('loading');
    expect(hmiCan('write-signals')).toBe(false);
    release(json(401, { error: { code: 'UNAUTHENTICATED' } }));
    expect((await pending).status).toBe('signed-out');
    expect(hmiCan('write-signals')).toBe(false);
    expect((await initHmiSession((async () => json(200, { username: 'guest', role: 'visitor', csrf: 'c' })) as unknown as typeof fetch)).status).toBe('signed-out');
    expect((await initHmiSession((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).status).toBe('error');
    expect(hmiCan('write-signals')).toBe(false);
  });

  it('reports force events with the session CSRF token and logs out to /login/', async () => {
    setAppConfig({ services: { access: { url: '/api/access/v1' } } });
    __setHmiSessionForTests({ status: 'signed-in', username: 'eng', role: 'engineer', csrf: 'csrf-1' });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await reportHmiEvent('signal.force', 'Start', { value: true }, fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/access/v1/audit-events');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-1');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'signal.force', target: 'Start', detail: { value: true } });
    const navigate = vi.fn();
    await logoutHmi(vi.fn(async () => json(200, {})) as unknown as typeof fetch, navigate);
    expect(navigate).toHaveBeenCalledWith('/login/');
    expect(hmiSessionStore.getSnapshot().status).toBe('signed-out');
    expect(await reportHmiEvent('signal.force', 'Start', {}, fetchImpl as unknown as typeof fetch)).toBe(false);
  });
});

class RecordingInterface extends BaseIndustrialInterface {
  readonly id = 'recording';
  readonly protocolName = 'Recording';
  readonly sent: Record<string, boolean | number>[] = [];
  protected async doConnect(): Promise<void> {}
  protected doDisconnect(): void {}
  protected sendSignals(signals: Record<string, boolean | number>): void { this.sent.push(signals); }
  protected async doDiscoverSignals(): Promise<SignalDescriptor[]> {
    return [{ name: 'Start', type: 'bool', direction: 'input', initialValue: false }];
  }
}

describe('a viewer session is a read-only industrial client', () => {
  it('sends no outgoing signal for a viewer and sends them for an operator', async () => {
    setAppConfig({ services: { access: { url: '/api/access/v1' } } });
    const store = new SignalStore();
    const iface = new RecordingInterface();
    iface.onModelLoaded({} as LoadResult, { signalStore: store, emit: () => {}, setConnectionState: () => {} } as unknown as RVViewer);
    await iface.connect({} as InterfaceSettings);
    __setHmiSessionForTests({ status: 'signed-in', username: 'v', role: 'viewer', csrf: 'c' });
    store.set('Start', true);
    iface.onFixedUpdatePost(0.02);
    expect(iface.sent).toEqual([]);
    __setHmiSessionForTests({ status: 'signed-in', username: 'o', role: 'operator', csrf: 'c' });
    store.set('Start', false);
    iface.onFixedUpdatePost(0.02);
    expect(iface.sent).toEqual([{ Start: false }]);
  });
});
