// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Typography,
} from '@mui/material';
import { ErrorOutline, OpenInNew, PlayArrow } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import { useViewportInsets } from '../../hooks/use-viewport-insets';
import { getAppConfig } from '../../core/rv-app-config';
import {
  hasSeenConnectEmbedSignalHint,
  markConnectEmbedSignalHintSeen,
} from '../../core/hmi/rv-storage-keys';
import { startConnectEmbedDemo } from './connect-embed-actions';
import {
  getConnectEmbedSnapshot,
  resetConnectEmbedDemo,
  subscribeConnectEmbedStore,
} from './connect-embed-store';
import { useRvTranslation } from '../../core/i18n';
import { Trans } from 'react-i18next';
import { allowRuntimeEgressUrl } from '../../core/deployment/runtime-egress';

/** Minimal-shell empty/loading/error surface for the CONNECT embedded demo. */
export function ConnectEmbedGate() {
  const { t } = useRvTranslation('connect');
  const viewer = useViewer();
  const snap = useSyncExternalStore(
    subscribeConnectEmbedStore,
    getConnectEmbedSnapshot,
    getConnectEmbedSnapshot,
  );
  const panelSnap = useSyncExternalStore(
    viewer.leftPanelManager.subscribe,
    viewer.leftPanelManager.getSnapshot,
    viewer.leftPanelManager.getSnapshot,
  );
  const isMobile = useMobileLayout();

  // Same entry point the model row uses, so both run the gate state machine.
  const startDemo = useCallback(() => { void startConnectEmbedDemo(viewer); }, [viewer]);

  const returnToEmpty = useCallback(() => resetConnectEmbedDemo(), []);
  const left = isMobile ? 0 : panelSnap.left.activePanelWidth;
  const sourceCandidate = getAppConfig().legal?.sourceUrl ?? getAppConfig().sourceUrl;
  const sourceUrl = sourceCandidate
    ? allowRuntimeEgressUrl(sourceCandidate, 'legal-link')?.href ?? null
    : null;

  return (
    <Box
      data-testid="connect-embed-gate"
      sx={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        pointerEvents: 'auto',
      }}
    >
      <Paper
        role="region"
        aria-label={t('embed.region')}
        sx={{
          width: 'min(520px, 100%)',
          p: { xs: 2, sm: 3 },
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 1,
          textAlign: 'center',
        }}
      >
        {snap.state === 'loading' ? (
          <LoadingState />
        ) : snap.state === 'load-error' ? (
          <ErrorState error={snap.error} onRetry={startDemo} onBack={returnToEmpty} />
        ) : (
          <EmptyState onStart={startDemo} sourceUrl={sourceUrl} />
        )}
      </Paper>
    </Box>
  );
}

function EmptyState({ onStart, sourceUrl }: { onStart: () => void; sourceUrl: string | null }) {
  const { t } = useRvTranslation('connect');
  return (
    <>
      <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.45, textWrap: 'balance' }}>
        {t('embed.emptyTitle')}
      </Typography>
      <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>
        {t('embed.emptyText')}
      </Typography>
      <Button
        data-testid="connect-embed-start"
        variant="contained"
        startIcon={<PlayArrow />}
        onClick={onStart}
        sx={{ mt: 2.5, minWidth: 180, textTransform: 'none' }}
      >
        {t('embed.start')}
      </Button>
      {sourceUrl && <Box sx={{ mt: 2 }}>
        <Link
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ color: 'text.secondary', fontSize: 11 }}
        >
          {t('embed.sourceCode')} <OpenInNew sx={{ ml: 0.25, fontSize: 11, verticalAlign: '-1px' }} />
        </Link>
      </Box>}
    </>
  );
}

function LoadingState() {
  const { t } = useRvTranslation('connect');
  return (
    <Box data-testid="connect-embed-loading" role="status" aria-live="polite" sx={{ py: 1 }}>
      <CircularProgress size={28} thickness={4} />
      <Typography sx={{ mt: 1.5, fontSize: 14, fontWeight: 600 }}>{t('embed.loading')}</Typography>
      <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12 }}>
        {t('embed.preparing')}
      </Typography>
    </Box>
  );
}

function ErrorState({
  error,
  onRetry,
  onBack,
}: {
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useRvTranslation('connect');
  return (
    <Box data-testid="connect-embed-error" role="alert">
      <ErrorOutline color="error" sx={{ fontSize: 28 }} />
      <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 600 }}>{t('embed.errorTitle')}</Typography>
      <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: 12, overflowWrap: 'anywhere' }}>
        {error || t('embed.errorText')}
      </Typography>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
        <Button variant="text" onClick={onBack} sx={{ textTransform: 'none' }}>{t('embed.back')}</Button>
        <Button variant="contained" onClick={onRetry} sx={{ textTransform: 'none' }}>{t('embed.retry')}</Button>
      </Box>
    </Box>
  );
}

/**
 * The one-off "connect your live signals" hint, shown while the embedded demo
 * runs.
 *
 * Since plan-373 this is ALL that floats over the viewport: the `DEMO · Standalone`
 * chip and the top-right "Close scene" button are gone. Closing the scene now
 * happens where the user opened it — on the model row in the Models panel — so the
 * top-right corner of the 3D view stays clear.
 */
export function ConnectEmbedDemoControls() {
  const { t } = useRvTranslation('connect');
  const insets = useViewportInsets();
  const snap = useSyncExternalStore(
    subscribeConnectEmbedStore,
    getConnectEmbedSnapshot,
    getConnectEmbedSnapshot,
  );
  const [hintOpen, setHintOpen] = useState(false);
  const demoRunning = snap.enabled && snap.state === 'demo-running';

  useEffect(() => {
    if (!demoRunning) {
      setHintOpen(false);
      return;
    }
    setHintOpen(!hasSeenConnectEmbedSignalHint());
  }, [demoRunning]);

  useEffect(() => {
    if (demoRunning && hintOpen) markConnectEmbedSignalHintSeen();
  }, [demoRunning, hintOpen]);

  const dismissHint = useCallback(() => {
    markConnectEmbedSignalHintSeen();
    setHintOpen(false);
  }, []);

  if (!snap.enabled || snap.state !== 'demo-running') return null;

  return (
    <>
      {hintOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: insets.top + 96,
            left: insets.left,
            right: insets.right,
            zIndex: 1200,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Alert
            data-testid="connect-embed-signal-hint"
            role="status"
            icon={false}
            variant="outlined"
            onClose={dismissHint}
            closeText="Dismiss signal connection hint"
            sx={{
              width: { xs: 'calc(100vw - 16px)', sm: 460 },
              maxWidth: 'calc(100% - 16px)',
              bgcolor: 'rgba(30,30,30,0.85) !important',
              backdropFilter: 'blur(calc(16px * var(--rv-ui-blur-scale, 1)))',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: 1,
              color: 'text.primary',
              alignItems: 'flex-start',
              pointerEvents: 'auto',
              '& .MuiAlert-message': { py: 0.25 },
            }}
          >
            <AlertTitle sx={{ mb: 0.5, fontSize: 14, fontWeight: 600 }}>
              {t('embed.hintTitle')}
            </AlertTitle>
            <Trans ns="connect" i18nKey="embed.hintBody" components={[<strong key="shift" />]} />
          </Alert>
        </Box>
      )}
    </>
  );
}
