// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, LinearProgress, Typography } from '@mui/material';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { useActiveContexts } from '../../core/hmi/ui-context-store';
import { canExportDiagnostics } from '../../core/diagnostics/access';
import { collectReport } from '../../core/diagnostics/collect';
import { createDiagnosticDownload, diagnosticDownloads, finalizeReport, reportFiles } from '../../core/diagnostics/export';
import { diagnosticSession } from '../../core/diagnostics/session';
import { abortIfNeeded, type DiagnosticOptions, type DiagnosticReport } from '../../core/diagnostics/types';

export default function DiagnosticsPanel() {
  const { t } = useRvTranslation('shell'); useActiveContexts();
  const [options, setOptions] = useState<DiagnosticOptions>({ logs: true, scene: true });
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [phase, setPhase] = useState<'idle' | 'collecting' | 'packing'>('idle');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<'ready' | 'downloaded' | 'fallback' | 'cancelled' | 'failed' | 'busy' | null>(null);
  const alive = useRef(true), active = useRef<AbortSignal | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (active.current) diagnosticSession.cancel(); }; }, []);
  const allowed = canExportDiagnostics();
  useEffect(() => { if (!allowed && active.current) diagnosticSession.cancel(); }, [allowed]);
  async function run(download: boolean) {
    if (active.current || !canExportDiagnostics()) return;
    let signal: AbortSignal;
    try { signal = diagnosticSession.begin(); } catch { setMessage('busy'); return; }
    active.current = signal; setMessage(null); setPhase('collecting');
    try {
      const snapshot = download && report ? report : finalizeReport(await collectReport(options, signal));
      abortIfNeeded(signal);
      if (!alive.current || !canExportDiagnostics()) return;
      setReport(snapshot);
      if (download) {
        setPhase('packing'); setPercent(0);
        const result = await createDiagnosticDownload(snapshot, signal, value => { if (alive.current) setPercent(Math.round(value)); });
        abortIfNeeded(signal);
        if (!alive.current || !canExportDiagnostics()) return;
        diagnosticDownloads.save(result.blob, result.filename);
        setMessage(result.fallback ? 'fallback' : 'downloaded');
      } else setMessage('ready');
    } catch { if (alive.current) setMessage(signal.aborted ? 'cancelled' : 'failed'); }
    finally { diagnosticSession.finish(signal); active.current = null; if (alive.current) setPhase('idle'); }
  }
  if (!allowed) return null;
  const busy = phase !== 'idle';
  const partial = report && ([report.environment, report.graphics, report.scene].some(item => !['ok', 'excluded'].includes(item.status)) || Object.values(report.manifest.omissions).some(n => n > 0));
  const time = (value: number | null) => value == null ? t('diagnostics.unavailable') : new Date(value).toLocaleString(getLocale());
  return <Box data-testid="diagnostics-panel" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <Typography variant="h6">{t('diagnostics.title')}</Typography>
    <Alert severity="info">{t('diagnostics.notice')}</Alert>
    <Typography variant="body2">{t('diagnostics.scope')}</Typography>
    <Typography variant="body2">{t('diagnostics.excluded')}</Typography>
    <Button component="a" href={`${import.meta.env.BASE_URL}compatibility/index.html?lang=${getLocale()}`} target="_blank" rel="noopener noreferrer">{t('diagnostics.environmentCheck')}</Button>
    <Typography variant="body2">{t('diagnostics.environmentCheckNotice')}</Typography>
    {(['logs', 'scene'] as const).map(key => <FormControlLabel key={key} control={<Checkbox checked={options[key]} disabled={busy} onChange={(_, checked) => { setOptions(previous => ({ ...previous, [key]: checked })); setReport(null); setMessage(null); }} />} label={t(`diagnostics.${key}`)} />)}
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Button variant="contained" disabled={busy} onClick={() => void run(true)}>{t('diagnostics.export')}</Button>
      <Button disabled={busy} onClick={() => void run(false)}>{t('diagnostics.refresh')}</Button>
      {busy && <Button onClick={() => diagnosticSession.cancel()}>{t('diagnostics.cancel')}</Button>}
    </Box>
    {busy && <><LinearProgress variant={phase === 'packing' ? 'determinate' : 'indeterminate'} value={percent} /><Typography role="status">{phase === 'packing' ? t('diagnostics.packing', { percent }) : t('diagnostics.collecting')}</Typography></>}
    {message && <Alert role="status" severity={message === 'failed' ? 'error' : message === 'fallback' ? 'warning' : 'info'}>{t(`diagnostics.${message}`)}</Alert>}
    {report && <>
      <Typography variant="body2">{t('diagnostics.captured', { time: new Date(report.manifest.generatedAt).toLocaleString(getLocale()), count: report.logs.length, omitted: report.manifest.omissions.freeText })}</Typography>
      <Typography variant="body2">{t('diagnostics.coverage', { from: time(report.manifest.logRange.from), to: time(report.manifest.logRange.to) })}</Typography>
      {partial && <Alert severity="warning">{t('diagnostics.partial')}</Alert>}
      <details><summary>{t('diagnostics.preview')}</summary><Box component="pre" data-testid="diagnostics-preview" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 420, overflow: 'auto' }}>{Object.entries(reportFiles(report)).map(([name, body]) => `${name}\n${body}`).join('\n\n')}</Box></details>
    </>}
  </Box>;
}
