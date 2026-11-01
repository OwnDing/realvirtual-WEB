// SPDX-License-Identifier: AGPL-3.0-only

/**
 * AccountBadge — the signed-in HMI user, their role and sign-out (ADR-0024).
 * Renders nothing in deployments without personal accounts (`disabled`).
 */

import { Box, Button, Tooltip, Typography } from '@mui/material';
import { AccountCircle, Logout, WarningAmber } from '@mui/icons-material';
import { useRvTranslation } from '../i18n';
import { useHmiSession } from '../../hooks/use-hmi-session';
import { hmiCan, logoutHmi } from './hmi-session-store';
import { ActionGroupPill } from './action-group';

export function AccountBadge() {
  const { t } = useRvTranslation('shell');
  const session = useHmiSession();
  if (session.status === 'disabled' || session.status === 'loading') return null;

  if (session.status !== 'signed-in' || !session.role || !session.username) {
    const text = session.status === 'signed-out' ? t('account.expired') : t('account.unavailable');
    return (
      <ActionGroupPill>
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25 }}>
          <WarningAmber fontSize="small" color="warning" />
          <Typography variant="caption">{text}</Typography>
          <Button size="small" href="/login/" sx={{ minWidth: 0, textTransform: 'none' }}>{t('account.relogin')}</Button>
        </Box>
      </ActionGroupPill>
    );
  }

  const readOnly = !hmiCan('write-signals', session);
  return (
    <ActionGroupPill>
      <Tooltip title={readOnly ? t('account.readOnlyHint') : ''}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25 }} data-testid="hmi-account">
          <AccountCircle fontSize="small" />
          <Typography variant="caption" noWrap>
            {t('account.signedInAs', { username: session.username })} · {t(`account.role_${session.role}`)}
          </Typography>
          <Button
            size="small"
            onClick={() => { void logoutHmi(); }}
            aria-label={t('account.logout')}
            sx={{ minWidth: 0, p: 0.25 }}
          >
            <Logout fontSize="small" />
          </Button>
        </Box>
      </Tooltip>
    </ActionGroupPill>
  );
}
