// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Portal, Stack, TextField, Typography } from '@mui/material';
import { PerspectiveCamera, Vector3 } from 'three';
import type { RVViewer } from '../rv-viewer';
import { getLocale, useRvTranslation } from '../i18n';
import { demoMessages } from '../i18n/catalogs/demo-package';
import { resolveActiveDocumentView, type ActiveDocumentActions } from '../editor/active-document-view';
import { DemoPackageError, demoFileName, parseDemoCamera, parseDemoRecipe, MAX_DEMO_STEPS, type DemoCamera, type DemoRecipe, type DemoStep } from './recipe';
import { createDemoHtml } from './html';
import { loadDemoArtifacts } from './artifacts';
import { preflightDemoGlb } from './preflight';

// An encoder cannot be aborted. Keep its slot across panel unmounts so a
// close/reopen or document switch cannot overlap large snapshots in one viewer.
const encoders = new WeakMap<RVViewer, Promise<ArrayBuffer>>();
async function encodeSnapshot(viewer: RVViewer, run: () => Promise<ArrayBuffer>, signal: AbortSignal): Promise<ArrayBuffer> {
  let previous = encoders.get(viewer);
  while (previous) {
    await previous.catch(() => {});
    signal.throwIfAborted();
    previous = encoders.get(viewer);
  }
  signal.throwIfAborted();
  const pending = run();
  encoders.set(viewer, pending);
  try { return await pending; }
  finally { if (encoders.get(viewer) === pending) encoders.delete(viewer); }
}

export function captureDemoCamera(viewer: Pick<RVViewer, 'camera' | 'controls'>): DemoCamera {
  if (!(viewer.camera instanceof PerspectiveCamera)) throw new DemoPackageError('camera');
  return parseDemoCamera({ position: viewer.camera.position.toArray(), target: viewer.controls.target.toArray(), fov: viewer.camera.fov });
}
function download(data: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export default function DemoExportPanel({ viewer, capability, name, mode, onClose }: {
  viewer: RVViewer; capability: NonNullable<ActiveDocumentActions['exportDemo']>; name: string; mode: string; onClose(): void;
}) {
  useRvTranslation('shell');
  const m = demoMessages(getLocale());
  const [recipe, setRecipe] = useState<DemoRecipe>(() => ({ schemaVersion: 1, title: name.slice(0, 120), locale: getLocale() === 'en-US' ? 'en-US' : 'zh-CN', loop: true,
    startCamera: { position: [3, 3, 3], target: [0, 0, 0], fov: 50 }, steps: [] }));
  const [captured, setCaptured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const job = useRef<AbortController | null>(null);
  const active = useRef(true);
  const file = useRef<HTMLInputElement>(null);
  const report = (err: unknown) => { setError(err instanceof DemoPackageError ? m[`error_${err.code}`] : m.error_unknown); setNotice(undefined); };
  useEffect(() => {
    active.current = true;
    try { const camera = captureDemoCamera(viewer); setRecipe(r => ({ ...r, startCamera: camera })); setCaptured(true); }
    catch (err) { report(err); }
    return () => { active.current = false; job.current?.abort(); };
    // The parent unmounts this panel when document identity or mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, capability.identity]);
  const cancel = () => {
    if (!job.current) return;
    job.current.abort();
    setNotice(m.cancelling);
  };
  const capture = (add: boolean) => {
    try {
      const camera = captureDemoCamera(viewer); setError(undefined);
      if (add) setRecipe(r => ({ ...r, steps: [...r.steps, { id: crypto.randomUUID(), title: `${r.steps.length + 1}`, description: '', camera, durationMs: 1200, dwellMs: 4000 }] }));
      else { setRecipe(r => ({ ...r, startCamera: camera })); setCaptured(true); setNotice(m.savedStart); }
    } catch (err) { report(err); }
  };
  const preview = (camera: DemoCamera) => {
    if (!(viewer.camera instanceof PerspectiveCamera)) { report(new DemoPackageError('camera')); return; }
    viewer.camera.fov = camera.fov; viewer.camera.updateProjectionMatrix();
    viewer.animateCameraTo(new Vector3(...camera.position), new Vector3(...camera.target), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.4);
  };
  const edit = (index: number, patch: Partial<DemoStep>) => setRecipe(r => ({ ...r, steps: r.steps.map((s, i) => i === index ? { ...s, ...patch } : s) }));
  const move = (index: number, delta: number) => setRecipe(r => { const steps = [...r.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]]; return { ...r, steps }; });
  const save = () => {
    try { if (!captured) throw new DemoPackageError('camera'); const valid = parseDemoRecipe(recipe); download(JSON.stringify(valid, null, 2), `${demoFileName(valid.title)}.demo.json`, 'application/json'); setError(undefined); }
    catch (err) { report(err); }
  };
  const load = async (input: File) => {
    try {
      if (input.size > 512 * 1024) throw new DemoPackageError('recipe');
      const value: unknown = JSON.parse(await input.text()); const valid = parseDemoRecipe(value);
      if (!active.current) return;
      setRecipe(valid); setCaptured(true); setError(undefined); setNotice(undefined);
    } catch (err) { if (active.current) report(err instanceof SyntaxError ? new DemoPackageError('recipe') : err); }
  };
  const run = async () => {
    if (job.current) return;
    const controller = new AbortController(); job.current = controller;
    const root = viewer.currentModelRoot;
    const current = () => active.current && !controller.signal.aborted && viewer.currentModelRoot === root && resolveActiveDocumentView(mode)?.actions.exportDemo?.identity === capability.identity;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      if (!captured) throw new DemoPackageError('camera'); const valid = parseDemoRecipe(recipe);
      const bytes = new Uint8Array(await encodeSnapshot(viewer, () => {
        if (!current()) throw new DemoPackageError('changed');
        return capability.run();
      }, controller.signal));
      if (!current()) throw new DemoPackageError('changed');
      preflightDemoGlb(bytes);
      const artifacts = await loadDemoArtifacts(controller.signal);
      if (!current()) throw new DemoPackageError('changed');
      const html = createDemoHtml(valid, bytes, artifacts, __RV_VERSION__);
      if (!current()) throw new DemoPackageError('changed');
      download(html, `${demoFileName(valid.title)}.html`, 'text/html'); setNotice(m.ready);
    } catch (err) { if (active.current && !controller.signal.aborted) report(err); }
    finally { if (job.current === controller) { job.current = null; if (active.current) { setBusy(false); if (controller.signal.aborted) setNotice(undefined); } } }
  };
  return <Portal><Paper role="region" aria-label={m.title} data-testid="demo-export-panel" elevation={8}
    sx={{ position: 'fixed', right: 16, top: 76, bottom: 28, width: 380, maxWidth: 'calc(100vw - 32px)', zIndex: 1250, overflowY: 'auto', p: 2 }}>
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between"><Typography component="h2" variant="h6">{m.title}</Typography><Button onClick={() => { cancel(); onClose(); }}>{m.close}</Button></Stack>
      <Typography variant="body2">{m.intro}</Typography><Alert severity="info" role="note">{m.boundary}</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography role="status" variant="body2">{busy ? notice ?? m.working : notice}</Typography>
      <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}><Stack spacing={1.5}>
        <TextField label={m.name} value={recipe.title} size="small" inputProps={{ maxLength: 120 }} onChange={e => setRecipe(r => ({ ...r, title: e.target.value }))} />
        <TextField select label={m.language} value={recipe.locale} size="small" onChange={e => setRecipe(r => ({ ...r, locale: e.target.value as DemoRecipe['locale'] }))}><MenuItem value="zh-CN">{new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of('zh-Hans')}</MenuItem><MenuItem value="en-US">{new Intl.DisplayNames(['en-US'], { type: 'language' }).of('en')}</MenuItem></TextField>
        <Stack direction="row" spacing={1}><Button onClick={() => capture(false)}>{m.start}</Button><Button onClick={() => capture(true)} disabled={recipe.steps.length >= MAX_DEMO_STEPS}>{m.add}</Button></Stack>
        <FormControlLabel control={<Checkbox checked={recipe.loop} onChange={e => setRecipe(r => ({ ...r, loop: e.target.checked }))} />} label={m.loop} />
        {!recipe.steps.length && <Typography variant="body2">{m.empty}</Typography>}
        {recipe.steps.map((step, index) => <Paper variant="outlined" key={step.id} data-testid="demo-shot" sx={{ p: 1 }}><Stack spacing={1}>
          <TextField label={`${index + 1}. ${m.stepTitle}`} value={step.title} size="small" inputProps={{ maxLength: 120 }} onChange={e => edit(index, { title: e.target.value })} />
          <TextField label={m.description} value={step.description} size="small" multiline inputProps={{ maxLength: 2000 }} onChange={e => edit(index, { description: e.target.value })} />
          <Stack direction="row" spacing={1}><TextField label={m.transition} type="number" value={step.durationMs / 1000} size="small" inputProps={{ min: 0, max: 10, step: 0.1 }} onChange={e => edit(index, { durationMs: Number(e.target.value) * 1000 })} /><TextField label={m.dwell} type="number" value={step.dwellMs / 1000} size="small" inputProps={{ min: 1, max: 60, step: 1 }} onChange={e => edit(index, { dwellMs: Number(e.target.value) * 1000 })} /></Stack>
          <Stack direction="row"><Button onClick={() => preview(step.camera)}>{m.preview}</Button><Button disabled={!index} onClick={() => move(index, -1)}>{m.up}</Button><Button disabled={index === recipe.steps.length - 1} onClick={() => move(index, 1)}>{m.down}</Button><Button onClick={() => setRecipe(r => ({ ...r, steps: r.steps.filter(s => s.id !== step.id) }))}>{m.remove}</Button></Stack>
        </Stack></Paper>)}
        <Stack direction="row"><Button onClick={save}>{m.save}</Button><Button onClick={() => file.current?.click()}>{m.load}</Button></Stack>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f); }} />
        <Button variant="contained" onClick={() => void run()}>{m.export}</Button>
      </Stack></Box>
      {busy && <Button onClick={cancel}>{m.cancel}</Button>}
    </Stack>
  </Paper></Portal>;
}
