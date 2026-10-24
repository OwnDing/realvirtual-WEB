// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * GLB-file provider tests (plan-238 §8.2 glbFileProvider_Imports).
 * The core provider present in every build (public + private).
 */

import { describe, it, expect } from 'vitest';
import { createGlbFileProvider, resolveGlbFiles, glbBaseName } from '../src/plugins/unified-import/glb-file-provider';
import { remediationFor } from '../src/plugins/unified-import/UnifiedImportDialog';
import { resolveProviderSafe } from '../src/core/import/rv-import-provider';
import { UnifiedImportPlugin } from '../src/plugins/unified-import';
import { evaluateVisibilityRule } from '../src/core/hmi/ui-context-store';
import { getLocale, initI18n, setLocale } from '../src/core/i18n';

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'model/gltf-binary' });
}

describe('glb-file provider', () => {
  it('is always ready', () => {
    const p = createGlbFileProvider();
    expect(p.id).toBe('glb-file');
    expect(p.availability()).toBe('ready');
  });

  it('resolves files to GLB items with the stripped base name', async () => {
    const res = await resolveGlbFiles([makeFile('BeltConveyor_2m.glb', 'glTF-data')]);
    expect(res.failed).toEqual([]);
    expect(res.ok).toHaveLength(1);
    const item = res.ok[0];
    expect(item.kind).toBe('glb');
    if (item.kind === 'glb') {
      expect(item.suggestedName).toBe('BeltConveyor_2m');
      expect(item.bytes.byteLength).toBeGreaterThan(0);
    }
  });

  it('reports empty files as per-file failures (partial success)', async () => {
    const res = await resolveGlbFiles([
      makeFile('good.glb', 'data'),
      makeFile('empty.glb', ''),
    ]);
    expect(res.ok).toHaveLength(1);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].id).toBe('empty.glb');
  });

  it('resolve() without a file selection yields a defined failure', async () => {
    const p = createGlbFileProvider();
    const res = await p.resolve({ kind: 'custom', data: null });
    expect(res.ok).toEqual([]);
    expect(res.failed[0].error).toMatch(/No file/i);
  });

  it('glbBaseName strips path and extension', () => {
    expect(glbBaseName('C:\\models\\Robot.glb')).toBe('Robot');
    expect(glbBaseName('robot.GLB')).toBe('robot');
    expect(glbBaseName('.glb')).toBe('model');
  });

  it('an aborted signal cancels between files and is not reported as a failure', async () => {
    const controller = new AbortController();
    controller.abort();
    // Direct call throws AbortError…
    await expect(resolveGlbFiles([makeFile('a.glb', 'data')], controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    // …and the safe wrapper normalizes a cancel to "nothing happened".
    const p = createGlbFileProvider();
    const res = await resolveProviderSafe(
      p, { kind: 'files', files: [makeFile('a.glb', 'data')] }, undefined, controller.signal,
    );
    expect(res.ok).toEqual([]);
    expect(res.failed).toEqual([]);
  });
});

describe('unified-import button visibility', () => {
  it('is editor-only: hidden in HMI, planner and DES', () => {
    const rule = new UnifiedImportPlugin().slots[0].visibilityRule!;
    expect(evaluateVisibilityRule(rule, new Set(['mode:editor']))).toBe(true);
    expect(evaluateVisibilityRule(rule, new Set(['mode:hmi']))).toBe(false);
    expect(evaluateVisibilityRule(rule, new Set(['mode:planner']))).toBe(false);
    expect(evaluateVisibilityRule(rule, new Set(['mode:des']))).toBe(false);
    expect(evaluateVisibilityRule(rule, new Set())).toBe(false);
  });
});

describe('remediationFor', () => {
  it.each(['en-US', 'zh-CN'] as const)('maps known engine failures to actionable %s guidance', async locale => {
    initI18n();
    const previous = getLocale();
    try {
      await setLocale(locale);
      const memory = remediationFor('RuntimeError: memory access out of bounds');
      const network = remediationFor('TypeError: Failed to fetch');
      const invalid = remediationFor('Unknown format: not a GLB');
      if (locale === 'en-US') {
        expect(memory).toMatch(/Reduce model detail, split the assembly/);
        expect(network).toMatch(/Check connectivity, same-origin resources/);
        expect(invalid).toMatch(/Check the file and use a supported format/);
      } else {
        expect(memory).toMatch(/降低模型精度、拆分装配/);
        expect(network).toMatch(/检查连接、同源资源/);
        expect(invalid).toMatch(/检查文件并使用受支持的格式/);
      }
    } finally {
      await setLocale(previous);
    }
  });

  it('returns null for messages it cannot improve', () => {
    expect(remediationFor('Nothing to import — the source resolved to no items.')).toBeNull();
  });
});
