// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  Add,
  AutoAwesome,
  CheckCircleOutline,
  CloudUpload,
  Redo,
  Undo,
  ViewInAr,
} from '@mui/icons-material';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import { LeftPanel } from '../../core/hmi/LeftPanel';
import { RV_SCROLL_CLASS } from '../../core/hmi/shared-sx';
import { useRvTranslation } from '../../core/i18n';
import { UnifiedImportDialog } from '../unified-import/UnifiedImportDialog';
import {
  SMART_SIGNAL_TYPES,
  type PaintProcessKind,
  type SmartAssetIssue,
  type SmartSignalType,
  type SmartTemplateId,
} from './smart-asset-model';
import type { SmartAssetEditorPlugin, SmartAssetEditorSnapshot } from './index';

const PANEL_ID = 'smart-asset-editor';
const PANEL_WIDTH = 410;
const NO_SUBSCRIBE = () => () => {};
const EMPTY_SNAPSHOT: SmartAssetEditorSnapshot = {
  status: 'inactive', message: null,
  report: {
    issues: [], errorCount: 0, warningCount: 0, nodeCount: 0, meshCount: 0,
    portCount: 0, signalCount: 0, templateCount: 0, publishable: false,
  },
  documentVersion: 0,
};

function editorOf(viewer: UISlotProps['viewer']): SmartAssetEditorPlugin | null {
  return viewer.getPlugin('asset-editor') as SmartAssetEditorPlugin | undefined ?? null;
}

export function SmartAssetEditorButton({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('assets');
  const manager = viewer.leftPanelManager;
  const snap = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const active = snap.activePanel === PANEL_ID;
  return (
    <Tooltip title={t('smartEditor.title')} placement="right">
      <IconButton
        size="small"
        color={active ? 'primary' : 'inherit'}
        aria-label={t('smartEditor.title')}
        data-testid="smart-asset-editor-button"
        onClick={() => manager.toggle(PANEL_ID, PANEL_WIDTH)}
        sx={{ p: 0.75 }}
      >
        <AutoAwesome fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export function SmartAssetEditorPanel({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('assets');
  const manager = viewer.leftPanelManager;
  const panel = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const plugin = editorOf(viewer);
  const snap = useSyncExternalStore(
    plugin?.subscribe ?? NO_SUBSCRIBE,
    plugin?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
  const [width, setWidth] = useState(PANEL_WIDTH);
  const [tab, setTab] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => { setName(plugin?.document?.name ?? ''); }, [plugin, snap.documentVersion]);
  if (panel.activePanel !== PANEL_ID) return null;

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setLocalError(null);
    try { await action(); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  };
  const busy = snap.status === 'loading' || snap.status === 'saving';

  return (
    <>
      <LeftPanel
        title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AutoAwesome color="primary" sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2" data-testid="smart-editor-title">{t('smartEditor.title')}</Typography>
        </Box>}
        onClose={() => manager.close(PANEL_ID)}
        width={width}
        resizable
        minWidth={360}
        maxWidth={560}
        onResize={setWidth}
      >
        <Tabs
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t('smartEditor.steps')}
          data-testid="smart-editor-tabs"
          sx={{ minHeight: 38, borderBottom: '1px solid rgba(255,255,255,0.08)', '& .MuiTab-root': { minHeight: 38, minWidth: 70, fontSize: 10, px: 1 } }}
        >
          <Tab label={t('smartEditor.overview')} />
          <Tab label={t('smartEditor.ports')} />
          <Tab label={t('smartEditor.behavior')} />
          <Tab label={t('smartEditor.signals')} />
          <Tab label={t('smartEditor.validate')} />
        </Tabs>

        <Box className={RV_SCROLL_CLASS} sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
          {busy && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption">{snap.message}</Typography>
          </Box>}
          {(localError || (snap.status === 'error' && snap.message)) && (
            <Alert severity="error" onClose={() => { setLocalError(null); plugin?.clearMessage(); }} sx={{ mb: 1 }}>
              {localError ?? snap.message}
            </Alert>
          )}
          {snap.status === 'ready' && snap.message && (
            <Alert severity="success" onClose={() => plugin?.clearMessage()} sx={{ mb: 1 }}>{snap.message}</Alert>
          )}

          {tab === 0 && <OverviewTab
            viewer={viewer}
            name={name}
            setName={setName}
            plugin={plugin}
            busy={busy}
            onImport={() => setImportOpen(true)}
            run={run}
            t={t}
          />}
          {tab === 1 && <PortsTab plugin={plugin} busy={busy} run={run} t={t} />}
          {tab === 2 && <BehaviorTab plugin={plugin} busy={busy} run={run} t={t} />}
          {tab === 3 && <SignalsTab plugin={plugin} busy={busy} run={run} t={t} />}
          {tab === 4 && <ValidationTab plugin={plugin} snap={snap} busy={busy} run={run} t={t} />}
        </Box>
      </LeftPanel>
      {importOpen && <UnifiedImportDialog viewer={viewer} open onClose={() => setImportOpen(false)} />}
    </>
  );
}

type T = ReturnType<typeof useRvTranslation<'assets'>>['t'];
type Run = (action: () => Promise<unknown>) => Promise<void>;

function OverviewTab({ viewer, name, setName, plugin, busy, onImport, run, t }: {
  viewer: UISlotProps['viewer'];
  name: string;
  setName: (name: string) => void;
  plugin: SmartAssetEditorPlugin | null;
  busy: boolean;
  onImport: () => void;
  run: Run;
  t: T;
}) {
  const doc = plugin?.document;
  const docSnap = doc?.getSnapshot();
  const selected = viewer.selectionManager.getSnapshot().primaryPath;
  return <Stack spacing={1.5}>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('smartEditor.assetIdentity')}</Typography>
    <TextField
      size="small"
      label={t('smartEditor.assetName')}
      value={name}
      disabled={!doc || busy}
      onChange={event => setName(event.target.value)}
      onBlur={() => plugin?.rename(name)}
      inputProps={{ 'data-testid': 'smart-asset-name' }}
    />
    <Typography variant="caption" color="text.secondary">
      {selected ? t('smartEditor.selectedNode', { path: selected }) : t('smartEditor.selectHint')}
    </Typography>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Button size="small" variant="outlined" startIcon={<ViewInAr />} onClick={onImport} disabled={!doc || busy} data-testid="smart-import-glb">
        {t('smartEditor.importGlb')}
      </Button>
      <Button size="small" variant="outlined" startIcon={<AccountTree />} onClick={() => plugin?.openHierarchy()} disabled={!doc}>
        {t('smartEditor.hierarchy')}
      </Button>
      <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => void run(() => plugin!.newAsset())} disabled={!plugin || busy} data-testid="smart-new-asset">
        {t('smartEditor.newAsset')}
      </Button>
    </Stack>
    <Divider />
    <Stack direction="row" spacing={1}>
      <Button size="small" startIcon={<Undo />} disabled={!docSnap?.canUndo || busy} onClick={() => void run(() => plugin!.undo())}>
        {t('smartEditor.undo')}
      </Button>
      <Button size="small" startIcon={<Redo />} disabled={!docSnap?.canRedo || busy} onClick={() => void run(() => plugin!.redo())}>
        {t('smartEditor.redo')}
      </Button>
    </Stack>
    <Alert severity="info">{t('smartEditor.overviewHint')}</Alert>
  </Stack>;
}

function PortsTab({ plugin, busy, run, t }: { plugin: SmartAssetEditorPlugin | null; busy: boolean; run: Run; t: T }) {
  const [portId, setPortId] = useState('track.in');
  const [typeId, setTypeId] = useState('paintline-track-v1');
  const [flow, setFlow] = useState<'in' | 'out' | 'bidi'>('in');
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 0]);
  const [direction, setDirection] = useState<[number, number, number]>([0, 0, -1]);
  return <Stack spacing={1.25}>
    <Alert severity="info">{t('smartEditor.portHint')}</Alert>
    <TextField size="small" label={t('smartEditor.portId')} value={portId} onChange={e => setPortId(e.target.value)} />
    <TextField size="small" label={t('smartEditor.typeId')} value={typeId} onChange={e => setTypeId(e.target.value)} />
    <FormControl size="small"><InputLabel>{t('smartEditor.flow')}</InputLabel>
      <Select value={flow} label={t('smartEditor.flow')} onChange={e => setFlow(e.target.value as typeof flow)}>
        <MenuItem value="in">{t('smartEditor.flowIn')}</MenuItem>
        <MenuItem value="out">{t('smartEditor.flowOut')}</MenuItem>
        <MenuItem value="bidi">{t('smartEditor.flowBoth')}</MenuItem>
      </Select>
    </FormControl>
    <VectorFields label={t('smartEditor.position')} value={position} onChange={setPosition} />
    <VectorFields label={t('smartEditor.direction')} value={direction} onChange={setDirection} />
    <Button
      variant="contained"
      startIcon={<Add />}
      disabled={!plugin?.document || busy || !portId.trim() || !typeId.trim()}
      onClick={() => void run(() => plugin!.addPort({ portId, typeId, flow, position, direction }))}
      data-testid="smart-add-port"
    >{t('smartEditor.addPort')}</Button>
  </Stack>;
}

function VectorFields({ label, value, onChange }: {
  label: string; value: [number, number, number]; onChange: (value: [number, number, number]) => void;
}) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography>
    <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <TextField
        key={axis} size="small" type="number" label={axis} value={value[index]}
        onChange={event => {
          const next = [...value] as [number, number, number];
          next[index] = Number(event.target.value);
          onChange(next);
        }}
      />)}
    </Stack>
  </Box>;
}

const TEMPLATE_IDS: SmartTemplateId[] = [
  'metadata', 'transport-surface', 'paint-track', 'paint-process-zone', 'paint-controller', 'paint-robot',
];
const PROCESS_KINDS: PaintProcessKind[] = ['load-unload', 'pretreat', 'spray', 'dry', 'cool', 'buffer'];

function BehaviorTab({ plugin, busy, run, t }: { plugin: SmartAssetEditorPlugin | null; busy: boolean; run: Run; t: T }) {
  const [template, setTemplate] = useState<SmartTemplateId>('paint-track');
  const [length, setLength] = useState(2);
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(2);
  const [speed, setSpeed] = useState(0.35);
  const [pitch, setPitch] = useState(1.5);
  const [kind, setKind] = useState<PaintProcessKind>('spray');
  return <Stack spacing={1.25}>
    <Alert severity="info">{t('smartEditor.templateHint')}</Alert>
    <FormControl size="small"><InputLabel>{t('smartEditor.template')}</InputLabel>
      <Select value={template} label={t('smartEditor.template')} onChange={e => setTemplate(e.target.value as SmartTemplateId)}>
        {TEMPLATE_IDS.map(id => <MenuItem key={id} value={id}>{t(`smartEditor.templateNames.${id}`)}</MenuItem>)}
      </Select>
    </FormControl>
    <Stack direction="row" spacing={0.75}>
      <NumberField label={t('smartEditor.length')} value={length} setValue={setLength} />
      <NumberField label={t('smartEditor.width')} value={width} setValue={setWidth} />
      <NumberField label={t('smartEditor.height')} value={height} setValue={setHeight} />
    </Stack>
    {template === 'paint-process-zone' && <FormControl size="small"><InputLabel>{t('smartEditor.processKind')}</InputLabel>
      <Select value={kind} label={t('smartEditor.processKind')} onChange={e => setKind(e.target.value as PaintProcessKind)}>
        {PROCESS_KINDS.map(id => <MenuItem key={id} value={id}>{t(`smartEditor.processKinds.${id}`)}</MenuItem>)}
      </Select>
    </FormControl>}
    {template === 'paint-controller' && <Stack direction="row" spacing={0.75}>
      <NumberField label={t('smartEditor.speed')} value={speed} setValue={setSpeed} />
      <NumberField label={t('smartEditor.pitch')} value={pitch} setValue={setPitch} />
    </Stack>}
    <Button
      variant="contained"
      startIcon={<AutoAwesome />}
      disabled={!plugin?.document || busy}
      onClick={() => void run(() => plugin!.applyTemplate(template, {
        length, width, height, speed, pitch, processKind: kind,
      }))}
      data-testid="smart-apply-template"
    >{t('smartEditor.applyTemplate')}</Button>
  </Stack>;
}

function NumberField({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <TextField size="small" type="number" label={label} value={value} onChange={e => setValue(Number(e.target.value))} />;
}

function SignalsTab({ plugin, busy, run, t }: { plugin: SmartAssetEditorPlugin | null; busy: boolean; run: Run; t: T }) {
  const [name, setName] = useState('ConveyorRunning');
  const [type, setType] = useState<SmartSignalType>('PLCOutputBool');
  const [comment, setComment] = useState('');
  const [initial, setInitial] = useState('0');
  const isBool = type.endsWith('Bool');
  return <Stack spacing={1.25}>
    <Alert severity="info">{t('smartEditor.signalDirectionHint')}</Alert>
    <TextField size="small" label={t('smartEditor.signalName')} value={name} onChange={e => setName(e.target.value)} />
    <FormControl size="small"><InputLabel>{t('smartEditor.signalType')}</InputLabel>
      <Select value={type} label={t('smartEditor.signalType')} onChange={e => setType(e.target.value as SmartSignalType)}>
        {SMART_SIGNAL_TYPES.map(id => <MenuItem key={id} value={id}>{id}</MenuItem>)}
      </Select>
    </FormControl>
    <TextField size="small" label={t('smartEditor.comment')} value={comment} onChange={e => setComment(e.target.value)} />
    <TextField
      size="small"
      label={t('smartEditor.initialValue')}
      value={initial}
      onChange={e => setInitial(e.target.value)}
      helperText={isBool ? t('smartEditor.boolHint') : undefined}
    />
    <Button
      variant="contained" startIcon={<Add />} disabled={!plugin?.document || busy || !name.trim()}
      onClick={() => void run(() => plugin!.addSignal({
        name, type, comment,
        initialValue: isBool ? ['1', 'true', 'on'].includes(initial.trim().toLowerCase()) : Number(initial),
      }))}
      data-testid="smart-add-signal"
    >{t('smartEditor.addSignal')}</Button>
  </Stack>;
}

function ValidationTab({ plugin, snap, busy, run, t }: {
  plugin: SmartAssetEditorPlugin | null; snap: SmartAssetEditorSnapshot; busy: boolean; run: Run; t: T;
}) {
  const report = snap.report;
  const summary = useMemo(() => [
    [t('smartEditor.nodes'), report.nodeCount],
    [t('smartEditor.meshes'), report.meshCount],
    [t('smartEditor.ports'), report.portCount],
    [t('smartEditor.signals'), report.signalCount],
    [t('smartEditor.templates'), report.templateCount],
  ] as const, [report, t]);
  return <Stack spacing={1.25}>
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {summary.map(([label, count]) => <Chip key={label} size="small" label={`${label}: ${count}`} />)}
    </Stack>
    <Alert severity={report.publishable ? 'success' : 'warning'}>
      {report.publishable
        ? t('smartEditor.publishable', { warnings: report.warningCount })
        : t('smartEditor.notPublishable', { errors: report.errorCount, warnings: report.warningCount })}
    </Alert>
    <Button variant="outlined" startIcon={<CheckCircleOutline />} onClick={() => plugin?.runValidation()} disabled={!plugin?.document || busy}>
      {t('smartEditor.runValidation')}
    </Button>
    <Stack spacing={0.75}>
      {report.issues.map((issue, index) => <IssueRow key={`${issue.code}:${issue.path}:${index}`} issue={issue} onClick={() => plugin?.selectIssue(issue.path)} t={t} />)}
    </Stack>
    <Divider />
    <Button
      variant="contained"
      color="success"
      startIcon={<CloudUpload />}
      disabled={!plugin?.document || busy || !report.publishable}
      onClick={() => void run(() => plugin!.save())}
      data-testid="smart-publish"
    >{t('smartEditor.publishLibrary')}</Button>
    <Typography variant="caption" color="text.secondary">{t('smartEditor.publishHint')}</Typography>
  </Stack>;
}

function IssueRow({ issue, onClick, t }: { issue: SmartAssetIssue; onClick: () => void; t: T }) {
  return <Button
    variant="outlined"
    color={issue.severity === 'error' ? 'error' : 'warning'}
    onClick={onClick}
    sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', py: 0.75 }}
  >
    <Box>
      <Typography variant="caption" display="block">{issueLabel(issue.code, t)}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
        {issue.path}{issue.detail ? ` · ${issue.detail}` : ''}
      </Typography>
    </Box>
  </Button>;
}

function issueLabel(code: SmartAssetIssue['code'], t: T): string {
  const key: Record<SmartAssetIssue['code'], string> = {
    'asset.empty': 'assetEmpty', 'node.name.empty': 'nodeNameEmpty', 'node.id.duplicate': 'nodeIdDuplicate',
    'port.invalid': 'portInvalid', 'port.id.duplicate': 'portIdDuplicate', 'port.legacy.mismatch': 'portLegacyMismatch',
    'signal.name.duplicate': 'signalNameDuplicate', 'signal.name.empty': 'signalNameEmpty',
    'track.points.invalid': 'trackPointsInvalid', 'track.ports.missing': 'trackPortsMissing',
    'zone.kind.invalid': 'zoneKindInvalid', 'zone.size.invalid': 'zoneSizeInvalid',
    'controller.params.invalid': 'controllerParamsInvalid', 'robot.params.invalid': 'robotParamsInvalid',
    'transport.direction.invalid': 'transportDirectionInvalid',
  };
  return t(`smartEditor.issues.${key[code]}` as Parameters<T>[0]);
}
