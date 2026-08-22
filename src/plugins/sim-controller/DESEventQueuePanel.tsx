// SPDX-License-Identifier: AGPL-3.0-only

import { createPortal } from 'react-dom';
import { Paper, Stack, Typography } from '@mui/material';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import { useRvTranslation } from '../../core/i18n';

export function DESEventQueuePanel({ viewer, open }: UISlotProps & { open: boolean }) {
  const { t } = useRvTranslation('sim');
  if (!open) return null;
  const control = viewer.simulationKernel?.desControl();
  const stats = control?.eventStats?.();
  const kpis = control?.kpiSnapshot?.();
  const empty = (stats?.processed ?? 0) === 0 && (stats?.pending ?? 0) === 0;
  return createPortal(
    <Paper data-ui-panel data-testid="des-event-queue-panel" sx={{ position: 'fixed', right: 16, bottom: 16, p: 2, minWidth: 280, zIndex: 1500 }}>
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">{t('des.eventQueueTitle')}</Typography>
        <Typography variant="body2">{t('des.eventTime')}: {stats?.currentTime.toFixed(3) ?? '—'} s</Typography>
        <Typography variant="body2">{t('des.eventProcessed')}: {stats?.processed ?? 0}</Typography>
        <Typography variant="body2">{t('des.eventPending')}: {stats?.pending ?? 0}</Typography>
        <Typography variant="body2">{t('des.eventNext')}: {Number.isFinite(stats?.nextEventTime) ? stats?.nextEventTime.toFixed(3) : '—'}</Typography>
        {empty && <Typography variant="caption" color="text.secondary">{t('des.eventEmpty')}</Typography>}
        <Typography variant="subtitle2" sx={{ pt: 1 }}>{t('des.kpiTitle')}</Typography>
        <Typography variant="body2">{t('des.throughput')}: {kpis?.throughputPerHour.toFixed(2) ?? '—'} / h</Typography>
        <Typography variant="body2">
          {t('des.bottleneck')}: {kpis?.bottleneck
            ? `${kpis.bottleneck.name} (${kpis.bottleneck.utilization.toFixed(1)}%)`
            : '—'}
        </Typography>
      </Stack>
    </Paper>,
    document.body,
  );
}
