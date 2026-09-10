// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAppConfig } from '../src/core/rv-app-config';
import { runtimeFetch, openRuntimeUrl } from '../src/core/deployment/runtime-egress';
import { createEgressLoadingManager } from '../src/core/deployment/egress-loading-manager';
import { connectRestFetch } from '../src/core/hmi/connect-rest';
import { MqttInterface } from '../src/interfaces/mqtt-interface';
import { INTERFACE_DEFAULTS } from '../src/interfaces/interface-settings-store';
import { canInitializeTeams } from '../src/core/deployment/teams-egress';
import { fetchSharedGlb } from '../src/core/share/rv-share-fetch';

beforeEach(() => setAppConfig({ egress: { mode: 'deny-external', allow: [] } }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); setAppConfig({}); });

describe('runtime offline boundaries', () => {
  it('requires the Teams SDK configuration origin and its collaboration purpose', () => {
    expect(canInitializeTeams()).toBe(false);
    setAppConfig({ egress: { mode: 'allow-listed', allow: [{ origin: 'https://res.cdn.office.net', purposes: ['news'] }] } });
    expect(canInitializeTeams()).toBe(false);
    setAppConfig({ egress: { mode: 'allow-listed', allow: [{ origin: 'https://res.cdn.office.net', purposes: ['multiuser'] }] } });
    expect(canInitializeTeams()).toBe(true);
  });

  it('does not disguise a blocked share request as a CORS error or call its injected transport', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchSharedGlb('https://share.example.test/model.glb', { fetchImpl }))
      .rejects.toMatchObject({ code: 'EGRESS_BLOCKED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks both CONNECT reads and writes before fetch', async () => {
    const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    await expect(connectRestFetch('https://gateway.example.test/status')).rejects.toMatchObject({ code: 'EGRESS_BLOCKED' });
    await expect(connectRestFetch('https://gateway.example.test/signals', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'EGRESS_BLOCKED' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('allows same-origin I/O with redirect refusal', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('ok')); vi.stubGlobal('fetch', transport);
    await runtimeFetch('/local.glb', 'remote-model');
    expect(transport).toHaveBeenCalledWith('/local.glb', { redirect: 'error' });
  });

  it('checks nested model resource URLs before Three.js can request them', () => {
    const manager = createEgressLoadingManager();
    expect(() => manager.resolveURL('https://assets.example.test/texture.png')).toThrow('deployment policy');
    expect(manager.resolveURL('data:application/octet-stream;base64,AAAA')).toContain('data:');
    expect(manager.resolveURL('/draco/draco_decoder.wasm')).toBe('/draco/draco_decoder.wasm');
  });

  it('blocks an external popup before opening a tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openRuntimeUrl('https://orders.example.test/basket', 'share')).toThrow('deployment policy');
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects MQTT before module connection and does not schedule reconnect', async () => {
    vi.useFakeTimers();
    const mqtt = new MqttInterface();
    try {
      await expect(mqtt.connect({ ...INTERFACE_DEFAULTS, mqttBrokerUrl: 'wss://broker.example.test/mqtt', autoConnect: true }))
        .rejects.toMatchObject({ code: 'EGRESS_BLOCKED' });
      expect(vi.getTimerCount()).toBe(0);
    } finally { mqtt.dispose(); }
  });
});
