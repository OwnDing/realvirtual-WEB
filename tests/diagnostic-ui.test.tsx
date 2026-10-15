// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DiagnosticsPanel from '../src/plugins/diagnostics/DiagnosticsPanel';
import { bindDiagnosticErrorEntry } from '../src/core/diagnostics/error-entry';
import { diagnosticSession } from '../src/core/diagnostics/session';
import { diagnosticDownloads } from '../src/core/diagnostics/export';
import { section } from '../src/core/diagnostics/types';
import { initI18n, setLocale } from '../src/core/i18n';
import { setAppConfig } from '../src/core/rv-app-config';
import { _resetStore, activateContext, deactivateContext } from '../src/core/hmi/ui-context-store';
import JSZip from 'jszip';
let detach: (() => void) | null = null;
beforeEach(async () => { _resetStore(); setAppConfig({}); initI18n(); await setLocale('zh-CN'); });
afterEach(() => { cleanup(); detach?.(); detach = null; diagnosticSession.stop(); diagnosticDownloads.dispose(); _resetStore(); setAppConfig({}); vi.restoreAllMocks(); });
describe('diagnostics customer workflow', () => {
  it('previews safe contents, switches language and excludes optional sections', async () => {
    render(<DiagnosticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '刷新预览' }));
    await waitFor(() => expect(screen.getByTestId('diagnostics-preview').textContent).toContain('manifest.json'));
    expect(screen.getByTestId('diagnostics-preview').textContent).not.toContain(location.origin);
    await act(() => setLocale('en-US'));
    expect(screen.getByRole('button', { name: 'Export diagnostic bundle' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include recent logs' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include scene summary' }));
    expect(screen.queryByTestId('diagnostics-preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }));
    await waitFor(() => expect(screen.getByTestId('diagnostics-preview').textContent).toContain('SCENE_EXCLUDED'));
    expect(screen.getByTestId('diagnostics-preview').textContent).toContain('LOGS_EXCLUDED');
  });
  it('downloads the preview snapshot without another collection', async () => {
    const graphics = vi.fn(() => section('ok', 'TEST_GRAPHICS', { marker: 42 }));
    detach = diagnosticSession.attach({ generation: () => 1, graphics, scene: () => section('ok', 'TEST_SCENE') });
    const save = vi.spyOn(diagnosticDownloads, 'save').mockImplementation(() => {});
    render(<DiagnosticsPanel />); fireEvent.click(screen.getByRole('button', { name: '刷新预览' }));
    await screen.findByText('预览已更新。导出使用此快照，可刷新以采集最新状态。');
    fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce()); expect(graphics).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][1]).toMatch(/\.zip$/);
  });
  it('cancels pending collection and does not start a download', async () => {
    detach = diagnosticSession.attach({ generation: () => 1, graphics: () => new Promise(() => {}), scene: () => section('ok', 'SCENE') });
    const save = vi.spyOn(diagnosticDownloads, 'save').mockImplementation(() => {});
    render(<DiagnosticsPanel />); fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }));
    expect(screen.getByRole('button', { name: '导出诊断包' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await screen.findByText('已取消，未发起下载。'); expect(save).not.toHaveBeenCalled();
  });
  it('downloads JSON and explains the fallback when ZIP packaging fails', async () => {
    vi.spyOn(JSZip.prototype, 'generateAsync').mockRejectedValue(new Error('fixture-secret'));
    const save = vi.spyOn(diagnosticDownloads, 'save').mockImplementation(() => {});
    render(<DiagnosticsPanel />); fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }));
    await screen.findByText('ZIP 打包不可用，已发起 JSON 基础诊断报告下载。');
    expect(save).toHaveBeenCalledOnce(); expect(save.mock.calls[0][1]).toMatch(/\.json$/);
    const text = await save.mock.calls[0][0].text();
    expect(JSON.parse(text).manifest.notices).toContain('archive-failed'); expect(text).not.toContain('fixture-secret');
  });
  it('cancels on panel teardown and suppresses a late download', async () => {
    let resolve!: (value: ReturnType<typeof section>) => void;
    detach = diagnosticSession.attach({ generation: () => 1, graphics: () => new Promise(done => { resolve = done; }), scene: () => section('ok', 'SCENE') });
    const save = vi.spyOn(diagnosticDownloads, 'save').mockImplementation(() => {});
    const ui = render(<DiagnosticsPanel />); fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    ui.unmount(); await act(async () => { resolve(section('ok', 'GRAPHICS')); });
    expect(save).not.toHaveBeenCalled();
  });
  it('honors settings lock, Kiosk and guest boundaries', () => {
    setAppConfig({ lockSettings: true }); const ui = render(<DiagnosticsPanel />);
    expect(screen.queryByTestId('diagnostics-panel')).toBeNull();
    setAppConfig({}); ui.rerender(<DiagnosticsPanel />); expect(screen.getByTestId('diagnostics-panel')).toBeTruthy();
    act(() => activateContext('kiosk')); expect(screen.queryByTestId('diagnostics-panel')).toBeNull();
    act(() => { deactivateContext('kiosk'); activateContext('guest'); }); expect(screen.queryByTestId('diagnostics-panel')).toBeNull();
  });
  it('offers a native error entry before Viewer creation and cleans up URLs', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const save = vi.spyOn(diagnosticDownloads, 'save').mockImplementation(() => {});
    const release = bindDiagnosticErrorEntry(host);
    try {
      fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      expect(host.textContent).toContain('下载已发起');
      act(() => activateContext('kiosk')); expect((host.firstElementChild as HTMLElement).hidden).toBe(true);
    } finally { release(); host.remove(); }
    save.mockRestore();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    diagnosticDownloads.save(new Blob(['test']), 'test.json'); diagnosticDownloads.dispose();
    expect(revoke).toHaveBeenCalledOnce();
  });
});
