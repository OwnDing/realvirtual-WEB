// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ProjectCodeConsentDialog — the one-time prompt in front of a project's own
 * native code (plan-718 stage 2b.3, R8).
 *
 * Mounted once in HMIShell, like ForceConfirmDialog. Two differences from that
 * dialog, both deliberate:
 *
 *  - Mounting REGISTERS the host. `requestProjectCodeConsent` denies when no
 *    host is mounted, so a headless embed cannot end up waiting on a dialog that
 *    will never render — nor running the code because nobody asked.
 *  - The decision is persisted per project id, not per session: the answer to
 *    "do I trust this folder" does not change on reload.
 */

import { useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { GppMaybe } from '@mui/icons-material';
import {
  answerProjectCodeConsent,
  registerProjectCodeConsentHost,
  usePendingProjectCodeConsent,
} from '../project/rv-project-code-consent';
import { useRvTranslation } from '../i18n';
import { Trans } from 'react-i18next';

export function ProjectCodeConsentDialog() {
  const { t } = useRvTranslation('shell');
  const pending = usePendingProjectCodeConsent();

  useEffect(() => registerProjectCodeConsentHost(), []);

  return (
    <Dialog
      open={pending !== null}
      onClose={() => answerProjectCodeConsent(false)}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 14, fontWeight: 600 }}>
        <GppMaybe sx={{ color: '#ffb300' }} />
        {t('projectCode.title')}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 13 }} component="div">
          {/* One key per paragraph, with numbered slots for the two inline
              elements: the project name and the script path both sit mid-clause,
              and a translator has to be able to move them. */}
          <Trans
            ns="shell"
            i18nKey="projectCode.body"
            values={{ name: pending?.projectName || pending?.projectId || '', script: pending?.scriptRef ?? '' }}
            components={[<strong key="name" />, <code key="script" />]}
          />
          <br /><br />
          {t('projectCode.warning')}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          size="small"
          onClick={() => answerProjectCodeConsent(false)}
          sx={{ textTransform: 'none', mr: 'auto' }}
        >
          {t('projectCode.deny')}
        </Button>
        <Button
          size="small"
          variant="contained"
          color="warning"
          onClick={() => answerProjectCodeConsent(true)}
          sx={{ textTransform: 'none' }}
        >
          {t('projectCode.allow')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
