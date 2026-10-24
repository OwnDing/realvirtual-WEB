// SPDX-License-Identifier: AGPL-3.0-only
import { UserHelpLink } from '../../core/hmi/UserHelpLink';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Slider, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import type { RVViewer } from '../../core/rv-viewer';
import type { VisualPresentationPlugin } from './index';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { presentationMessages } from '../../core/i18n/catalogs/presentation';
import { defaultLook, STYLE_IDS, PresentationError, type PresentationLook } from '../../core/presentation/look';
import { saveProjectLook } from '../../core/presentation/project-look';
import { loadTemplates, saveTemplates, parseTemplateBundle } from '../../core/presentation/templates';
import { downloadBlob } from '../../core/presentation/capture';
import { LeftPanel } from '../../core/hmi/LeftPanel';
import MaterialPanel from './MaterialPanel';
import ExportPanel from './ExportPanel';
function StylePreview({ id }: { id: string }) {
  const dark = id === 'dark', technical = id === 'technical';
  return <svg viewBox="0 0 180 82" width="100%" aria-hidden>
    <rect width="180" height="82" fill={dark ? '#172230' : id === 'product' ? '#fff' : '#dfe6ec'} />
    <path d="M0 65L100 28L180 48V82H0Z" fill={dark ? '#243142' : '#c1cbd0'} />
    <ellipse cx="93" cy="67" rx="55" ry="9" fill="#000" opacity=".13" />
    <g stroke={technical ? '#193a50' : '#657e90'} strokeWidth={technical ? 1.4 : .5}>
      <path d="M44 26L89 12L127 32L83 47Z" fill="#c6dce5"/><path d="M44 26L83 47V69L44 48Z" fill="#5f8fa9"/><path d="M83 47L127 32V55L83 69Z" fill="#91b4c7"/>
      <path d="M108 47L145 37L165 49L128 61Z" fill="#a4b2bf"/><path d="M128 61L165 49V60L128 73Z" fill="#748da0"/>
    </g>
  </svg>;
}
export default function PresentationPanel({ viewer, plugin }: { viewer: RVViewer; plugin: VisualPresentationPlugin }) {
  useRvTranslation('shell'); const m = presentationMessages(getLocale());
  const state = useSyncExternalStore(plugin.subscribe, plugin.getSnapshot);
  const [tab, setTab] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState<keyof ReturnType<typeof presentationMessages> | ''>(''), [notice, setNotice] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState(() => { try { return loadTemplates().templates; } catch { return []; } });
  const input = useRef<HTMLInputElement>(null), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') plugin.setOpen(false); };
    document.addEventListener('keydown', close);
    return () => { mounted.current = false; document.removeEventListener('keydown', close); };
  }, [plugin]);
  const apply = (look: PresentationLook) => {
    setError('');
    try { plugin.apply(look); } catch (err) { setError(err instanceof PresentationError ? `error_${err.code}` : 'error_unknown'); }
  };
  const run = (fn: () => Promise<void> | void) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    Promise.resolve().then(fn).catch(err => { if (mounted.current) setError(err instanceof PresentationError ? `error_${err.code}` : 'error_unknown'); })
      .finally(() => { if (mounted.current) setBusy(false); });
  };
  return <LeftPanel title={m.title} width={410} onClose={() => plugin.setOpen(false)}><Box role="region" aria-label={m.title} data-testid="presentation-panel" sx={{ p: 2, overflowY: 'auto' }}>
    <Stack spacing={1.5}>
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="fullWidth" aria-label={m.title}><Tab label={m.style} /><Tab label={m.materials} /><Tab label={m.output} /></Tabs>
      <Typography variant="caption">{m.backend}</Typography>
      {viewer.isWebGPU && <Alert severity="warning">{m.webgpu}</Alert>}
      {(error || state.error) && <Alert severity="error" action={<UserHelpLink topic="appearance" />}>{error ? m[error] : m[`error_${state.error}` as keyof typeof m] || m.error_unknown}</Alert>}
      <Typography role="status" variant="body2">{busy ? m.working : notice}</Typography>
      <Box component="fieldset" disabled={busy} sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}>
        {tab === 0 && <Stack spacing={1.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>{STYLE_IDS.map(id => <Button key={id} data-testid={`presentation-style-${id}`} variant={state.active && state.look.style === id ? 'outlined' : 'text'} onClick={() => run(() => plugin.apply(defaultLook(id)))} sx={{ display: 'block', p: 0.5, textTransform: 'none' }}>
            <StylePreview id={id} /><Typography variant="subtitle2">{m[id]}</Typography><Typography variant="caption" component="p">{m[`${id}Hint`]}</Typography>
          </Button>)}</Box>
          {(['brightness', 'background', 'shadow', 'reflection'] as const).map(key => <Box key={key}><Typography variant="body2" id={`look-${key}`}>{m[key]}</Typography><Slider aria-labelledby={`look-${key}`} min={0} max={key === 'shadow' ? 3 : key === 'reflection' ? 1 : 2} step={0.05} value={state.look[key]} onChange={(_, v) => apply({ ...state.look, [key]: v as number })} /></Box>)}
          <FormControlLabel label={m.ground} control={<Checkbox checked={state.look.ground} onChange={(_, value) => run(() => plugin.apply({ ...state.look, ground: value }))} />} />
          <Button onClick={() => run(() => plugin.apply(defaultLook(state.look.style)))}>{m.reset}</Button>
          {!state.active && <Alert severity="info">{m.customLook}</Alert>}
          <Typography variant="caption">{m.qualityHint}</Typography><Typography variant="caption">{m.projectHint}</Typography>
          <Stack direction="row"><Button disabled={!state.active} onClick={() => run(async () => { await saveProjectLook(state.look); setNotice(m.saved); })}>{m.projectSave}</Button><Button onClick={() => run(() => plugin.restoreProject())}>{m.projectLoad}</Button></Stack>
          <TextField select size="small" label={m.personal} value="" onChange={e => run(() => { const template = templates.find(t => t.id === e.target.value); if (template) plugin.apply(template.look); })}>{templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}</TextField>
          <TextField size="small" label={m.templateName} value={templateName} inputProps={{ maxLength: 80 }} onChange={e => setTemplateName(e.target.value)} />
          <Button disabled={!state.active || !templateName.trim()} onClick={() => run(() => { const bundle = loadTemplates(); const next = [...bundle.templates.filter(t => t.name !== templateName.trim()), { id: crypto.randomUUID(), name: templateName.trim(), look: state.look }]; saveTemplates({ ...bundle, templates: next }); setTemplates(next); setNotice(m.saved); })}>{m.saveTemplate}</Button>
          <Stack direction="row"><Button onClick={() => input.current?.click()}>{m.importTemplates}</Button><Button onClick={() => run(() => downloadBlob(new Blob([JSON.stringify(loadTemplates(), null, 2)], { type: 'application/json' }), 'presentation-templates.json'))}>{m.exportTemplates}</Button></Stack>
          <input hidden ref={input} type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(async () => { if (f.size > 256 * 1024) throw new PresentationError('size'); const bundle = parseTemplateBundle(JSON.parse(await f.text())); if (!mounted.current) return; saveTemplates(bundle); setTemplates(bundle.templates); setNotice(m.saved); }); }} />
          <Typography variant="caption">{m.advanced}</Typography>
        </Stack>}
        {tab === 1 && <MaterialPanel viewer={viewer} run={run} notify={setNotice} />}
        {tab === 2 && <ExportPanel viewer={viewer} plugin={plugin} />}
      </Box>
    </Stack>
  </Box></LeftPanel>;
}
