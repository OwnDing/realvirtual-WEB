// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, vi } from 'vitest';
import { ModelLoadState } from '../src/core/engine/rv-load-session';
import { readModelBody } from '../src/core/engine/rv-model-download';
import { AdaptiveQuality, qualityOverrides } from '../src/core/engine/rv-adaptive-quality';
import {
  parsePerformancePackage,
  decodePerformanceGeometry,
  performanceResourceUrl,
  verifyPerformanceBytes,
  validatePerformanceTexture,
} from '../src/core/engine/rv-performance-package';
import { sha256 } from '@noble/hashes/sha2.js';
const hash = (b: ArrayBuffer) =>
  Array.from(sha256(new Uint8Array(b)), (x) => x.toString(16).padStart(2, '0')).join('');
const response = (chunks: number[][], headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const v of chunks) c.enqueue(new Uint8Array(v));
        c.close();
      },
    }),
    { headers },
  );
describe('loading ownership and honest byte accounting', () => {
  it('abandons deferred work on cancellation without blocking the next load', async () => {
    const state = new ModelLoadState(),
      first = state.begin();
    let release!: () => void;
    const work = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = first.waitFor(work);
    first.cancel();
    await expect(waiting).rejects.toThrow('cancelled');
    const second = state.begin();
    await expect(second.waitFor(Promise.resolve(42))).resolves.toBe(42);
    release();
    expect(state.current).toBe(second);
  });
  it('rejects stale loads and keeps newer progress isolated', () => {
    const state = new ModelLoadState(),
      first = state.begin(),
      second = state.begin();
    first.bytes(100, 100);
    first.phase('ready');
    expect(first.signal.aborted).toBe(true);
    expect(() => first.assertCurrent()).toThrow();
    expect(state.getSnapshot().id).toBe(second.id);
    expect(state.getSnapshot().loaded).toBe(0);
    second.phase('decode');
    expect(state.getSnapshot().phase).toBe('decode');
    second.cancel();
    expect(state.getSnapshot().phase).toBe('cancelled');
  });
  it('ready is terminal and never follows a cancelled operation', () => {
    const state = new ModelLoadState(),
      session = state.begin();
    session.bytes(10, 10);
    expect(state.getSnapshot().phase).toBe('download');
    session.cancel();
    session.phase('ready');
    expect(state.getSnapshot().phase).toBe('cancelled');
  });
  it('reads known length without declaring scene ready', async () => {
    const progress = vi.fn();
    expect(
      new Uint8Array(
        await readModelBody(
          response([[1], [2, 3]], { 'content-length': '3' }),
          100,
          undefined,
          progress,
        ),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
  it('reports unknown lengths and compressed bodies with no false denominator', async () => {
    for (const headers of [{}, { 'content-length': '2', 'content-encoding': 'gzip' }] as Record<
      string,
      string
    >[]) {
      const progress = vi.fn();
      await readModelBody(
        response(
          [
            [1, 2],
            [3, 4],
          ],
          headers,
        ),
        100,
        undefined,
        progress,
      );
      expect(progress).toHaveBeenLastCalledWith(4, null);
    }
  });
  it('detects truncation and enforces size limits', async () => {
    await expect(readModelBody(response([[1]], { 'content-length': '2' }), 100)).rejects.toThrow(
      'INCOMPLETE',
    );
    await expect(readModelBody(response([[1, 2, 3]]), 2)).rejects.toThrow('SIZE_LIMIT');
  });
  it('cancels a stalled reader and never returns partial bytes', async () => {
    const controller = new AbortController();
    const body = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1]));
        },
      }),
    );
    const read = readModelBody(body, 100, controller.signal);
    controller.abort();
    await expect(read).rejects.toThrow();
  });
});
describe('adaptive quality', () => {
  it('uses sustained active frames, cooldown and manual ownership', () => {
    const apply = vi.fn(),
      quality = new AdaptiveQuality(apply);
    quality.setMode('auto', 2, 0);
    for (let t = 40; t < 7000; t += 40) quality.sample(t, true);
    expect(quality.getSnapshot().tier).toBe(1);
    for (let t = 7000; t < 9000; t += 100) quality.sample(t, true);
    expect(quality.getSnapshot().tier).toBe(1);
    quality.setMode('high', 2, 9000);
    for (let t = 9000; t < 30000; t += 100) quality.sample(t, true);
    expect(quality.getSnapshot()).toEqual({ mode: 'high', tier: 2 });
  });
  it('ignores hidden, loading and render-on-demand idle intervals', () => {
    const quality = new AdaptiveQuality(vi.fn());
    quality.setMode('auto', 2, 0);
    for (let t = 100; t < 10000; t += 100) {
      quality.sample(t, true);
      quality.sample(t + 50, false);
    }
    expect(quality.getSnapshot().tier).toBe(2);
  });
  it('restores user settings when leaving automatic mode', () => {
    const apply = vi.fn(),
      quality = new AdaptiveQuality(apply);
    quality.setMode('auto', 0);
    quality.setMode('manual');
    expect(apply).toHaveBeenLastCalledWith(null);
    expect(qualityOverrides({ dpr: 0.75, ao: 'off', shadows: false, bloom: false }, 0)).toEqual({
      dpr: 0.75,
      ao: 'off',
      shadows: false,
      bloom: false,
    });
  });
});
describe('performance resources', () => {
  it('bounds decoded texture dimensions before browser allocation', () => {
    const bytes = new ArrayBuffer(33),
      view = new DataView(bytes);
    for (const [offset, value] of [
      [0, 0x89504e47],
      [4, 0x0d0a1a0a],
      [8, 13],
      [12, 0x49484452],
      [16, 512],
      [20, 128],
    ])
      view.setUint32(offset, value);
    expect(() => validatePerformanceTexture(bytes)).not.toThrow();
    expect(() => validatePerformanceTexture(bytes, 128)).toThrow('DIMENSIONS');
    view.setUint32(16, 100000);
    expect(() => validatePerformanceTexture(bytes)).toThrow('DIMENSIONS');
    expect(() => validatePerformanceTexture(new ArrayBuffer(4))).toThrow('HEADER');
  });
  it('rejects URL escapes, future formats and hash mismatch', () => {
    for (const uri of [
      '../secret',
      '/secret',
      'https://host/file',
      'foo?bar',
      'foo#bar',
      '%2e%2e/foo',
      'a\\b',
    ])
      expect(() =>
        performanceResourceUrl('https://example.test/models/a.perf.json', uri),
      ).toThrow();
    expect(
      performanceResourceUrl('https://example.test/sub/model.glb.perf.json', 'assets/a.bin'),
    ).toBe('https://example.test/sub/assets/a.bin');
    expect(() => parsePerformancePackage({ schemaVersion: 2 })).toThrow();
    const bytes = new Uint8Array([1, 2]).buffer;
    expect(() =>
      verifyPerformanceBytes(bytes, { byteLength: 2, sha256: hash(bytes) }),
    ).not.toThrow();
    expect(() => verifyPerformanceBytes(bytes, { byteLength: 2, sha256: '0'.repeat(64) })).toThrow(
      'HASH',
    );
  });
  it('rejects malformed geometry before allocating render buffers', () => {
    expect(() => decodePerformanceGeometry(new ArrayBuffer(32))).toThrow('MAGIC');
    const bytes = new ArrayBuffer(64),
      v = new DataView(bytes);
    v.setUint32(0, 0x504c5652, true);
    v.setUint32(4, 0xffffffff, true);
    expect(() => decodePerformanceGeometry(bytes)).toThrow('LAYOUT');
  });
});
