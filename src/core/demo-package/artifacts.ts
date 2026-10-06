// SPDX-License-Identifier: AGPL-3.0-only
import { runtimeFetch } from '../deployment/runtime-egress';
import { DemoPackageError } from './recipe';
import { MAX_DEMO_PLAYER_BYTES, MAX_DEMO_SOURCE_BYTES, validateDemoArtifacts, type DemoArtifacts, type DemoBuild } from './html';
async function boundedRead(name: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const url = new URL(`${import.meta.env.BASE_URL}demo-player/${name}`, document.baseURI);
  const response = await runtimeFetch(url, 'remote-model', { signal, cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok || Number(response.headers.get('content-length')) > limit || !response.body) throw new DemoPackageError('runtime');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) throw new DemoPackageError('size'); parts.push(value);
    }
  } finally { await reader.cancel(); }
  const output = new Uint8Array(size); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
export async function loadDemoArtifacts(signal: AbortSignal): Promise<DemoArtifacts> {
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await boundedRead('demo-player.json', 4096, signal))) as DemoBuild;
    const [player, source] = await Promise.all([boundedRead('demo-player.js', MAX_DEMO_PLAYER_BYTES, signal), boundedRead('demo-player-source.zip', MAX_DEMO_SOURCE_BYTES, signal)]);
    const artifacts = { manifest, player, source }; validateDemoArtifacts(artifacts, __RV_VERSION__); return artifacts;
  } catch (error) {
    if (signal.aborted || error instanceof DemoPackageError) throw error;
    throw new DemoPackageError('runtime');
  }
}
