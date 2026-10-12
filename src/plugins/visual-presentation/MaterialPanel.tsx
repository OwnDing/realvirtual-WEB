// SPDX-License-Identifier: AGPL-3.0-only
import { useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { RVViewer } from '../../core/rv-viewer';
import { getActiveAssetContext, subscribeActiveAsset, getActiveAssetVersion } from '../../core/editor/active-asset-store';
import { resolveActiveDocumentView } from '../../core/editor/active-document-view';
import { MATERIAL_PRESETS, applyMaterialToSelection, restoreOriginalMaterials, parseMaterial } from '../../core/presentation/materials';
import { PresentationError } from '../../core/presentation/look';
import { loadTemplates, saveTemplates } from '../../core/presentation/templates';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { presentationMessages } from '../../core/i18n/catalogs/presentation';
export function MaterialSwatch({ color, roughness, opacity = 1 }: { color: string; roughness: number; opacity?: number }) {
  return <Box aria-hidden sx={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', opacity, bgcolor: color,
    backgroundImage: `radial-gradient(circle at 30% 25%, rgba(255,255,255,${0.9 - roughness * 0.5}), transparent ${25 + roughness * 40}%, rgba(0,0,0,.7))`, boxShadow: '0 3px 6px #0005' }} />;
}
export default function MaterialPanel({ viewer, run, notify }: { viewer: RVViewer; run(fn: () => Promise<void> | void): void; notify(text: string): void }) {
  useRvTranslation('shell'); const m = presentationMessages(getLocale());
  useSyncExternalStore(subscribeActiveAsset, getActiveAssetVersion);
  useSyncExternalStore(viewer.selectionManager.subscribe, viewer.selectionManager.getSnapshot);
  const [value, setValue] = useState({ ...MATERIAL_PRESETS[0].value });
  const [group, setGroup] = useState('all');
  const [custom, setCustom] = useState(() => { try { return loadTemplates().materials; } catch { return []; } });
  const ctx = getActiveAssetContext(), editable = viewer.modes.activeMode === 'editor' && ctx?.viewer === viewer;
  return <Stack spacing={1.5}>
    <Alert severity="info">{m.materialHint}</Alert>
    {!editable && <Button onClick={() => run(async () => { await viewer.modes.requestMode('editor'); })}>{m.editor}</Button>}
    <TextField select size="small" label={m.materials} value={group} onChange={e => setGroup(e.target.value)}>{(['all', 'metal', 'paint', 'other'] as const).map(id => <MenuItem key={id} value={id}>{m[id]}</MenuItem>)}</TextField>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>{MATERIAL_PRESETS.filter(p => group === 'all' || p.group === group).map(p =>
      <Button key={p.id} variant={value.name === p.value.name ? 'outlined' : 'text'} onClick={() => setValue({ ...p.value })} sx={{ gap: 1, justifyContent: 'flex-start', textTransform: 'none' }}>
        <MaterialSwatch color={p.value.color} roughness={p.value.roughness} opacity={p.value.opacity} />{m[p.id as keyof typeof m]}
      </Button>)}</Box>
    {!!custom.length && <TextField select size="small" label={m.customMaterials} value="" onChange={e => setValue({ ...custom[Number(e.target.value)] })}>{custom.map((mat, i) => <MenuItem key={i} value={i}>{mat.name}</MenuItem>)}</TextField>}
    <TextField label={m.materialName} size="small" value={value.name} inputProps={{ maxLength: 80 }} onChange={e => setValue({ ...value, name: e.target.value })} />
    <TextField type="color" label={m.color} value={value.color} onChange={e => setValue({ ...value, color: e.target.value })} />
    {(['metalness', 'roughness', 'opacity'] as const).map(key => <TextField key={key} size="small" type="number" label={m[key]} value={value[key]} inputProps={{ min: 0, max: 1, step: 0.05 }} onChange={e => setValue({ ...value, [key]: Number(e.target.value), ...(key === 'opacity' ? { transparent: Number(e.target.value) < 1 } : {}) })} />)}
    <Button variant="contained" disabled={!editable} onClick={() => run(async () => {
      const current = getActiveAssetContext(); if (!current || current.viewer !== viewer || viewer.modes.activeMode !== 'editor') throw new PresentationError('readonly');
      const paths = [...viewer.selectionManager.selectedPaths];
      const nodes = paths.map(path => viewer.registry?.getNode(path)); if (nodes.some(node => !node)) throw new PresentationError('empty');
      await applyMaterialToSelection(current.doc, nodes.filter(node => node != null), paths, value);
      await current.doc.whenIdle(); viewer.markShadowsDirty(); viewer.markRenderDirty(); notify(m.applied);
    })}>{m.applyMaterial}</Button>
    <Button disabled={!editable} onClick={() => run(async () => {
      if (!ctx) throw new PresentationError('readonly');
      const nodes = viewer.selectionManager.selectedPaths.map(path => viewer.registry?.getNode(path)).filter(node => node != null);
      await restoreOriginalMaterials(ctx.doc, nodes); viewer.markShadowsDirty(); viewer.markRenderDirty(); notify(m.applied);
    })}>{m.restoreMaterial}</Button>
    <Stack direction="row"><Button disabled={!editable} onClick={() => run(async () => { await ctx?.doc.undo(); viewer.markShadowsDirty(); viewer.markRenderDirty(); })}>{m.undo}</Button><Button disabled={!editable} onClick={() => run(async () => { await ctx?.doc.redo(); viewer.markShadowsDirty(); viewer.markRenderDirty(); })}>{m.redo}</Button>
      <Button disabled={!editable} onClick={() => run(async () => {
        const view = resolveActiveDocumentView(viewer.modes.activeMode); if (!view) throw new PresentationError('readonly');
        const result = await view.actions.save(async initial => window.prompt(m.saveAsset, initial));
        if (result.status === 'error') throw new PresentationError('storage');
        if (result.status === 'blocked') throw new PresentationError('readonly');
        if (result.status !== 'cancelled') notify(m.saved);
      })}>{m.saveAsset}</Button></Stack>
    <Button onClick={() => run(() => { const valid = parseMaterial(value), bundle = loadTemplates(); const materials = [...bundle.materials.filter(mat => mat.name !== valid.name), valid]; saveTemplates({ ...bundle, materials }); setCustom(materials); notify(m.saved); })}>{m.saveMaterial}</Button>
    <Typography variant="caption">{m.advanced}</Typography>
  </Stack>;
}
