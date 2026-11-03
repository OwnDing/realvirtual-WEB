// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { resolveModelUrlParam } from '../src/core/model-url-param';

const entries = [
  { filename: 'DemoRealvirtualWeb.glb', url: '/models/DemoRealvirtualWeb.glb' },
  { filename: 'tests.glb', url: '/models/tests.glb' },
];

describe('resolveModelUrlParam (EP-E2E-001)', () => {
  it('resolves a bare catalogue filename to its entry URL (the welcome dialog link)', () => {
    expect(resolveModelUrlParam('DemoRealvirtualWeb.glb', entries)).toBe('/models/DemoRealvirtualWeb.glb');
  });

  it('leaves paths, absolute URLs and query-carrying values untouched', () => {
    for (const value of [
      '/models/DemoRealvirtualWeb.glb',
      'models/DemoRealvirtualWeb.glb',
      'https://example.test/DemoRealvirtualWeb.glb',
      'DemoRealvirtualWeb.glb?option=sew',
      'folder\\DemoRealvirtualWeb.glb',
    ]) {
      expect(resolveModelUrlParam(value, entries)).toBe(value);
    }
  });

  it('leaves an unknown bare name untouched so a deployment that serves it still works', () => {
    expect(resolveModelUrlParam('Customer.glb', entries)).toBe('Customer.glb');
    expect(resolveModelUrlParam('', entries)).toBe('');
  });
});
