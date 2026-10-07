// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { parseDemoRecipe, demoFileName, type DemoRecipe } from '../src/core/demo-package/recipe';
import { preflightDemoGlb } from '../src/core/demo-package/preflight';
import { createDemoHtml, safeDemoJson, type DemoArtifacts } from '../src/core/demo-package/html';

function glb(extra: object = {}) {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], ...extra }));
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + length); bytes.fill(32, 20); bytes.set(json, 20);
  const view = new DataView(bytes.buffer); [0x46546c67, 2, bytes.length, length, 0x4e4f534a].forEach((v, i) => view.setUint32(i * 4, v, true));
  return bytes;
}
const camera = { position: [3, 2, 1], target: [0, 0, 0], fov: 50 } as DemoRecipe['startCamera'];
const recipe: DemoRecipe = { schemaVersion: 1, title: 'Demo', locale: 'zh-CN', startCamera: camera, loop: false, steps: [{ id: 'a', title: 'A', description: 'Caption', camera, durationMs: 0, dwellMs: 1000 }] };
const player = new TextEncoder().encode('window.loaded = true;'), source = new Uint8Array([80, 75, 3, 4]);
const artifacts: DemoArtifacts = { player, source, manifest: { schemaVersion: 1, version: '1', revision: 'test', sha256: bytesToHex(sha256(player)), sourceSha256: bytesToHex(sha256(source)) } };
describe('portable demo contract', () => {
  it('round-trips bounded recipes, drops unknown fields and never aliases camera/steps', () => {
    const parsed = parseDemoRecipe({ ...recipe, source: 'private' }); expect(parsed).toEqual(recipe); expect(parsed).not.toBe(recipe); expect(parsed.startCamera.position).not.toBe(camera.position); expect('source' in parsed).toBe(false);
  });
  it.each([
    { schemaVersion: 2 }, { title: '' }, { locale: 'other' }, { steps: Array(51).fill(recipe.steps[0]) },
    { steps: [recipe.steps[0], recipe.steps[0]] }, { startCamera: { ...camera, fov: NaN } },
    { startCamera: { ...camera, position: [Infinity, 0, 0] } }, { startCamera: { ...camera, target: camera.position } },
    { steps: [{ ...recipe.steps[0], dwellMs: 0 }] }, { steps: [{ ...recipe.steps[0], durationMs: 10001 }] },
  ])('rejects malformed recipe %j', patch => { expect(() => parseDemoRecipe({ ...recipe, ...patch })).toThrow(); });
  it('accepts self-contained unsigned GLB and embedded reference provenance', () => {
    expect(() => preflightDemoGlb(glb({ nodes: [{ extras: { realvirtual: { AssetReference: { assetId: 'asset', path: 'source.glb', embedded: true, sha256: 'origin' } } } }] }))).not.toThrow();
  });
  it.each([
    [{ images: [{ uri: 'https://example.test/image.png' }] }, 'external'],
    [{ buffers: [{ byteLength: 0, uri: 'data:application/octet-stream;base64,' }] }, 'external'],
    [{ nodes: [{ extras: { realvirtual: { AssetReference: { assetId: 'missing' } } } }] }, 'reference'],
    [{ extras: { Scripts: [] } }, 'script'], [{ extras: { type: 'WebComponent' } }, 'script'],
    [{ extensions: { KHR_draco_mesh_compression: {} } }, 'compression'],
    [{ extras: { rv_sig: 'signature' } }, 'script'], [{ buffers: [{ byteLength: 5 }] }, 'model'],
  ])('rejects non-portable GLB %j', (extra, code) => expect(() => preflightDemoGlb(glb(extra as object))).toThrow(String(code)));
  it('rejects corrupt framing, trailing garbage and invalid JSON', () => {
    const bytes = glb(); const broken = bytes.slice(); broken[0] = 0; expect(() => preflightDemoGlb(broken)).toThrow('model');
    expect(() => preflightDemoGlb(new Uint8Array([...bytes, 0]))).toThrow('model'); bytes[20] = 0; expect(() => preflightDemoGlb(bytes)).toThrow('model');
  });
  it('escapes hostile captions and embeds only data URLs with offline CSP', () => {
    const hostile = '</script><img src=https://example.test onerror=alert(1)>\u2028';
    const html = createDemoHtml({ ...recipe, title: hostile }, glb(), artifacts, '1');
    expect(html).not.toContain(hostile); expect(html).toContain('\\u003c/script\\u003e'); expect(html).toContain("default-src 'none'");
    expect(html).toContain('script src="data:application/javascript;base64,'); expect(JSON.parse(safeDemoJson(hostile))).toBe(hostile);
  });
  it('refuses inconsistent deploy versions or hashes before producing HTML', () => {
    expect(() => createDemoHtml(recipe, glb(), artifacts, '2')).toThrow('runtime');
    expect(() => createDemoHtml(recipe, glb(), { ...artifacts, player: new Uint8Array([1]) }, '1')).toThrow('runtime');
    expect(() => createDemoHtml(recipe, glb(), { ...artifacts, source: new Uint8Array([80, 75, 0, 0]) }, '1')).toThrow('runtime');
  });
  it('normalizes download names without allowing a path', () => { expect(demoFileName('../bad:<name>?. ')).toBe('.._bad__name__'); });
});
