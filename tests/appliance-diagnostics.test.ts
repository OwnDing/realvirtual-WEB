// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { runDiagnostics } from '../appliance/runtime/static/diagnostics/diagnostics.mjs';
import diagnosticStyles from '../appliance/runtime/static/diagnostics/diagnostics.css?raw';
import { brandCssVariables, resolveDeploymentBrand } from '../src/core/deployment/brand-config.mjs';

function luminance(rgb: number[]): number {
  return rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function background(node: Element): number[] {
  const color = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)!.map(Number);
  const alpha = color[3] ?? 1;
  const behind = node.parentElement ? background(node.parentElement) : [255, 255, 255];
  return color.slice(0, 3).map((value, index) => value * alpha + behind[index] * (1 - alpha));
}

describe('appliance browser diagnostics', () => {
  it.each([undefined, { surfaceColor: '#18232b', textColor: '#eeeeee', mutedTextColor: '#bcc9d2' }])('keeps diagnostic text readable with default and customer branding %j', theme => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    try {
      const brand = resolveDeploymentBrand({ schemaVersion: 2, branding: { schemaVersion: 1, theme } });
      const variables = Object.entries(brandCssVariables(brand)).map(([key, value]) => `${key}:${value}`).join(';');
      const doc = frame.contentDocument!;
      doc.open(); doc.write(`<style>${diagnosticStyles}:root{${variables}}</style><main>
        <header><p>Environment checks</p></header><section class="toolbar"><span>Ready</span></section>
        <section class="results"><article class="result pass"><h2>WebGL</h2><span class="pill">pass</span><p>Available</p></article></section>
        <aside>Certificate context</aside></main>`); doc.close();
      for (const selector of ['header p', '.toolbar span', '.result h2', '.pill', '.result p', 'aside']) {
        const node = doc.querySelector(selector)!;
        const text = luminance(getComputedStyle(node).color.match(/[\d.]+/g)!.map(Number).slice(0, 3));
        const surface = luminance(background(node));
        expect((Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05), selector).toBeGreaterThanOrEqual(4.5);
      }
      expect(getComputedStyle(doc.querySelector('.result')!).borderLeftColor).toBe('rgb(27, 155, 105)');
    } finally { frame.remove(); }
  });
  it('returns the complete capability inventory with stable classifications', async () => {
    class OpenWebSocket extends EventTarget {
      constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
      close() {}
    }
    const report = await runDiagnostics({
      WebSocketImpl: OpenWebSocket as any,
      supportMatrix: {
        browsers: {
          chromium: { minimumMajor: 1, testedMajor: 145, level: 'full' },
          edge: { minimumMajor: 1, testedMajor: 145, level: 'full' },
        },
      },
    });
    expect(report.schemaVersion).toBe(1);
    expect(report.checks.map((check) => check.id)).toEqual([
      'browser', 'secure-context', 'certificate-context', 'webgl', 'webgpu', 'webxr',
      'fs-access', 'opfs', 'storage', 'appliance', 'websocket', 'service-worker',
    ]);
    expect(report.checks.find((check) => check.id === 'opfs')?.code).toBe('OPFS_ROUNDTRIP_OK');
    expect(report.checks.find((check) => check.id === 'webgl')?.level).toBe('required');
    expect(report.checks.find((check) => check.id === 'webgpu')?.level).toBe('feature');
    // A legacy unbounded `full` declaration is not evidence for this environment.
    expect(report.checks.find((check) => check.id === 'browser')?.code).toBe('BROWSER_NOT_CERTIFIED');
    expect(report.checks.find((check) => check.id === 'browser')?.data).toMatchObject({ family: 'chromium', major: expect.any(Number) });
    expect(report.summary.pass + report.summary.warn + report.summary.fail).toBe(report.checks.length);
  });

  // EP-APPLIANCE-001 rehearsal (2026-11-04): on a gateway-only appliance the check dialled the
  // hard-coded CONNECT path and always failed; the realtime socket also needs an HMI session,
  // which this operator-credential page may not have, and the browser hides the 401.
  it.each([
    ['signed-out', 401, 'warn', 'WSS_NEEDS_HMI_SESSION', 0],
    ['signed-in', 200, 'fail', 'WSS_REQUIRED', 1],
  ] as const)('dials the advertised realtime path and explains a missing HMI session (%s)', async (_label, sessionStatus, status, code, dials) => {
    const dialled: string[] = [];
    class OpenWebSocket extends EventTarget {
      constructor(url: string) { super(); dialled.push(url); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
      close() {}
    }
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input), location.href);
      if (url.pathname === '/appliance/api/info') return new Response(JSON.stringify({ diagnostics: { websocketPath: '/gateway/ws' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.pathname === '/api/access/v1/session') return new Response('{}', { status: sessionStatus, headers: { 'content-type': 'application/json' } });
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      const report = await runDiagnostics({ WebSocketImpl: OpenWebSocket as any, supportMatrix: { browsers: {} } });
      const check = report.checks.find((item) => item.id === 'websocket')!;
      // The test page is plain http://, so an opened socket is still not a WSS pass.
      expect(check).toMatchObject({ status, code, data: { path: '/gateway/ws' } });
      expect(dialled).toHaveLength(dials);
      if (dials) expect(new URL(dialled[0]).pathname).toBe('/gateway/ws');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
