// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ConnectEmbedModelsPanel — where the CONNECT embedded demo is opened and closed
 * (plan-373: "closing the scene happens where the user opened it — on the model
 * row in the Models panel").
 *
 * This repository never carried that panel: the activity-bar "models" entry
 * opens the full-screen Projects dashboard, `closeConnectEmbedDemo()` had no
 * caller, and once the demo ran there was no way back to the gate except a
 * reload (EP-E2E-001). In a connect-embed deployment the Projects entry is
 * redirected to this docked LEFT panel (`connect-embed-models-entry.ts`,
 * installed by `main.ts`) — the gate already centres itself in the space the
 * left slot leaves free, so the two share one layout rule.
 *
 * One row, the demo model:
 *   - clicking the row starts the demo through the gate state machine (the same
 *     `startConnectEmbedDemo()` the gate's start button uses);
 *   - while it runs, the row carries a close action that returns to the gate.
 *     It is revealed by hover AND by keyboard focus (WCAG 2.1.1), and on a
 *     coarse pointer it is permanently visible at a 44 px target.
 */

import { useCallback, useSyncExternalStore, type MouseEvent } from 'react';
import { Box, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material';
import { Close, ViewInAr } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useRvTranslation } from '../../core/i18n';
import { LeftPanel } from '../../core/hmi/LeftPanel';
import { closeConnectEmbedDemo, startConnectEmbedDemo } from './connect-embed-actions';
import { CONNECT_EMBED_MODELS_PANEL_ID, CONNECT_EMBED_MODELS_PANEL_WIDTH } from './connect-embed-models-entry';
import {
  CONNECT_EMBED_DEMO_MODEL,
  getConnectEmbedSnapshot,
  subscribeConnectEmbedStore,
} from './connect-embed-store';

export { CONNECT_EMBED_MODELS_PANEL_ID, CONNECT_EMBED_MODELS_PANEL_WIDTH };

/** Display name of the demo model: its file name without the extension. */
export const CONNECT_EMBED_DEMO_NAME = CONNECT_EMBED_DEMO_MODEL.replace(/\.glb$/i, '');

const CLOSE_CLASS = 'rv-connect-embed-row-close';

export function ConnectEmbedModelsPanel() {
  const { t } = useRvTranslation('connect');
  const viewer = useViewer();
  const lpm = viewer.leftPanelManager;
  const panel = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot, lpm.getSnapshot);
  const snap = useSyncExternalStore(subscribeConnectEmbedStore, getConnectEmbedSnapshot, getConnectEmbedSnapshot);

  const running = snap.state === 'demo-running';
  const loading = snap.state === 'loading';
  const start = useCallback(() => {
    if (running || loading) return;
    void startConnectEmbedDemo(viewer);
  }, [viewer, running, loading]);
  const close = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    closeConnectEmbedDemo(viewer);
  }, [viewer]);
  const closePanel = useCallback(() => lpm.close(CONNECT_EMBED_MODELS_PANEL_ID), [lpm]);

  if (!snap.enabled || panel.left.activePanel !== CONNECT_EMBED_MODELS_PANEL_ID) return null;

  const closeLabel = t('embed.closeModel', { name: CONNECT_EMBED_DEMO_NAME });
  const status = running ? t('embed.rowRunning') : loading ? t('embed.loading') : t('embed.rowStart');

  return (
    <LeftPanel title={t('embed.modelsTitle')} onClose={closePanel} width={CONNECT_EMBED_MODELS_PANEL_WIDTH}>
      <Box role="list" sx={{ p: 1, overflow: 'auto' }}>
        <Box
          role="listitem"
          data-testid="connect-embed-model-row"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pr: 0.5,
            borderRadius: 1,
            bgcolor: running ? 'rgba(79,195,247,0.12)' : 'transparent',
            '&:hover': { bgcolor: running ? 'rgba(79,195,247,0.16)' : 'rgba(255,255,255,0.06)' },
            [`&:hover .${CLOSE_CLASS}, &:focus-within .${CLOSE_CLASS}`]: { opacity: 1 },
            // Touch has no hover: the action must be there without one, at a
            // finger-sized target.
            '@media (hover: none), (pointer: coarse)': {
              [`& .${CLOSE_CLASS}`]: { opacity: 1, width: 44, height: 44 },
            },
          }}
        >
          <ButtonBase
            onClick={start}
            // Not `disabled`: MUI would set pointer-events: none on the row's
            // own button, and hovering the row must still reveal its action.
            aria-disabled={running || loading}
            aria-current={running ? 'true' : undefined}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              px: 1,
              gap: 1,
              justifyContent: 'flex-start',
              textAlign: 'left',
              borderRadius: 1,
              color: 'text.primary',
              cursor: running || loading ? 'default' : 'pointer',
              '&:focus-visible': { outline: '1px solid #4fc3f7', outlineOffset: -1 },
            }}
          >
            <ViewInAr sx={{ fontSize: 18, color: running ? 'primary.main' : 'text.secondary' }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{CONNECT_EMBED_DEMO_NAME}</Typography>
              <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary' }}>{status}</Typography>
            </Box>
          </ButtonBase>
          {running && (
            <Tooltip title={closeLabel}>
              <IconButton
                className={CLOSE_CLASS}
                data-testid="connect-embed-close-scene"
                aria-label={closeLabel}
                size="small"
                onClick={close}
                sx={{
                  flexShrink: 0,
                  opacity: 0,
                  transition: 'opacity 120ms ease',
                  '&:focus, &:focus-visible': { opacity: 1 },
                }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </LeftPanel>
  );
}
