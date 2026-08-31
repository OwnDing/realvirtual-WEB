// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { runDiagnostics } from '../appliance/runtime/static/diagnostics/diagnostics.mjs';

describe('appliance browser diagnostics', () => {
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
