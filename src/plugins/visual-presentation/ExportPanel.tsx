// SPDX-License-Identifier: AGPL-3.0-only
import { UserHelpLink } from '../../core/hmi/UserHelpLink';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { RVViewer } from '../../core/rv-viewer';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { presentationMessages } from '../../core/i18n/catalogs/presentation';
import { captureDimensions, chooseRecordingMime, downloadBlob, exportImage, recordScene, type CaptureOptions, type Recording } from '../../core/presentation/capture';
import { PresentationError, isRecord } from '../../core/presentation/look';
import { parseDemoRecipe, type DemoRecipe } from '../../core/demo-package/recipe';
import FramingGuide from './FramingGuide';
import type { VisualPresentationPlugin } from './index';
const KEY = 'rv-presentation-output-v1';
type Options = { size: 'viewport' | '1080' | '4k'; shape: 'wide' | 'square' | 'portrait'; format: 'image/png' | 'image/jpeg'; background: CaptureOptions['background']; color: string; annotations: boolean };
const DEFAULTS: Options = { size: '1080', shape: 'wide', format: 'image/png', background: 'scene', color: '#ffffff', annotations: false };
function readOptions(): Options {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (isRecord(v) && ['viewport', '1080', '4k'].includes(String(v.size)) && ['wide', 'square', 'portrait'].includes(String(v.shape)) && ['image/png', 'image/jpeg'].includes(String(v.format)) && ['scene', 'solid', 'transparent'].includes(String(v.background)) && typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) && typeof v.annotations === 'boolean') return v as Options;
  } catch { /* Defaults when storage is unavailable or malformed. */ }
  return DEFAULTS;
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
}
export default function ExportPanel({ viewer, plugin }: { viewer: RVViewer; plugin: VisualPresentationPlugin }) {
  useRvTranslation('shell'); const m = presentationMessages(getLocale());
  const [options, setOptions] = useState(readOptions), [motion, setMotion] = useState<'manual' | 'orbit' | 'tour'>('manual');
  const [guide, setGuide] = useState(true);
  const [tour, setTour] = useState<DemoRecipe | null>(null), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(''), [error, setError] = useState<keyof ReturnType<typeof presentationMessages> | ''>('');
  const job = useRef<AbortController | null>(null), recorder = useRef<Recording | null>(null), mounted = useRef(true), file = useRef<HTMLInputElement>(null);
  const mime = typeof MediaRecorder === 'undefined' ? null : chooseRecordingMime(type => MediaRecorder.isTypeSupported(type));
  const cancel = () => { job.current?.abort(); recorder.current?.cancel(); };
  useEffect(() => {
    mounted.current = true;
    const stop = viewer.on('model-cleared', cancel), mode = viewer.on('mode-changed', cancel), unregister = plugin.registerExport(cancel);
    return () => { mounted.current = false; cancel(); stop(); mode(); unregister(); };
  }, [viewer, plugin]);
  const patch = (value: Partial<Options>) => { const next = { ...options, ...value }; setOptions(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Export still works for this session. */ } };
  const start = async (video: boolean) => {
    if (job.current) return;
    const controller = new AbortController(), root = viewer.currentModelRoot; job.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && viewer.currentModelRoot === root;
    setBusy(true); setError(''); setStatus(m.working);
    try {
      const [width, height] = captureDimensions(video ? '1080' : options.size, options.shape, viewer.renderer.domElement);
      const capture: CaptureOptions = { ...options, width, height };
      if (video) {
        if (!mime) throw new PresentationError('encoding');
        if (motion === 'tour' && !tour?.steps.length) throw new PresentationError('invalid');
        await viewer.whenLoadingIdle(); controller.signal.throwIfAborted();
        for (let count = 3; count > 0; count--) { if (!current() || document.hidden) throw new PresentationError('changed'); setStatus(`${m.countdown} ${count}`); await delay(1000, controller.signal); }
        const recordingJob = recordScene(viewer, capture, mime, motion === 'tour' ? tour! : motion, controller.signal, (ms, frames) => {
          if (current()) setStatus(`${m.recording} ${(ms / 1000).toFixed(1)} ${m.seconds} · ${m.actualFps} ${(frames * 1000 / Math.max(1, ms)).toFixed(1)}`);
        });
        recorder.current = recordingJob; setRecording(true);
        const result = await recordingJob.result;
        if (current()) { downloadBlob(result.blob, `presentation.${result.blob.type.startsWith('video/mp4') ? 'mp4' : 'webm'}`); setStatus(result.reason === 'background' ? m.stoppedBackground : result.reason === 'limit' ? m.stoppedLimit : m.done); }
      } else {
        const blob = await exportImage(viewer, capture, options.format, controller.signal);
        if (current()) { downloadBlob(blob, `presentation.${options.format === 'image/png' ? 'png' : 'jpg'}`); setStatus(m.done); }
      }
    } catch (err) {
      if (mounted.current) {
        if (controller.signal.aborted) setStatus('');
        else { setError(err instanceof PresentationError ? `error_${err.code}` : 'error_unknown'); setStatus(''); }
      }
    } finally { if (job.current === controller) { job.current = null; recorder.current = null; if (mounted.current) { setBusy(false); setRecording(false); } } }
  };
  return <Stack spacing={1.5}>
    {guide && !busy && <FramingGuide canvas={viewer.renderer.domElement} aspect={options.size === 'viewport' ? null : options.shape === 'wide' ? 16 / 9 : options.shape === 'portrait' ? 9 / 16 : 1} />}
    {error && <Alert severity="error" action={<UserHelpLink topic="media" />}>{m[error]}</Alert>}<Typography role="status">{status}</Typography>
    <Box component="fieldset" disabled={busy} sx={{ border: 0, m: 0, p: 0 }}><Stack spacing={1.5}>
      <TextField select label={m.resolution} size="small" value={options.size} onChange={e => patch({ size: e.target.value as Options['size'] })}><MenuItem value="viewport">{m.viewport}</MenuItem><MenuItem value="1080">1920 × 1080</MenuItem><MenuItem value="4k">3840 × 2160</MenuItem></TextField>
      <TextField select label={m.shape} size="small" value={options.shape} disabled={options.size === 'viewport'} onChange={e => patch({ shape: e.target.value as Options['shape'] })}>{(['wide', 'square', 'portrait'] as const).map(id => <MenuItem key={id} value={id}>{m[id]}</MenuItem>)}</TextField>
      <FormControlLabel label={m.guide} control={<Checkbox checked={guide} onChange={(_, value) => setGuide(value)} />} />
      <Typography variant="caption">{m.guideHint}</Typography>
      <TextField select label={m.format} size="small" value={options.format} onChange={e => patch({ format: e.target.value as Options['format'], ...(e.target.value === 'image/jpeg' && options.background === 'transparent' ? { background: 'scene' } : {}) })}><MenuItem value="image/png">PNG</MenuItem><MenuItem value="image/jpeg">JPEG</MenuItem></TextField>
      <TextField select label={m.backgroundMode} size="small" value={options.background} onChange={e => patch({ background: e.target.value as Options['background'] })}>{(['scene', 'solid', 'transparent'] as const).map(id => <MenuItem key={id} value={id} disabled={id === 'transparent' && options.format !== 'image/png'}>{m[id]}</MenuItem>)}</TextField>
      {options.background === 'solid' && <TextField type="color" label={m.color} value={options.color} onChange={e => patch({ color: e.target.value })} />}
      {options.background === 'transparent' && <Alert severity="info">{m.transparentHint}</Alert>}
      <FormControlLabel label={m.annotations} control={<Checkbox checked={options.annotations} onChange={(_, value) => patch({ annotations: value })} />} />
      <Button variant="contained" disabled={viewer.isWebGPU} onClick={() => void start(false)}>{m.image}</Button>
      <Typography variant="subtitle1">{m.video}</Typography><Typography variant="caption">{m.recordHint}</Typography>
      <TextField select label={m.motion} size="small" value={motion} onChange={e => setMotion(e.target.value as typeof motion)}>{(['manual', 'orbit', 'tour'] as const).map(id => <MenuItem key={id} value={id}>{m[id]}</MenuItem>)}</TextField>
      {motion === 'tour' && <><Button onClick={() => file.current?.click()}>{m.loadTour}</Button><Typography variant="caption">{tour?.title ?? m.noTour}</Typography></>}
      <input hidden ref={file} type="file" accept=".json,application/json" onChange={e => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (f) void (async () => { try { if (f.size > 512 * 1024) throw new PresentationError('size'); const recipe = parseDemoRecipe(JSON.parse(await f.text())); if (!recipe.steps.length) throw new PresentationError('invalid'); if (mounted.current) { setTour(recipe); setError(''); } } catch { if (mounted.current) setError('error_invalid'); } })();
      }} />
      <Typography variant="caption">{mime?.startsWith('video/mp4') ? 'MP4' : mime ? 'WebM' : m.unavailable}</Typography>
      <Button variant="outlined" disabled={viewer.isWebGPU || !mime || options.background === 'transparent' || (motion === 'tour' && !tour)} onClick={() => void start(true)}>{m.start}</Button>
    </Stack></Box>
    {busy && <Stack direction="row">{recording && <Button onClick={() => recorder.current?.stop()}>{m.stop}</Button>}<Button onClick={cancel}>{m.cancel}</Button></Stack>}
  </Stack>;
}
