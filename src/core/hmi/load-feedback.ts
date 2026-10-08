// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelLoadState } from '../engine/rv-load-session';
import { rvT } from '../i18n';
import type { PreviewViewport } from './performance-preview';
/** Available before React mounts; shared by initial boot and subsequent viewer loads. */
export function bindLoadFeedback(state: ModelLoadState, retry: () => void): () => void {
  const root = document.createElement('section');
  root.dataset.testid = 'model-load-feedback';
  root.style.cssText =
    'position:fixed;inset:0;z-index:22000;background:#101820;display:none;color:#e7edf2;font:14px Inter,system-ui,sans-serif;';
  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:absolute;inset:0;';
  const card = document.createElement('div');
  card.style.cssText =
    'position:absolute;bottom:32px;left:50%;transform:translateX(-50%);width:min(540px,90vw);padding:20px;border:1px solid #405568;border-radius:12px;background:#14212ef0;box-sizing:border-box;';
  const title = document.createElement('div'),
    detail = document.createElement('div'),
    hint = document.createElement('p'),
    warning = document.createElement('p');
  title.setAttribute('role', 'status');
  title.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.style.width = '100%';
  const cancel = document.createElement('button'),
    again = document.createElement('button'),
    close = document.createElement('button');
  for (const button of [cancel, again, close])
    button.style.cssText =
      'padding:8px 18px;margin:8px 8px 0 0;background:#244b62;color:white;border:1px solid #648398;border-radius:6px;cursor:pointer;';
  cancel.onclick = () => state.cancel();
  again.onclick = retry;
  close.onclick = () => {
    root.style.display = 'none';
  };
  card.append(title, detail, progress, hint, warning, cancel, again, close);
  root.append(viewport, card);
  document.body.append(root);
  let preview: PreviewViewport | null = null,
    previewId = 0,
    disposed = false;
  const update = () => {
    const s = state.getSnapshot(),
      active = !['idle', 'ready', 'cancelled'].includes(s.phase);
    root.style.display = active ? 'block' : 'none';
    root.dataset.phase = s.phase;
    title.textContent = rvT('preboot', `performance.${s.phase}`);
    progress.setAttribute('aria-label', title.textContent);
    const download = s.phase === 'download';
    if (download && s.total) progress.value = Math.min(100, (s.loaded / s.total) * 100);
    else progress.removeAttribute('value');
    detail.textContent = download
      ? s.total
        ? rvT('preboot', 'performance.total', {
            loaded: (s.loaded / 1048576).toFixed(1),
            total: (s.total / 1048576).toFixed(1),
          })
        : rvT('preboot', 'performance.bytes', { loaded: (s.loaded / 1048576).toFixed(1) })
      : rvT('preboot', 'performance.elapsed', { seconds: (s.elapsedMs / 1000).toFixed(1) });
    hint.textContent = s.preview ? rvT('preboot', 'performance.preview') : '';
    warning.textContent = s.warning ? rvT('preboot', 'performance.warning') : '';
    cancel.textContent = rvT('preboot', 'performance.cancel');
    again.textContent = rvT('preboot', 'performance.retry');
    close.textContent = rvT('preboot', 'performance.close');
    cancel.hidden = s.phase === 'error';
    again.hidden = s.phase !== 'error';
    close.hidden = s.phase !== 'error';
    if (
      !active ||
      previewId !== s.id ||
      !state.current?.visualAssets ||
      state.current.visualAssets.signal.aborted
    ) {
      preview?.dispose();
      preview = null;
    }
    if (['ready', 'cancelled', 'error'].includes(s.phase) || s.preview)
      document.getElementById('loading-overlay')?.classList.add('hidden');
    const assets = state.current?.visualAssets;
    if (active && assets && !assets.signal.aborted && previewId !== s.id) {
      previewId = s.id;
      void import('./performance-preview').then(({ PreviewViewport }) => {
        if (
          disposed ||
          state.getSnapshot().id !== s.id ||
          ['ready', 'cancelled'].includes(state.getSnapshot().phase) ||
          assets.signal.aborted
        )
          return;
        try {
          preview = new PreviewViewport(viewport, assets);
          state.current?.showPreview();
        } catch {
          state.current?.warn();
        }
      });
    }
  };
  const unsubscribe = state.subscribe(update);
  update();
  const cleanup = () => {
    disposed = true;
    unsubscribe();
    preview?.dispose();
    root.remove();
  };
  const unregister = state.onDispose(cleanup);
  return () => {
    unregister();
    cleanup();
  };
}
