// SPDX-License-Identifier: AGPL-3.0-only

/**
 * KPI runtime (ADR-0025), loaded lazily by HmiOperationsPlugin: one KpiEngine
 * per viewer reading that viewer's SignalStore, the 1 Hz sampling, and the
 * KPI-bar cards. The KPI bar gets an entry only while the project defines KPIs.
 */

import { useSyncExternalStore } from 'react';
import { Box } from '@mui/material';
import type { RVViewer } from '../../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import { KpiCard } from '../../core/hmi/KpiCard';
import { ISA_AMBER, ISA_RED } from '../../core/hmi/isa-colors';
import { KpiEngine, parseKpiConfig, type KpiResult } from '../../core/hmi/kpi-engine';
import { KPI_CONFIG_PATH, loadHmiConfig } from '../../core/hmi/hmi-project-config';
import { getLocale, useRvTranslation } from '../../core/i18n';

const engines = new WeakMap<object, KpiEngine>();

export function kpiEngineFor(viewer: RVViewer): KpiEngine {
  let engine = engines.get(viewer);
  if (!engine) {
    engine = new KpiEngine({
      readSignal: (name) => viewer.signalStore?.get(name),
      hasSignal: (name) => viewer.signalStore?.get(name) !== undefined,
      format: (value, decimals) => new Intl.NumberFormat(getLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value),
    });
    engines.set(viewer, engine);
  }
  return engine;
}

const STATUS_COLOR: Record<KpiResult['status'], string | undefined> = { ok: undefined, warning: ISA_AMBER, alarm: ISA_RED, 'no-data': '#90a4ae' };

export function ConfiguredKpiCards({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('operator');
  const engine = kpiEngineFor(viewer);
  const results = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  if (results.length === 0) return null;
  return (
    <>
      {results.map((r) => (
        <Box key={r.id} data-testid={`kpi-${r.id}`}>
          <KpiCard
            label={r.label}
            value={r.text}
            unit={r.unit}
            color={STATUS_COLOR[r.status]}
            secondary={r.missing.length ? t('alarms.missingSignals', { names: r.missing.join(', ') }) : r.secondary ?? undefined}
            sparkline={r.history}
            animate={false}
          />
        </Box>
      ))}
    </>
  );
}

/** The plugin instance, seen from here: its slots and a way to stop sampling. */
export interface KpiHost { readonly id: string; readonly slots: UISlotEntry[]; stopKpis?: () => void }

const KPI_SLOT: UISlotEntry = { slot: 'kpi-bar', component: ConfiguredKpiCards, order: 10 };
const timers = new WeakMap<KpiHost, ReturnType<typeof setInterval>>();

/** Show or hide the KPI-bar entry and run sampling only while KPIs exist. */
export function showKpis(host: KpiHost, viewer: RVViewer): void {
  const engine = kpiEngineFor(viewer);
  const show = engine.config.kpis.length > 0;
  const timer = timers.get(host);
  if (show && !timer) {
    timers.set(host, setInterval(() => engine.sample(), 1000));
    host.stopKpis = () => { clearInterval(timers.get(host)); timers.delete(host); };
  }
  if (!show && timer) host.stopKpis?.();
  if (show === host.slots.includes(KPI_SLOT)) return;
  if (show) host.slots.push(KPI_SLOT);
  else host.slots.splice(host.slots.indexOf(KPI_SLOT), 1);
  // Re-registration replaces this plugin's entries (idempotent by plugin id).
  viewer.uiRegistry.register(host);
}

export async function loadKpis(host: KpiHost, viewer: RVViewer): Promise<void> {
  const { value } = await loadHmiConfig(KPI_CONFIG_PATH);
  kpiEngineFor(viewer).configure(parseKpiConfig(value).config);
  showKpis(host, viewer);
}

/** Model cleared: the windows start over; definitions stay until the next model loads its own. */
export function restartKpis(viewer: RVViewer): void {
  const engine = kpiEngineFor(viewer);
  engine.configure(engine.config);
}
