// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * License state, as the operator sees it.
 *
 * Two surfaces, deliberately different in weight: a banner that says what is
 * happening and what to do, and a corner watermark that persists once the term
 * has lapsed so a screenshot of the HMI carries the fact with it.
 *
 * Neither of them blocks anything. The only capability an expired license
 * withholds is saving new authoring changes, and that refusal is stated by the
 * Save button itself, where the user is actually trying to act.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { Close, WarningAmber } from '@mui/icons-material';
import { ISA_AMBER } from './isa-colors';
import { getLicenseSnapshot, subscribeLicense } from '../licensing/rv-lic-store';
import type { LicenseEvaluation } from '../licensing/rv-lic-state';
import { getLocale, rvT, useRvTranslation } from '../i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

/** States that keep the banner on screen until the license is replaced. */
const PERSISTENT = new Set<LicenseEvaluation['state']>([
  'grace', 'readonly', 'mismatch', 'unverifiable', 'invalid', 'absent',
]);

/**
 * The sentence for a state.
 *
 * Every one of them names what still works. An operator reading a licensing
 * banner mid-shift needs to know whether the line is about to stop, and the
 * answer is always no.
 */
export function licenseNoticeText(evaluation: LicenseEvaluation): string | null {
  const days = Math.abs(evaluation.daysToExpiry ?? 0);
  switch (evaluation.state) {
    case 'expiring':
      return rvT('shell', 'license.expiringSoon', { days });
    case 'grace':
      return rvT('shell', 'license.inGrace', { days });
    case 'readonly':
      return rvT('shell', 'license.readOnly');
    case 'mismatch':
      return rvT('shell', 'license.bindingMismatch', {
        expected: evaluation.mismatch?.kind === 'host'
          ? evaluation.mismatch.expected.join(', ')
          : evaluation.mismatch?.expected ?? '',
        actual: (evaluation.mismatch?.kind === 'host'
          ? evaluation.mismatch.actual
          : evaluation.mismatch?.actual) ?? '',
      });
    case 'unverifiable':
      return rvT('shell', 'license.cannotVerify');
    case 'invalid':
      return rvT('shell', 'license.fileInvalid');
    case 'absent':
      return rvT('shell', 'license.fileMissing');
    default:
      return null;
  }
}

export function LicenseNoticeBanner(): React.ReactElement | null {
  useRvTranslation('shell');
  const snapshot = useSyncExternalStore(subscribeLicense, getLicenseSnapshot);
  const { evaluation } = snapshot;
  const [dismissedOn, setDismissedOn] = useState<number | null>(null);

  // `expiring` is dismissible but returns the next day: a reminder the operator
  // silenced in March must not stay silent through the whole renewal window.
  const dismissible = evaluation.state === 'expiring';
  useEffect(() => {
    setDismissedOn(null);
  }, [evaluation.state]);

  const text = licenseNoticeText(evaluation);
  if (!snapshot.loaded || !text) return null;
  if (dismissible && dismissedOn !== null && Date.now() - dismissedOn < DAY_MS) return null;

  const persistent = PERSISTENT.has(evaluation.state);

  return (
    <Box
      data-ui-panel
      role="status"
      data-testid="license-notice-banner"
      sx={{
        position: 'fixed',
        // CommissioningTrustBanner owns top:58 with the same width and centring
        // and sits above this one, so sharing that coordinate hid this banner
        // completely whenever both were up. Offset by its height instead: a
        // licence notice that is invisible exactly when something else is also
        // wrong is worse than useless.
        top: 108,
        left: '50%',
        transform: 'translateX(-50%)',
        // Between the storage notice (9400) and the commissioning banner
        // (9490): a licensing message is less urgent than a trust warning and
        // more durable than a storage hint.
        zIndex: 9450,
        pointerEvents: 'auto',
        width: 'min(680px, calc(100vw - 32px))',
      }}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        px: 2,
        py: 1.25,
        bgcolor: 'rgba(68, 48, 15, 0.97)',
        border: `1px solid ${ISA_AMBER}`,
        borderRadius: 2,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(calc(8px * var(--rv-ui-blur-scale, 1)))',
      }}>
        <WarningAmber sx={{ color: ISA_AMBER, fontSize: 20, mt: '1px' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.45, color: '#f5e6c8' }}>
            {text}
          </Typography>
          {evaluation.clockRollback && (
            <Typography sx={{ fontSize: 11.5, lineHeight: 1.45, color: '#d8c9a8', mt: 0.5 }}>
              {rvT('shell', 'license.clockSuspect')}
            </Typography>
          )}
        </Box>
        {dismissible && !persistent && (
          <IconButton
            size="small"
            aria-label={rvT('shell', 'license.dismiss')}
            onClick={() => setDismissedOn(Date.now())}
            sx={{ color: '#d8c9a8', p: 0.25 }}
          >
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

/**
 * The lapsed-term watermark.
 *
 * Non-interactive and out of the way. It exists so the state travels with a
 * screenshot — an operator sending a picture of the HMI to support should not
 * have to also remember that the license lapsed.
 */
export function LicenseWatermark(): React.ReactElement | null {
  useRvTranslation('shell');
  const { evaluation, loaded } = useSyncExternalStore(subscribeLicense, getLicenseSnapshot);
  if (!loaded || !evaluation.watermark) return null;

  return (
    <Box
      aria-hidden
      data-testid="license-watermark"
      sx={{
        position: 'fixed',
        right: 10,
        bottom: 6,
        zIndex: 9450,
        pointerEvents: 'none',
        userSelect: 'none',
        fontSize: 11,
        letterSpacing: 0.4,
        color: 'rgba(245, 230, 200, 0.55)',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}
    >
      {rvT('shell', 'license.watermark')}
    </Box>
  );
}

/**
 * The audit line, under the build identity in Settings.
 *
 * This is where `limits` lands, and it is a READOUT rather than a control:
 * seats cannot be counted from one browser and the signal figure is this
 * deployment's own registration count, not an admission decision. An auditor
 * comparing a contract against a running plant needs the numbers side by side;
 * nothing here refuses anything (CONTRACT-LICENSE-FILE-001 §7).
 */
export function LicenseFooterLine({ registeredSignals }: { registeredSignals: number | null }):
React.ReactElement | null {
  useRvTranslation('shell');
  const { evaluation, loaded } = useSyncExternalStore(subscribeLicense, getLicenseSnapshot);
  if (!loaded || evaluation.state === 'not-required') return null;

  const payload = evaluation.payload;
  const lines: string[] = [];
  if (payload?.customer?.org) lines.push(rvT('shell', 'license.issuedTo', { org: payload.customer.org }));
  if (payload?.notAfter) {
    const parsed = Date.parse(payload.notAfter);
    if (Number.isFinite(parsed)) {
      lines.push(rvT('shell', 'license.validUntil', {
        date: new Date(parsed).toLocaleDateString(getLocale()),
      }));
    }
  }
  if (typeof payload?.limits?.signals === 'number' && registeredSignals !== null) {
    lines.push(rvT('shell', 'license.contractSignals', {
      used: registeredSignals, licensed: payload.limits.signals,
    }));
  }
  if (typeof payload?.limits?.seats === 'number') {
    lines.push(rvT('shell', 'license.contractSeats', { seats: payload.limits.seats }));
  }
  if (lines.length === 0) return null;

  return (
    <Typography
      data-testid="license-footer-line"
      variant="caption"
      // `component="div"` on purpose: the sibling version line is also a
      // caption, and two inline spans in a plain block run together into one
      // unreadable line.
      component="div"
      sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 10 }}
    >
      {lines.join(' · ')}
    </Typography>
  );
}
