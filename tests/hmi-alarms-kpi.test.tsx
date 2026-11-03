// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ADR-0025 in the HMI: the alarm panel offers acknowledge / shelve by role and
 * reports them to the access audit; the history dialog exports CSV; the KPI bar
 * gets an entry only while the project defines KPIs; HMI configuration is saved
 * to the project when it is writable and to this browser otherwise.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { rvDarkTheme } from '../src/core/hmi/theme';
import { RVViewerProvider } from '../src/hooks/use-viewer';
import type { RVViewer } from '../src/core/rv-viewer';
import { ErrorStore } from '../src/core/engine/rv-error-store';
import { UIPluginRegistry } from '../src/core/rv-ui-registry';
import { setAppConfig } from '../src/core/rv-app-config';
import { setLocale } from '../src/core/i18n';
import { __setHmiSessionForTests, type HmiRole } from '../src/core/hmi/hmi-session-store';
import { alarmStoreFor, connectAlarmFeed } from '../src/core/hmi/alarm-runtime';
import { AlarmPanel } from '../src/plugins/web-error/alarm-panel';
import { HmiOperationsPlugin } from '../src/plugins/hmi-operations-plugin';
import { kpiEngineFor, showKpis } from '../src/plugins/hmi-operations/kpi-runtime';
import { parseKpiConfig } from '../src/core/hmi/kpi-engine';
import { loadHmiConfig, saveHmiConfig } from '../src/core/hmi/hmi-project-config';
import { getProjectStore } from '../src/core/project/project-store';

beforeAll(async () => { await setLocale('en-US'); });

const disconnects: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const d of disconnects.splice(0)) d();
  setAppConfig({});
  __setHmiSessionForTests({ status: 'disabled', username: null, role: null, csrf: null });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function makeViewer(signals: Record<string, number | boolean> = {}) {
  const errorStore = new ErrorStore();
  const viewer = {
    errorStore,
    uiRegistry: new UIPluginRegistry(),
    signalStore: { get: (name: string) => signals[name], getAll: () => new Map(Object.entries(signals)) },
    registry: { getNode: () => null, getComponentTypes: () => [] },
    selectionManager: { getSnapshot: () => ({ primaryPath: null }) },
    emit: () => {}, highlightByPath: () => {}, clearHighlight: () => {}, focusByPath: () => {}, filterDrives: () => {},
    getPlugin: () => undefined,
  } as unknown as RVViewer;
  disconnects.push(connectAlarmFeed(viewer as unknown as { errorStore: ErrorStore }));
  return { viewer, errorStore, signals };
}

function signIn(role: HmiRole) {
  setAppConfig({ services: { access: { url: '/api/access/v1' } } });
  __setHmiSessionForTests({ status: 'signed-in', username: `${role}1`, role, csrf: 'csrf-token' });
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPanel(viewer: RVViewer) {
  return render(
    <ThemeProvider theme={rvDarkTheme}>
      <RVViewerProvider value={viewer}><AlarmPanel viewer={viewer} /></RVViewerProvider>
    </ThemeProvider>,
  );
}

describe('alarm panel (ADR-0025)', () => {
  it('a viewer sees alarms but cannot acknowledge or shelve them', () => {
    const { viewer, errorStore } = makeViewer();
    signIn('viewer');
    errorStore.setActive('Line/Motor', true, 'Motor overload');
    renderPanel(viewer);
    expect(screen.getByText('Motor overload')).toBeTruthy();
    expect(screen.getByText(/Unacknowledged/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shelve 30 min' })).toBeNull();
  });

  it('an operator acknowledges; a latched alarm stays until acknowledged after return to normal; both are audited', async () => {
    const { viewer, errorStore } = makeViewer();
    const fetchMock = signIn('operator');
    errorStore.setActive('Line/Motor', true, 'Motor overload');
    renderPanel(viewer);
    expect(screen.queryByRole('button', { name: 'Shelve 30 min' })).toBeNull();

    // Returns to normal before anyone acknowledged it: latched, still shown.
    act(() => errorStore.setActive('Line/Motor', false, 'Motor overload'));
    expect(screen.getByText(/Returned · unacknowledged/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(screen.queryByText('Motor overload')).toBeNull();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/access/v1/audit-events');
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'alarm.ack', target: 'Line/Motor' });
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token');

    const history = alarmStoreFor(viewer).getSnapshot().history.map((e) => [e.kind, e.user]);
    expect(history).toEqual([['raise', null], ['clear', null], ['ack', 'operator1']]);
  });

  it('an engineer shelves and unshelves; the history dialog lists events and exports CSV', async () => {
    const { viewer, errorStore } = makeViewer();
    const fetchMock = signIn('engineer');
    errorStore.setActive('Line/Motor', true, 'Motor overload');
    errorStore.setActive('Line/Door', true, 'Door open');
    renderPanel(viewer);
    expect(screen.getByRole('button', { name: /Acknowledge all \(2\)/ })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Shelve 30 min' })[0]);
    const shelvedId = alarmStoreFor(viewer).getSnapshot().alarms.find((a) => a.state === 'shelved')!.id;
    fireEvent.click(screen.getByRole('button', { name: /^Unshelve:/ }));
    expect(alarmStoreFor(viewer).getSnapshot().alarms.every((a) => a.state !== 'shelved')).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const actions = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(actions).toEqual([
      expect.objectContaining({ action: 'alarm.shelve', target: shelvedId, detail: { minutes: 30 } }),
      expect.objectContaining({ action: 'alarm.unshelve', target: shelvedId }),
    ]);

    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { created.push(blob as Blob); return 'blob:csv'; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Alarm history' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Shelved').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const csv = await created[0].text();
    expect(csv.split('\n')[0]).toContain('time');
    expect(csv).toContain('shelve');
    expect(csv).toContain('engineer1');
  });
});

describe('configured KPIs (ADR-0025)', () => {
  it('the KPI bar gets an entry only while KPIs are defined, and sampling follows', () => {
    vi.useFakeTimers();
    try {
      const { viewer, signals } = makeViewer({ Temp: 20 });
      const plugin = new HmiOperationsPlugin();
      viewer.uiRegistry.register(plugin);
      expect(viewer.uiRegistry.getSlotComponents('kpi-bar')).toHaveLength(0);

      kpiEngineFor(viewer).configure(parseKpiConfig({ schemaVersion: 1, kpis: [{ id: 't', label: 'Temp', kind: 'value', signal: 'Temp' }] }).config);
      showKpis(plugin, viewer);
      expect(viewer.uiRegistry.getSlotComponents('kpi-bar')).toHaveLength(1);
      expect(viewer.uiRegistry.getSettingsTabs()).toHaveLength(1);
      signals.Temp = 42;
      vi.advanceTimersByTime(1000);
      expect(kpiEngineFor(viewer).getSnapshot()[0]).toMatchObject({ value: 42 });

      kpiEngineFor(viewer).configure(parseKpiConfig({ schemaVersion: 1, kpis: [] }).config);
      showKpis(plugin, viewer);
      expect(viewer.uiRegistry.getSlotComponents('kpi-bar')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(1); // only the alarm feed's shelving tick remains
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HMI configuration storage (ADR-0025)', () => {
  it('saves to this browser without a writable project and to the project when it is writable', async () => {
    const store = getProjectStore();
    vi.spyOn(store, 'getBackend').mockReturnValue(null);
    expect(await saveHmiConfig('hmi/kpis.json', { schemaVersion: 1, kpis: [] })).toBe('browser');
    expect(await loadHmiConfig('hmi/kpis.json')).toEqual({ value: { schemaVersion: 1, kpis: [] }, location: 'browser' });

    const files = new Map<string, Uint8Array>();
    const backend = {
      writable: true,
      readBlobBytes: async (path: string) => files.get(path) ?? null,
      writeBlob: async (path: string, blob: Blob) => { files.set(path, new Uint8Array(await blob.arrayBuffer())); },
      flush: vi.fn(async () => {}),
    };
    vi.spyOn(store, 'getBackend').mockReturnValue(backend as never);
    vi.spyOn(store, 'isWritable').mockReturnValue(true);
    expect(await saveHmiConfig('hmi/alarms.json', { schemaVersion: 1, defaultPriority: 'low', latch: false, alarms: {} })).toBe('project');
    expect(backend.flush).toHaveBeenCalledTimes(1);
    expect(await loadHmiConfig('hmi/alarms.json')).toEqual({ value: { schemaVersion: 1, defaultPriority: 'low', latch: false, alarms: {} }, location: 'project' });

    vi.spyOn(store, 'isWritable').mockReturnValue(false);
    expect(await saveHmiConfig('hmi/alarms.json', { schemaVersion: 1 })).toBe('browser');
  });
});
