// SPDX-License-Identifier: AGPL-3.0-only
import { onLocaleChange, rvT } from '../i18n';
import { _subscribe as subscribeContexts } from '../hmi/ui-context-store';
import { canExportDiagnostics } from './access';
import { collectReport } from './collect';
import { createDiagnosticDownload, diagnosticDownloads, finalizeReport } from './export';
import { diagnosticSession } from './session';
import { abortIfNeeded } from './types';
/** Native DOM fallback works before React / Viewer creation. JSON needs no extra chunk request. */
export function bindDiagnosticErrorEntry(host: HTMLElement): { refresh: () => void; dispose: () => void } {
  const block = document.createElement('div'), button = document.createElement('button'), cancel = document.createElement('button'), note = document.createElement('p');
  block.dataset.testid = 'diagnostics-error-entry';
  button.type = cancel.type = 'button'; button.className = cancel.className = 'loader-btn';
  button.style.marginTop = cancel.style.marginTop = '12px';
  cancel.style.marginLeft = '8px';
  note.setAttribute('role', 'status'); note.style.fontSize = '12px';
  let active: AbortSignal | null = null, disposed = false;
  let message: 'notice' | 'collecting' | 'downloaded' | 'fallback' | 'failed' | 'cancelled' | 'busy' = 'notice';
  function render() {
    const allowed = canExportDiagnostics();
    block.hidden = !allowed;
    if (!allowed && active) diagnosticSession.cancel();
    button.textContent = rvT('shell', 'diagnostics.export'); button.disabled = !!active;
    cancel.textContent = rvT('shell', 'diagnostics.cancel'); cancel.hidden = !active;
    note.textContent = rvT('shell', `diagnostics.${message}`);
  }
  button.onclick = async () => {
    if (active || !canExportDiagnostics()) return;
    let signal: AbortSignal;
    try { signal = diagnosticSession.begin(); } catch { message = 'busy'; render(); return; }
    active = signal; message = 'collecting'; render();
    try {
      const report = finalizeReport(await collectReport({ logs: true, scene: true }, signal));
      const result = await createDiagnosticDownload(report, signal);
      abortIfNeeded(signal);
      if (disposed || !canExportDiagnostics()) return;
      diagnosticDownloads.save(result.blob, result.filename); message = result.fallback ? 'fallback' : 'downloaded';
    } catch { message = signal.aborted ? 'cancelled' : 'failed'; }
    finally { diagnosticSession.finish(signal); active = null; if (!disposed) render(); }
  };
  cancel.onclick = () => diagnosticSession.cancel();
  block.append(button, cancel, note); host.append(block); render();
  const offs = [onLocaleChange(render), subscribeContexts(render)];
  return { refresh: render, dispose: () => { disposed = true; if (active) diagnosticSession.cancel(); offs.forEach(off => off()); block.remove(); } };
}
