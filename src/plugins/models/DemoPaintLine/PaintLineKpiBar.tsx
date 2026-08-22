// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The paint line's KPI tiles (EP-DEMO-002, M1).
 *
 * Deliberately NOT the shared `src/plugins/demo/` cards: those pull from
 * `KpiDemoPlugin`, whose own header calls its output "static dummy KPI data",
 * and they are wired into the other demo. These read the live store fed by
 * `PaintLineKpiPlugin`, so every figure here is measured off the running line.
 *
 * A null reading renders as an em dash, never as 0 or as the last value seen.
 * A stopped line HAS no cycle time; printing the one it used to have would be
 * indistinguishable from a live reading.
 */

import { useSyncExternalStore } from 'react';
import { KpiCard } from '../../../core/hmi/KpiCard';
import { useRvTranslation } from '../../../core/i18n';
import type { UISlotProps } from '../../../core/rv-ui-plugin';
import { paintLineKpiStore } from './paintline-kpi-store';

const NO_READING = '—';

function useKpi() {
  return useSyncExternalStore(
    paintLineKpiStore.subscribe,
    paintLineKpiStore.getSnapshot,
    paintLineKpiStore.getSnapshot,
  );
}

export function PaintLineCycleKpi(_props: UISlotProps) {
  const { t } = useRvTranslation('demo');
  const { cycleSeconds } = useKpi();
  return (
    <KpiCard
      label={t('paintline.kpiCycle')}
      value={cycleSeconds === null ? NO_READING : cycleSeconds.toFixed(1)}
      unit={cycleSeconds === null ? '' : 's'}
      color="#ffb74d"
      secondary={t('paintline.kpiCycleHint')}
      animate={false}
    />
  );
}

export function PaintLineThroughputKpi(_props: UISlotProps) {
  const { t } = useRvTranslation('demo');
  const { piecesPerHour, totalPieces } = useKpi();
  return (
    <KpiCard
      label={t('paintline.kpiThroughput')}
      value={piecesPerHour === null ? NO_READING : Math.round(piecesPerHour).toString()}
      unit={piecesPerHour === null ? '' : 'p/h'}
      color="#4fc3f7"
      secondary={t('paintline.kpiTotal', { count: totalPieces })}
      animate={false}
    />
  );
}

export function PaintLineBufferKpi(_props: UISlotProps) {
  const { t } = useRvTranslation('demo');
  const { bufferPieces } = useKpi();
  return (
    <KpiCard
      label={t('paintline.kpiBuffer')}
      value={bufferPieces.toString()}
      unit="pcs"
      color="#ba68c8"
      secondary={t('paintline.kpiBufferHint')}
      animate={false}
    />
  );
}
