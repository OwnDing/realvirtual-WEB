// SPDX-License-Identifier: AGPL-3.0-only
/** Alarm history with CSV export (ADR-0025). Loaded lazily when first opened. */
import { useSyncExternalStore } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { RVViewer } from '../../core/rv-viewer';
import { getLocale, useRvTranslation } from '../../core/i18n';
import { alarmStoreFor } from '../../core/hmi/alarm-runtime';
import type { AlarmEventKind } from '../../core/hmi/alarm-store';

const EVENT_KEY = {
  raise: 'alarms.event_raise', clear: 'alarms.event_clear', ack: 'alarms.ack',
  shelve: 'alarms.event_shelve', unshelve: 'alarms.unshelve',
} as const satisfies Record<AlarmEventKind, string>;

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AlarmHistoryDialog({ viewer, open, onClose }: { viewer: RVViewer; open: boolean; onClose: () => void }) {
  const { t } = useRvTranslation('operator');
  const store = alarmStoreFor(viewer);
  const { history } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const rows = [...history].reverse();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('alarms.history')}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>{t('alarms.historyLocal')}</Typography>
        {rows.length === 0 ? <Typography sx={{ fontSize: 13 }}>{t('alarms.emptyHistory')}</Typography> : (
          <Table size="small" stickyHeader>
            <TableHead><TableRow>
              <TableCell>{t('alarms.time')}</TableCell><TableCell>{t('alarms.alarm')}</TableCell>
              <TableCell>{t('alarms.event')}</TableCell><TableCell>{t('alarms.user')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((e, i) => (
                <TableRow key={`${e.time}-${i}`}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.time).toLocaleString(getLocale())}</TableCell>
                  <TableCell>{e.text} <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>({t(`alarms.priority_${e.priority}`)})</Typography></TableCell>
                  <TableCell>{t(EVENT_KEY[e.kind])}</TableCell>
                  <TableCell>{e.user ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => downloadCsv('alarm-history.csv', alarmStoreFor(viewer).historyCsv())} disabled={rows.length === 0}>{t('alarms.exportCsv')}</Button>
        <Button onClick={onClose}>{t('alarms.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

