// SPDX-License-Identifier: AGPL-3.0-only
import { DemoPackageError } from './recipe';
export const MAX_DEMO_MODEL_BYTES = 128 * 1024 * 1024;
const fail = (code: ConstructorParameters<typeof DemoPackageError>[0]): never => { throw new DemoPackageError(code); };
/** Strict framing and dependency preflight, run both before download and before player construction. */
export function preflightDemoGlb(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_DEMO_MODEL_BYTES) fail('size');
  if (bytes.byteLength < 20) fail('model');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) fail('model');
  let offset = 12, json: unknown, chunks = 0, binarySize = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('model');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > bytes.length || chunks > 1) fail('model');
    if (chunks === 0) {
      if (type !== 0x4e4f534a) fail('model');
      try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, offset + length))); } catch { fail('model'); }
    } else {
      if (type !== 0x004e4942) fail('model');
      binarySize = length;
    }
    offset += length; chunks++;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) fail('model');
  const gltf = json as Record<string, unknown>;
  if ((gltf.asset as { version?: string } | undefined)?.version !== '2.0') fail('model');
  const buffers = gltf.buffers;
  if (buffers !== undefined && (!Array.isArray(buffers) || buffers.length > 1 || buffers.some(b => !b || !Number.isInteger(b.byteLength) || b.byteLength < 0 || b.byteLength > binarySize))) fail('model');
  const pending: unknown[] = [gltf]; let count = 0;
  while (pending.length) {
    const obj = pending.pop();
    if (!obj || typeof obj !== 'object') continue;
    if (++count > 1_000_000) fail('size');
    for (const [key, value] of Object.entries(obj)) {
      if (/^(?:scripts?|scriptCode|scriptPackage|sourceCode|WebComponent|rv_sig)$/i.test(key) && value != null) fail('script');
      if (/^(?:type|component|class)$/i.test(key) && typeof value === 'string' && /script|webcomponent/i.test(value)) fail('script');
      if (key === 'AssetReference' && value && typeof value === 'object' && value.embedded !== true) fail('reference');
      if (/^(?:KHR_draco_mesh_compression|KHR_texture_basisu|EXT_meshopt_compression|EXT_texture_webp|EXT_texture_avif)$/.test(key)) fail('compression');
      if (/^(?:uri|url|href|src|.*Url|.*URI|modelPath|documentPath)$/i.test(key) && typeof value === 'string' && value.length) fail('external');
      if (value && typeof value === 'object') pending.push(value);
    }
  }
}
