// SPDX-License-Identifier: AGPL-3.0-only
import { getAppConfig } from '../rv-app-config';
import { runtimeFetch } from '../deployment/runtime-egress';
import { brandAssetHref, resolveDeploymentBrand } from '../deployment/brand-config.mjs';
import { DemoPackageError } from './recipe';
import type { DemoBrandSnapshot } from './html';

/** Freeze public presentation data; rasterize the logo so file:// never references the deployment. */
export async function loadDemoBrand(signal: AbortSignal): Promise<DemoBrandSnapshot | undefined> {
  const brand = resolveDeploymentBrand(getAppConfig());
  if (!brand.configured) return undefined;
  const response = await runtimeFetch(brandAssetHref(brand.logoUrl, import.meta.env.BASE_URL), 'remote-model', { signal, credentials: 'same-origin' });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new DemoPackageError('runtime');
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 4 * 1024 * 1024) throw new DemoPackageError('size');
      chunks.push(new Uint8Array(value));
    }
  } finally { await reader.cancel(); }
  signal.throwIfAborted();
  const image = new Image();
  const url = URL.createObjectURL(new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] ?? 'image/png' }));
  try {
    await new Promise<void>((accept, reject) => {
      const clean = () => { signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; };
      const abort = () => { clean(); image.src = ''; reject(signal.reason); };
      image.onload = () => { clean(); accept(); };
      image.onerror = () => { clean(); reject(new DemoPackageError('runtime')); };
      signal.addEventListener('abort', abort, { once: true }); image.src = url;
    });
    signal.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new DemoPackageError('size');
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new DemoPackageError('runtime');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { config: brand.publicConfig, logoDataUrl: canvas.toDataURL('image/png') };
  } finally { URL.revokeObjectURL(url); }
}
