// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * AlarmPanel — the 'messages'-slot alarm list (ADR-0025), loaded lazily by
 * WebErrorPlugin.
 *
 * One TileCard per alarm, coloured by priority; an unacknowledged alarm blinks
 * until acknowledged. Clicking a card focuses + highlights the faulting part in
 * 3D. Cards form a compact overlapping stack that fans out on hover; a maxHeight
 * + overflow fallback covers very large alarm counts. Acknowledge needs the
 * operator role, shelving the engineer role (hmi-session-store).
 */

import { lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Badge, Button } from '@mui/material';
import { LazyPanelBoundary } from '../../core/hmi/LazyPanelBoundary';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { ErrorEntry } from '../../core/engine/rv-error-store';
import { TileCard } from '../../core/hmi/TileCard';
import { pulseSeverityOutline, type MessageSeverity } from '../../core/hmi/severity-pulse';
import { useRvTranslation } from '../../core/i18n';
import { useHmiCan } from '../../hooks/use-hmi-session';
import type { AlarmPriority, AlarmRecord, AlarmSnapshot, AlarmState } from '../../core/hmi/alarm-store';
import { acknowledgeAlarm, acknowledgeAllAlarms, alarmStoreFor, connectAlarmFeed, shelveAlarm, unshelveAlarm } from '../../core/hmi/alarm-runtime';
import { collectNodeAiContext } from '../../core/hmi/search-ai-context';
import { AskAiButton } from '../../core/hmi/AskAiButton';
import { useSearchDiagnosisAvailable } from '../diagnose/search-diagnose-registry';

// ─── Constants (inline, glanceable) ─────────────────────────────────────

/** Vertical offset (px) between stacked cards in the collapsed state. */
const STACK_OFFSET_PX = 10;
/** Card height estimate (px) used to lay out the fanned-out stack. */
const CARD_HEIGHT_PX = 76;
/** Max panel height before the fanned-out list scrolls (px). */
const MAX_PANEL_HEIGHT_PX = 480;

function AskAiAction({ viewer, error }: { viewer: RVViewer; error: ErrorEntry }) {
  const handleClick = () => {
    const context = collectNodeAiContext(viewer, error.path);
    viewer.emit('diagnose-request', {
      nodePath: error.path,
      label: error.text || 'Error',
      source: 'web-error',
      ...(context?.docHints?.length ? { docHints: context.docHints } : {}),
      ...(context?.machineContext ? { machineContext: context.machineContext } : {}),
    });
  };

  return (
    <AskAiButton onClick={handleClick} />
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────

const PRIORITY_SEVERITY: Record<AlarmPriority, MessageSeverity> = { critical: 'error', high: 'error', medium: 'warning', low: 'info' };
const STATE_KEY = {
  'active-unack': 'alarms.state_active_unack', 'active-ack': 'alarms.state_active_ack',
  'rtn-unack': 'alarms.state_rtn_unack', shelved: 'alarms.state_shelved',
} as const satisfies Record<AlarmState, string>;
/** Default shelving duration offered in the panel (minutes, ADR-0025). */
const SHELVE_MINUTES = 30;

function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function useAlarms(viewer: RVViewer): AlarmSnapshot {
  const store = alarmStoreFor(viewer);
  // Idempotent with the plugin's own feed; keeps a standalone panel (tests, embeds) live.
  useEffect(() => connectAlarmFeed(viewer), [viewer]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function AlarmActions({ viewer, alarm, aiAvailable }: { viewer: RVViewer; alarm: AlarmRecord; aiAvailable: boolean }) {
  const { t } = useRvTranslation('operator');
  const mayAck = useHmiCan('ack-alarms');
  const mayShelve = useHmiCan('shelve-alarms');
  const unack = alarm.state === 'active-unack' || alarm.state === 'rtn-unack';
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      {unack && mayAck && (
        <Button size="small" variant="contained" color="error" sx={{ minWidth: 0, px: 1, py: 0, fontSize: 11, textTransform: 'none' }}
          onClick={() => acknowledgeAlarm(viewer, alarm.id)}>{t('alarms.ack')}</Button>
      )}
      {mayShelve && alarm.state !== 'shelved' && (
        <Button size="small" sx={{ minWidth: 0, px: 1, py: 0, fontSize: 11, textTransform: 'none' }}
          onClick={() => shelveAlarm(viewer, alarm.id, SHELVE_MINUTES)}>{t('alarms.shelve')}</Button>
      )}
      {aiAvailable && <AskAiAction viewer={viewer} error={{ path: alarm.id, text: alarm.text, active: alarm.signalActive, since: 0 }} />}
    </Box>
  );
}

function AlarmCard({ viewer, alarm, aiAvailable }: { viewer: RVViewer; alarm: AlarmRecord; aiAvailable: boolean }) {
  const { t } = useRvTranslation('operator');
  const node = alarm.id.split('/').pop() ?? alarm.id;
  const subtitle = [t(`alarms.priority_${alarm.priority}`), t(STATE_KEY[alarm.state]), node,
    ...(alarm.occurrences > 1 ? [t('alarms.occurrences', { count: alarm.occurrences })] : [])].join(' · ');
  return (
    <Box sx={alarm.state === 'active-unack' ? { animation: 'rv-alarm-blink 1s steps(2, start) infinite', '@keyframes rv-alarm-blink': { to: { opacity: 0.55 } } } : undefined}>
      <TileCard
        title={alarm.text || t('alarms.alarm')}
        subtitle={subtitle}
        severity={PRIORITY_SEVERITY[alarm.priority]}
        icon="warning"
        timestamp={formatClock(alarm.raisedAt)}
        componentPath={alarm.id}
        onAction={() => pulseSeverityOutline(viewer, alarm.id, PRIORITY_SEVERITY[alarm.priority])}
        actions={<AlarmActions viewer={viewer} alarm={alarm} aiAvailable={aiAvailable} />}
      />
    </Box>
  );
}

const AlarmHistoryDialog = lazy(() => import('./alarm-history-dialog').then((m) => ({ default: m.AlarmHistoryDialog })));

export function AlarmPanel({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('operator');
  const snapshot = useAlarms(viewer);
  const aiAvailable = useSearchDiagnosisAvailable();
  const mayAck = useHmiCan('ack-alarms');
  const mayShelve = useHmiCan('shelve-alarms');
  const [hovered, setHovered] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const visible = snapshot.alarms.filter((a) => a.state !== 'shelved');
  const shelved = snapshot.alarms.filter((a) => a.state === 'shelved');
  if (visible.length === 0 && shelved.length === 0 && !historyOpen) return null;

  const header = (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', mb: 0.5, flexWrap: 'wrap' }}>
      {shelved.length > 0 && mayShelve && shelved.map((a) => (
        <Button key={a.id} size="small" sx={{ fontSize: 11, textTransform: 'none' }} onClick={() => unshelveAlarm(viewer, a.id)}>
          {t('alarms.unshelve')}: {a.text}
        </Button>
      ))}
      {snapshot.unacknowledged > 1 && mayAck && (
        <Button size="small" variant="outlined" color="error" sx={{ fontSize: 11, textTransform: 'none' }} onClick={() => acknowledgeAllAlarms(viewer)}>
          {t('alarms.ackAll')} ({snapshot.unacknowledged})
        </Button>
      )}
      <Button size="small" sx={{ fontSize: 11, textTransform: 'none' }} onClick={() => setHistoryOpen(true)}>{t('alarms.history')}</Button>
    </Box>
  );
  const dialog = historyOpen ? (
    <LazyPanelBoundary label={t('alarms.history')}>
      <AlarmHistoryDialog viewer={viewer} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </LazyPanelBoundary>
  ) : null;

  if (visible.length <= 1) {
    return (
      <Box data-ui-panel sx={{ pointerEvents: 'auto' }}>
        {header}
        {visible[0] && <AlarmCard viewer={viewer} alarm={visible[0]} aiAvailable={aiAvailable} />}
        {dialog}
      </Box>
    );
  }

  // Collapsed: overlapping stack (top card full, rest as offset edges + count
  // badge). Hovered: fanned out into a scrollable column. Touch: tap toggles.
  const expanded = hovered;
  const collapsedHeight = CARD_HEIGHT_PX + (visible.length - 1) * STACK_OFFSET_PX;
  // The stack shows the most important alarm on top: draw in reverse priority order.
  const stack = [...visible].reverse();

  return (
    <Box data-ui-panel sx={{ pointerEvents: 'auto' }}>
      {header}
      <Badge
        badgeContent={expanded ? 0 : visible.length}
        color="error"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setHovered((h) => !h)}
        sx={{ display: 'block', width: '100%', '& .MuiBadge-badge': { transform: 'scale(1) translate(-6px, 6px)' } }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: expanded ? 'auto' : collapsedHeight,
            maxHeight: expanded ? MAX_PANEL_HEIGHT_PX : undefined,
            overflowY: expanded ? 'auto' : 'visible',
            transition: 'height 0.2s ease',
            display: expanded ? 'flex' : 'block',
            flexDirection: 'column',
            gap: expanded ? 1 : 0,
          }}
        >
          {(expanded ? visible : stack).map((a, i) => (
            <Box
              key={a.id}
              sx={expanded ? { width: '100%' } : {
                position: 'absolute', top: i * STACK_OFFSET_PX, left: 0, right: 0, zIndex: i + 1,
                opacity: i === stack.length - 1 ? 1 : 0.85,
              }}
            >
              <AlarmCard viewer={viewer} alarm={a} aiAvailable={aiAvailable} />
            </Box>
          ))}
        </Box>
      </Badge>
      {dialog}
    </Box>
  );
}
