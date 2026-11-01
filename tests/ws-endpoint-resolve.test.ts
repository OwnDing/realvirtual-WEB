// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { resolveWsEndpoint } from '../src/interfaces/websocket-realtime-interface';

const settings = { wsAddress: 'plc-gw.local', wsPort: 7000, wsUseSSL: false };

describe('WebSocket Realtime endpoint resolution (ADR-0023)', () => {
  it('uses an explicit address, port and scheme unchanged', () => {
    expect(resolveWsEndpoint(settings, { hostname: 'hmi.example', port: '', protocol: 'https:' }))
      .toEqual({ scheme: 'ws', address: 'plc-gw.local', port: 7000 });
    expect(resolveWsEndpoint({ ...settings, wsUseSSL: true }, null)).toEqual({ scheme: 'wss', address: 'plc-gw.local', port: 7000 });
  });

  it('follows the page for an empty address (the Appliance same-origin preset)', () => {
    const preset = { wsAddress: '', wsPort: 0, wsUseSSL: false };
    expect(resolveWsEndpoint(preset, { hostname: 'appliance.plant', port: '', protocol: 'https:' }))
      .toEqual({ scheme: 'wss', address: 'appliance.plant', port: 443 });
    expect(resolveWsEndpoint(preset, { hostname: 'appliance.plant', port: '8443', protocol: 'https:' }))
      .toEqual({ scheme: 'wss', address: 'appliance.plant', port: 8443 });
    expect(resolveWsEndpoint(preset, { hostname: 'localhost', port: '5173', protocol: 'http:' }))
      .toEqual({ scheme: 'ws', address: 'localhost', port: 5173 });
    // A configured port wins even when the host follows the page.
    expect(resolveWsEndpoint({ ...preset, wsPort: 5200 }, { hostname: 'h', port: '', protocol: 'http:' }).port).toBe(5200);
  });

  it('treats a whitespace-only address as empty', () => {
    expect(resolveWsEndpoint({ wsAddress: '  ', wsPort: 0, wsUseSSL: false }, { hostname: 'h', port: '', protocol: 'http:' }).address).toBe('h');
  });
});
