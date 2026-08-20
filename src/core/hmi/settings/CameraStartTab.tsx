// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Settings panel tab — "Start View".
 *
 * Lets the user save/clear a per-model camera start position. The current
 * status is fetched via useCameraStartPos which reacts to model-loaded,
 * model-cleared, storage and CAMERA_START_CHANGED_EVENT.
 */

import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { UISlotProps } from '../../rv-ui-plugin';
import { useCameraStartPos } from '../../../hooks/use-camera-startpos';
import {
  saveCurrentCameraAsStart, clearCurrentCameraStart,
} from '../../../plugins/camera-startpos-plugin';
import { SettingsSection } from './settings-helpers';
import { useRvTranslation } from '../../i18n';

export function CameraStartTab({ viewer }: UISlotProps) {
  const { t, locale } = useRvTranslation('settings');
  const status = useCameraStartPos(viewer);
  const [toast, setToast] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null);

  const handleSave = () => {
    const result = saveCurrentCameraAsStart(viewer);
    if (result === 'ok') setToast({ kind: 'success', msg: t('cameraStart.saved') });
    else if (result === 'no-model') setToast({ kind: 'error', msg: t('cameraStart.noModel') });
    else setToast({ kind: 'error', msg: t('cameraStart.saveFailed') });
    // Note: hook re-renders automatically via CAMERA_START_CHANGED_EVENT dispatched in saveStartPos
  };

  const handleClear = () => {
    if (clearCurrentCameraStart(viewer)) {
      setToast({ kind: 'success', msg: t('cameraStart.cleared') });
    }
  };

  // One sentence, assembled once: which of the three states is showing is a
  // decision about content, not about markup, and keeping it out of the JSX
  // stops the “Saved (user)” branch from being spliced together mid-render.
  const statusText = status.has
    ? status.source === 'author'
      ? t('cameraStart.authorDefault')
      : status.savedAt
        ? t('cameraStart.savedUserAt', { date: new Date(status.savedAt).toLocaleString(locale) })
        : t('cameraStart.savedUser')
    : t('cameraStart.noStartView');

  const saveDisabled = !status.modelKey;
  const clearDisabled = !status.has || status.source === 'author';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SettingsSection id="camera-start" title={t('cameraStart.section')}>
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
          {status.modelKey ? t('cameraStart.model', { name: status.modelKey }) : t('cameraStart.noModel')}
        </Typography>

        <Typography variant="body2">
          {t('cameraStart.status', { value: statusText })}
        </Typography>

        <Stack direction="column" spacing={1} sx={{ maxWidth: 320 }}>
          <Button variant="contained" size="small" disabled={saveDisabled} onClick={handleSave}>
            {t('cameraStart.save')}
          </Button>
          <Button variant="outlined" size="small" disabled={clearDisabled} onClick={handleClear}>
            {t('cameraStart.clear')}
          </Button>
        </Stack>
      </SettingsSection>

      {toast && (
        <Alert severity={toast.kind === 'error' ? 'error' : 'success'}
               onClose={() => setToast(null)}>
          {toast.msg}
        </Alert>
      )}
    </Box>
  );
}
