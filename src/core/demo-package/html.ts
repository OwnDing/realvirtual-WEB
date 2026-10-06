// SPDX-License-Identifier: AGPL-3.0-only
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { demoMessages } from '../i18n/catalogs/demo-package';
import { DemoPackageError, parseDemoRecipe, type DemoRecipe } from './recipe';
import { preflightDemoGlb } from './preflight';
export interface DemoBuild { schemaVersion: 1; version: string; revision: string; sha256: string; sourceSha256: string }
export interface DemoArtifacts { manifest: DemoBuild; player: Uint8Array; source: Uint8Array }
export interface DemoPayload { schemaVersion: 1; recipe: DemoRecipe; modelBase64: string; sourceBase64: string; license: string; build: { version: string; revision: string } }
export const MAX_DEMO_PLAYER_BYTES = 16 * 1024 * 1024;
export const MAX_DEMO_SOURCE_BYTES = 32 * 1024 * 1024;
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function fromBase64(text: string, max: number): Uint8Array {
  if (typeof text !== 'string' || text.length > Math.ceil(max / 3) * 4) throw new DemoPackageError('size');
  try { const binary = atob(text); if (binary.length > max) throw new Error(); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
  catch { throw new DemoPackageError('model'); }
}
export function validateDemoArtifacts(artifacts: DemoArtifacts, version: string): void {
  const { manifest: m, player, source } = artifacts;
  if (player.length > MAX_DEMO_PLAYER_BYTES || source.length > MAX_DEMO_SOURCE_BYTES) throw new DemoPackageError('size');
  if (m.schemaVersion !== 1 || m.version !== version || typeof m.revision !== 'string' || m.revision.length > 100
    || !player.length || source.length < 4 || source[0] !== 80 || source[1] !== 75
    || bytesToHex(sha256(player)) !== m.sha256 || bytesToHex(sha256(source)) !== m.sourceSha256) throw new DemoPackageError('runtime');
}
export function safeDemoJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function createDemoHtml(input: unknown, model: Uint8Array, artifacts: DemoArtifacts, version: string): string {
  const recipe = parseDemoRecipe(input);
  preflightDemoGlb(model); validateDemoArtifacts(artifacts, version);
  const m = demoMessages(recipe.locale);
  const data: DemoPayload = { schemaVersion: 1, recipe, modelBase64: toBase64(model), sourceBase64: toBase64(artifacts.source), license: 'AGPL-3.0-only', build: { version, revision: artifacts.manifest.revision } };
  // A base64 script URL cannot close a script element; CSP permits no network origin, eval, frames or workers.
  return `<!doctype html><html lang="${recipe.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; font-src data:; worker-src 'none'; base-uri 'none'; form-action 'none'"><title>XYvirtual Demo</title><style>
html,body{margin:0;width:100%;height:100%;background:#1a1d21;color:#eef3fa;font:14px system-ui,sans-serif}*{box-sizing:border-box}canvas{display:block;width:100%;height:100%;touch-action:none}header,footer,#caption{position:fixed;z-index:1;background:#171c24eb;padding:12px 16px;border:1px solid #3a4658;border-radius:10px}header{top:12px;left:12px;right:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}h1{font-size:18px;margin:0 auto 0 0}button,a{font:inherit;color:inherit;background:#29374a;border:1px solid #73869c;border-radius:6px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,a:focus-visible{outline:3px solid #7cb9ff}footer{bottom:12px;left:12px;right:12px;font-size:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}footer a{padding:5px 8px}#caption{bottom:110px;left:12px;max-width:min(560px,calc(100% - 24px));max-height:30vh;overflow:auto;white-space:pre-wrap;pointer-events:none}#caption:empty{display:none}#status{position:fixed;top:130px;left:20px;right:20px;z-index:2}#status:empty{display:none}@media(max-width:600px){header,footer{padding:8px}button{padding:7px}#caption{bottom:160px}}
</style></head><body><canvas aria-label="${m.title}"></canvas><header><h1></h1><button id="play" disabled>${m.play}</button><button id="previous" disabled>${m.previous}</button><button id="next" disabled>${m.next}</button><button id="reset" disabled>${m.reset}</button></header><p id="status" role="status">${m.loading}</p><section id="caption" aria-live="polite"></section><footer><span>${m.offline}</span><a id="recipe">${m.recipeDownload}</a><a id="source">${m.source}</a><span>${m.license}</span></footer><script id="rv-demo-data" type="application/json">${safeDemoJson(data)}</script><script src="data:application/javascript;base64,${toBase64(artifacts.player)}"></script></body></html>`;
}
