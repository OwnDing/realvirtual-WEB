// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Paper, Typography, Button } from '@mui/material';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import ViewQuiltOutlinedIcon from '@mui/icons-material/ViewQuiltOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import { setWelcomeModalOpen } from './welcome-modal-store';
import { useCustomBranding } from './branding-store';
import { useRvTranslation, type RVTranslationKey } from '../i18n';
import { Trans } from 'react-i18next';
import { formatVersionFull } from '../rv-version';

/** Primary use cases, shown as a compact list. */
/** Catalog key pairs, not resolved text: this table is module-level, so a
 *  string here would be frozen at import time — before a language exists. */
const USE_CASES = [
  ['welcome.useCase1', 'welcome.useCase1Desc'],
  ['welcome.useCase2', 'welcome.useCase2Desc'],
  ['welcome.useCase3', 'welcome.useCase3Desc'],
  ['welcome.useCase4', 'welcome.useCase4Desc'],
  ['welcome.useCase5', 'welcome.useCase5Desc'],
] as const satisfies ReadonlyArray<readonly [RVTranslationKey<'shell'>, RVTranslationKey<'shell'>]>;

/** Deep links to the two built-in demos (resolved against the deploy base path). */
const HMI_DEMO_HREF = `${import.meta.env.BASE_URL}?model=DemoRealvirtualWeb.glb`;
const PLANNER_DEMO_HREF = `${import.meta.env.BASE_URL}?scene=published:DemoPlanner&mode=planner`;

// ─── License / beta acceptance ────────────────────────────────────────────
//
// The first time the dialog is shown it acts as an acceptance gate: the
// backdrop does not dismiss it and the confirm button reads "Accept &
// continue". Acceptance covers the beta status and the license terms and is
// recorded once per browser. Where the dialog never auto-opens (Viewer
// workspaces, plan-387 F4) no acceptance is asked — spectators following a
// shared link only run the software, which the AGPL permits without
// accepting anything.

const TERMS_ACCEPTED_KEY = 'rv-terms-accepted';

// Session fallback so a throwing storage (Safari private mode) still holds
// the answer until the page is reloaded.
let sessionAccepted = false;

/** True once the user accepted the beta note + license terms in this browser. */
export function hasAcceptedTerms(): boolean {
  if (sessionAccepted) return true;
  try {
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === '1';
  } catch {
    return false;
  }
}

function recordTermsAccepted(): void {
  sessionAccepted = true;
  try {
    localStorage.setItem(TERMS_ACCEPTED_KEY, '1');
  } catch {
    // Storage unavailable — sessionAccepted carries the answer.
  }
}

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional: when supplied, a "Start Demo" button is rendered beside "Got it". */
  onStartDemo?: () => void;
}

export function WelcomeModal({ open, onClose, onStartDemo }: WelcomeModalProps) {
  const { t } = useRvTranslation('shell');
  // Track visibility in the welcome-modal-store so KioskPlugin can pause idle
  // detection while the modal blocks interaction. Cleanup on unmount sets false.
  useEffect(() => {
    setWelcomeModalOpen(open);
    return () => { setWelcomeModalOpen(false); };
  }, [open]);

  // Demo links only make sense on the public XYvirtual demo. A customer deploy
  // sets custom branding, so we hide the demo shortcuts there.
  const custom = useCustomBranding();

  // First visit in this browser: the dialog is an acceptance gate. Reading
  // storage at render is fine — the component renders only while visible.
  const mustAccept = open && !hasAcceptedTerms();

  const acceptAndClose = () => {
    recordTermsAccepted();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.6)',
        pointerEvents: 'auto',
      }}
      onClick={mustAccept ? undefined : onClose}
    >
      <Paper
        elevation={12}
        sx={{
          borderRadius: 2,
          width: 680,
          maxWidth: '95vw',
          p: { xs: 2.5, sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
          maxHeight: '90dvh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#4fc3f7' }}>
            XYvirtual WEB
          </Typography>
          <Box
            component="span"
            data-testid="welcome-beta-badge"
            sx={{
              px: 0.75,
              borderRadius: 1,
              border: '1px solid rgba(79,195,247,0.5)',
              color: '#4fc3f7',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.5,
              lineHeight: '18px',
            }}
          >
            BETA
          </Box>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', letterSpacing: 2, textTransform: 'uppercase', fontSize: 10, mt: -1 }}>
          {t('welcome.slogan')}
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          {t('welcome.intro')}
        </Typography>

        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {USE_CASES.map(([labelKey, descKey]) => (
            <Typography key={labelKey} component="li" variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
              <strong style={{ color: '#fff' }}>{t(labelKey)}</strong> — {t(descKey)}
            </Typography>
          ))}
        </Box>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          {t('welcome.share')}
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          {t('welcome.connect')}
        </Typography>

        {!custom && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
              {t('welcome.demosTitle')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                component="a"
                href={HMI_DEMO_HREF}
                variant="outlined"
                size="small"
                startIcon={<ViewQuiltOutlinedIcon />}
                data-testid="welcome-demo-hmi"
                sx={{ textTransform: 'none', fontWeight: 600, minWidth: 150, justifyContent: 'flex-start' }}
              >
                {t('welcome.hmiDemo')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('welcome.hmiDemoDesc')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                component="a"
                href={PLANNER_DEMO_HREF}
                variant="outlined"
                size="small"
                startIcon={<GridViewOutlinedIcon />}
                data-testid="welcome-demo-planner"
                sx={{ textTransform: 'none', fontWeight: 600, minWidth: 150, justifyContent: 'flex-start' }}
              >
                {t('welcome.plannerDemo')}
              </Button>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('welcome.plannerDemoDesc')}
              </Typography>
            </Box>
          </Box>
        )}

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          {/* One paragraph, one key. The three links and the emphasis all sit
              mid-sentence; split into fragments they would freeze English word
              order into the catalog. */}
          <strong style={{ color: '#fff' }}>{t('welcome.betaTitle')}</strong> —{' '}
          <Trans
            ns="shell"
            i18nKey="welcome.betaText"
            components={[
              <strong key="license" style={{ color: '#fff' }} />,
              <a key="terms" href="https://xyvirtual.io/en/terms/" target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', textDecoration: 'none' }} />,
              <a key="site" href="https://xyvirtual.io" target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', textDecoration: 'none' }} />,
            ]}
          />
        </Typography>

        <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
          <a href="https://github.com/xyvirtual/XYvirtual-WEB" target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', textDecoration: 'none' }}>
            github.com/xyvirtual/XYvirtual-WEB
          </a>
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 10 }}>
            XYvirtual WEB {formatVersionFull()}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
            &copy; 2025 realvirtual GmbH
          </Typography>
        </Box>

        {mustAccept && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            {t('welcome.mustAccept')}
          </Typography>
        )}

        <Box sx={{ display: 'flex', justifyContent: onStartDemo ? 'space-between' : 'flex-end', mt: 1, gap: 1 }}>
          {onStartDemo && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<SlideshowOutlinedIcon />}
              onClick={() => { acceptAndClose(); onStartDemo(); }}
              data-testid="welcome-start-demo"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {t('welcome.startDemo')}
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={acceptAndClose}
            data-testid="welcome-dismiss"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {t(mustAccept ? 'welcome.acceptContinue' : 'welcome.gotIt')}
          </Button>
        </Box>
      </Paper>
    </Box>,
    document.body,
  );
}
