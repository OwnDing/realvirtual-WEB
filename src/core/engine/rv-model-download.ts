// SPDX-License-Identifier: AGPL-3.0-only
import { runtimeFetch } from '../deployment/runtime-egress';
import type { EgressPurpose } from '../deployment/deployment-config';
export interface ModelDownloadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  attempts?: number;
  maxBytes?: number;
  purpose?: EgressPurpose;
  progress?: (loaded: number, total: number | null) => void;
  retry?: (attempt: number, total: number) => void;
}
/** Content-Length counts encoded bytes; only identity transfers have a reliable denominator. */
export async function readModelBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
  progress?: ModelDownloadOptions['progress'],
): Promise<ArrayBuffer> {
  const header = Number(response.headers.get('content-length'));
  const encoding = response.headers.get('content-encoding');
  let total =
    (!encoding || encoding === 'identity') && Number.isSafeInteger(header) && header > 0
      ? header
      : null;
  if (total !== null && total > maxBytes) throw new Error('MODEL_SIZE_LIMIT');
  const reader = response.body?.getReader();
  if (!reader) {
    const data = await response.arrayBuffer();
    signal?.throwIfAborted();
    if (data.byteLength > maxBytes) throw new Error('MODEL_SIZE_LIMIT');
    progress?.(data.byteLength, total);
    return data;
  }
  let buffer = total !== null ? new Uint8Array(total) : null;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (loaded + value.byteLength > maxBytes) throw new Error('MODEL_SIZE_LIMIT');
      if (buffer && loaded + value.byteLength > buffer.length) {
        chunks.push(buffer.subarray(0, loaded));
        buffer = null;
        total = null;
      }
      if (buffer) buffer.set(value, loaded);
      else chunks.push(value);
      loaded += value.byteLength;
      progress?.(loaded, total);
    }
    if (total !== null && loaded !== total) throw new Error('MODEL_INCOMPLETE');
    if (buffer) return buffer.buffer as ArrayBuffer;
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function downloadModel(
  url: string,
  options: ModelDownloadOptions = {},
): Promise<ArrayBuffer> {
  const attempts = options.attempts ?? 1;
  for (let attempt = 1; ; attempt++) {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('MODEL_TIMEOUT')),
      options.timeoutMs ?? 90_000,
    );
    try {
      const response = await runtimeFetch(url, options.purpose ?? 'remote-model', {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
      return await readModelBody(
        response,
        options.maxBytes ?? 512 * 1024 * 1024,
        controller.signal,
        options.progress,
      );
    } catch (error) {
      options.signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : '';
      if (attempt >= attempts || /SIZE_LIMIT|HTTP_4|EGRESS_BLOCKED/.test(message)) throw error;
      options.retry?.(attempt, attempts);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
