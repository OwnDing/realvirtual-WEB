// SPDX-License-Identifier: AGPL-3.0-only
/** "Alarms & KPIs" settings tab (ADR-0025). Loaded lazily: only rendered when opened. */
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert, Box, Button, Divider, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { DeleteOutline } from '@mui/icons-material';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import { KPI_KINDS, parseKpiConfig, type KpiDefinition, type KpiKind } from '../../core/hmi/kpi-engine';
import { ALARM_PRIORITIES, parseAlarmConfig, type AlarmConfig, type AlarmPriority } from '../../core/hmi/alarm-store';
import { alarmStoreFor } from '../../core/hmi/alarm-runtime';
import { ALARM_CONFIG_PATH, KPI_CONFIG_PATH, saveHmiConfig } from '../../core/hmi/hmi-project-config';
import { rvT, useRvTranslation } from '../../core/i18n';
import { useHmiCan } from '../../hooks/use-hmi-session';
import { kpiEngineFor, showKpis } from './kpi-runtime';
import type { HmiOperationsPlugin } from '../hmi-operations-plugin';

const KIND_FIELDS: Record<KpiKind, Array<keyof KpiDefinition>> = {
  value: ['signal', 'unit'],
  rate: ['signal', 'windowMinutes'],
  ratio: ['numerator', 'denominator'],
  uptime: ['signal', 'windowMinutes'],
  oee: ['running', 'totalCount', 'goodCount', 'idealCycleSeconds', 'windowMinutes'],
};
const NUMERIC_FIELDS = new Set<keyof KpiDefinition>(['windowMinutes', 'idealCycleSeconds', 'warnBelow', 'alarmBelow', 'warnAbove', 'alarmAbove']);
const SIGNAL_FIELDS = new Set<keyof KpiDefinition>(['signal', 'numerator', 'denominator', 'running', 'totalCount', 'goodCount']);

function KpiRow({ def, signals, disabled, onChange, onRemove }: {
  def: KpiDefinition; signals: string; disabled: boolean;
  onChange: (next: KpiDefinition) => void; onRemove: () => void;
}) {
  const { t } = useRvTranslation('operator');
  const set = (key: keyof KpiDefinition, raw: string) => {
    const next = { ...def } as Record<string, unknown>;
    if (raw === '') delete next[key];
    else next[key] = NUMERIC_FIELDS.has(key) ? Number(raw) : raw;
    onChange(next as unknown as KpiDefinition);
  };
  const field = (key: keyof KpiDefinition) => (
    <TextField
      key={key} size="small" label={t(`alarms.${key}` as 'alarms.signal')} value={def[key] ?? ''} disabled={disabled}
      type={NUMERIC_FIELDS.has(key) ? 'number' : 'text'} onChange={(e) => set(key, e.target.value)}
      inputProps={SIGNAL_FIELDS.has(key) ? { list: signals } : undefined}
      sx={{ minWidth: 150, flex: 1 }}
    />
  );
  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1, p: 1 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" label={t('alarms.kpiLabel')} value={def.label} disabled={disabled} onChange={(e) => onChange({ ...def, label: e.target.value })} sx={{ flex: 2, minWidth: 160 }} />
        <TextField size="small" label={t('alarms.kpiId')} value={def.id} disabled={disabled} onChange={(e) => onChange({ ...def, id: e.target.value })} sx={{ width: 120 }} />
        <TextField select size="small" label={t('alarms.kpiKind')} value={def.kind} disabled={disabled} onChange={(e) => onChange({ ...def, kind: e.target.value as KpiKind })} sx={{ width: 170 }}>
          {KPI_KINDS.map((k) => <MenuItem key={k} value={k}>{t(`alarms.kind_${k}`)}</MenuItem>)}
        </TextField>
        <IconButton aria-label={t('alarms.remove')} disabled={disabled} onClick={onRemove} size="small"><DeleteOutline fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        {KIND_FIELDS[def.kind].map(field)}
        {(['warnBelow', 'alarmBelow', 'warnAbove', 'alarmAbove'] as const).map(field)}
      </Box>
    </Box>
  );
}

export function HmiConfigSettingsTab({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('operator');
  const mayEdit = useHmiCan('configure-hmi');
  const alarmStore = alarmStoreFor(viewer);
  const engine = kpiEngineFor(viewer);
  const alarmSnapshot = useSyncExternalStore(alarmStore.subscribe, alarmStore.getSnapshot, alarmStore.getSnapshot);
  const [alarms, setAlarms] = useState<AlarmConfig>(() => alarmStore.config);
  const [kpis, setKpis] = useState<KpiDefinition[]>(() => engine.config.kpis);
  const [message, setMessage] = useState<{ severity: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const datalistId = useMemo(() => `rv-kpi-signals-${Math.random().toString(36).slice(2)}`, []);
  const signalNames = useMemo(() => [...(viewer.signalStore?.getAll().keys() ?? [])].sort(), [viewer]);
  const knownAlarms = useMemo(() => {
    const ids = new Map<string, string>();
    for (const a of alarmSnapshot.alarms) ids.set(a.id, a.text);
    for (const e of alarmSnapshot.history) if (!ids.has(e.id)) ids.set(e.id, e.text);
    for (const id of Object.keys(alarms.alarms)) if (!ids.has(id)) ids.set(id, id);
    return [...ids];
  }, [alarmSnapshot, alarms.alarms]);

  const save = async () => {
    const kpiResult = parseKpiConfig({ schemaVersion: 1, kpis });
    if (kpiResult.issues.length) {
      setMessage({ severity: 'error', text: t('alarms.invalid', { count: kpiResult.issues.length, detail: kpiResult.issues.join('; ') }) });
      return;
    }
    const alarmConfig = parseAlarmConfig(alarms);
    setBusy(true);
    try {
      const where = await saveHmiConfig(ALARM_CONFIG_PATH, alarmConfig);
      await saveHmiConfig(KPI_CONFIG_PATH, kpiResult.config);
      alarmStore.configure(alarmConfig);
      engine.configure(kpiResult.config);
      const host = viewer.getPlugin<HmiOperationsPlugin>('hmi-operations');
      if (host) showKpis(host, viewer);
      setMessage({ severity: where === 'project' ? 'success' : 'info', text: where === 'project' ? t('alarms.savedProject') : t('alarms.savedBrowser') });
    } catch (error) {
      setMessage({ severity: 'error', text: t('alarms.saveFailed', { message: error instanceof Error ? error.message : String(error) }) });
    } finally {
      setBusy(false);
    }
  };

  const setOverride = (id: string, priority: AlarmPriority | '') => {
    const next = { ...alarms.alarms };
    if (priority) next[id] = { ...next[id], priority };
    else if (next[id]) { const { priority: _p, ...rest } = next[id]; if (Object.keys(rest).length) next[id] = rest; else delete next[id]; }
    setAlarms({ ...alarms, alarms: next });
  };

  return (
    <Stack spacing={2} sx={{ p: 1 }}>
      {!mayEdit && <Alert severity="info">{t('alarms.readOnly')}</Alert>}
      <datalist id={datalistId}>{signalNames.map((n) => <option key={n} value={n} />)}</datalist>

      <Typography variant="subtitle2">{t('alarms.alarmSettings')}</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" label={t('alarms.defaultPriority')} value={alarms.defaultPriority} disabled={!mayEdit}
          onChange={(e) => setAlarms({ ...alarms, defaultPriority: e.target.value as AlarmPriority })} sx={{ width: 180 }}>
          {ALARM_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{t(`alarms.priority_${p}`)}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={alarms.latch} disabled={!mayEdit} onChange={(e) => setAlarms({ ...alarms, latch: e.target.checked })} />} label={t('alarms.latch')} />
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t('alarms.overrides')}</Typography>
      {knownAlarms.length === 0 ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('alarms.noKnownAlarms')}</Typography> : (
        <Stack spacing={0.5}>
          {knownAlarms.map(([id, text]) => (
            <Box key={id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 12, flex: 1 }} noWrap title={id}>{text}</Typography>
              <TextField select size="small" value={alarms.alarms[id]?.priority ?? ''} disabled={!mayEdit}
                onChange={(e) => setOverride(id, e.target.value as AlarmPriority | '')} sx={{ width: 150 }}
                SelectProps={{ displayEmpty: true }}>
                <MenuItem value="">{t(`alarms.priority_${alarms.defaultPriority}`)} *</MenuItem>
                {ALARM_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{t(`alarms.priority_${p}`)}</MenuItem>)}
              </TextField>
            </Box>
          ))}
        </Stack>
      )}

      <Divider />
      <Typography variant="subtitle2">{t('alarms.kpiSettings')}</Typography>
      {kpis.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('alarms.kpiEmpty')}</Typography>}
      {kpis.map((def, index) => (
        <KpiRow key={index} def={def} signals={datalistId} disabled={!mayEdit}
          onChange={(next) => setKpis(kpis.map((k, i) => (i === index ? next : k)))}
          onRemove={() => setKpis(kpis.filter((_, i) => i !== index))} />
      ))}
      <Box>
        <Button size="small" disabled={!mayEdit || kpis.length >= 32}
          onClick={() => setKpis([...kpis, { id: `kpi-${kpis.length + 1}`, label: rvT('operator', 'alarms.kind_value'), kind: 'value' }])}>
          {t('alarms.addKpi')}
        </Button>
      </Box>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}
      <Box><Button variant="contained" disabled={!mayEdit || busy} onClick={() => { void save(); }}>{t('alarms.save')}</Button></Box>
    </Stack>
  );
}

