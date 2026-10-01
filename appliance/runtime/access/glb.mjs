// SPDX-License-Identifier: AGPL-3.0-only
import { requireValue } from './store.mjs';

/** Validate without rewriting identifiers or unknown metadata. No executable or external dependencies. */
export function validatePresentationGlb(bytes) {
  requireValue(bytes.length >= 20 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, 422, 'INVALID_GLB');
  const length = bytes.readUInt32LE(12);
  requireValue(bytes.readUInt32LE(16) === 0x4e4f534a && length <= 16 * 1024 * 1024 && length % 4 === 0 && length + 20 <= bytes.length, 422, 'INVALID_GLB');
  let json;
  try { json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')); } catch { requireValue(false, 422, 'INVALID_GLB'); }
  requireValue(json?.asset?.version === '2.0' && Array.isArray(json.scenes), 422, 'INVALID_GLB');
  let offset = 20 + length;
  if (offset < bytes.length) {
    requireValue(offset + 8 <= bytes.length && bytes.readUInt32LE(offset + 4) === 0x004e4942 && bytes.readUInt32LE(offset) % 4 === 0 && offset + 8 + bytes.readUInt32LE(offset) === bytes.length, 422, 'INVALID_GLB');
    offset += 8;
  }
  requireValue(!json.buffers || (Array.isArray(json.buffers) && json.buffers.length <= 1 && json.buffers.every(b => b && Number.isSafeInteger(b.byteLength) && b.byteLength >= 0 && b.byteLength <= bytes.length - offset)), 422, 'INVALID_GLB');
  const pending = [json];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      requireValue(!(key === 'AssetReference' && child && child.embedded !== true), 422, 'EXTERNAL_DEPENDENCY');
      // Metadata may contain arbitrary strings; dependency-bearing fields cannot escape the snapshot.
      requireValue(!(/^(uri|url|href|src|.*(?:Url|URI)|modelPath|documentPath)$/i.test(key) && typeof child === 'string' && child.length), 422, 'EXTERNAL_DEPENDENCY');
      requireValue(!(/^(script|scripts|scriptCode|scriptPackage|sourceCode|WebComponent)$/i.test(key) && child), 422, 'EXECUTABLE_CONTENT');
      requireValue(!(typeof child === 'string' && /^(type|component|class)$/i.test(key) && /script|WebComponent/i.test(child)), 422, 'EXECUTABLE_CONTENT');
      if (typeof child === 'object') pending.push(child);
    }
  }
  return json;
}
