// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { describe, expect, it } from 'vitest';
import { collectNetworkSinks, assertNetworkBoundaries } from '../scripts/assert-network-boundaries.mjs';

describe('native network sink gate', () => {
  it.each(['fetch(config.url)', 'window.fetch(config.url)', 'const transport = fetch;', 'const transport = globalThis.fetch;', 'new WebSocket(config.url)',
    'new XMLHttpRequest()', 'new EventSource(url)', 'new Worker(url)', 'navigator.sendBeacon(url, payload)',
    'window.open(url)', 'import(url)', 'new GLTFLoader()', 'window["fetch"](url)'])('rejects a new dynamic sink: %s', (source) => {
    const sinks = collectNetworkSinks('src/example.ts', source);
    expect(sinks.length).toBeGreaterThan(0);
    expect(() => assertNetworkBoundaries(sinks, [])).toThrow('unaudited');
  });
  it('checks inline scripts in production HTML entries and preserves source lines', () => {
    const sinks = collectNetworkSinks('teams-config.html', '<!doctype html>\n<script type="module">\nfetch(url);\n</script>');
    expect(sinks).toHaveLength(1);
    expect(sinks[0]).toMatchObject({ file: 'teams-config.html', line: 3, api: 'fetch' });
    expect(() => assertNetworkBoundaries(sinks, [])).toThrow('unaudited');
  });
  it('accepts policy wrappers and rejects changed or stale audited native calls', () => {
    expect(collectNetworkSinks('src/example.ts', "runtimeFetch(url, 'news'); new GLTFLoader(createEgressLoadingManager());")).toEqual([]);
    const original = collectNetworkSinks('src/example.ts', "fetch('/settings.json', { redirect: 'error' })");
    const reviewed = original.map((sink) => ({ ...sink, reason: 'Bootstrap reads only deployment settings with redirect refusal.' }));
    expect(() => assertNetworkBoundaries(original, reviewed)).not.toThrow();
    expect(() => assertNetworkBoundaries(collectNetworkSinks('src/example.ts', 'fetch(config.url)'), reviewed)).toThrow('unaudited');
    expect(() => assertNetworkBoundaries([], reviewed)).toThrow('stale');
  });
});
