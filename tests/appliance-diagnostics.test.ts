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
    expect(report.summary.pass + report.summary.warn + report.summary.fail).toBe(report.checks.length);
  });
});
