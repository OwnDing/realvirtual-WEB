// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react';
import { MenuItem, Select, Typography } from '@mui/material';
import { useViewer } from '../../../hooks/use-viewer';
import { useRvTranslation } from '../../i18n';
import { selectPerformanceQuality } from '../performance-quality';
import type { QualityMode } from '../../engine/rv-adaptive-quality';
import { SettingsSection } from './settings-helpers';
import { isSettingsLocked } from '../../rv-app-config';
export function PerformanceQualitySection() {
  const viewer = useViewer(),
    { t } = useRvTranslation('preboot');
  const state = useSyncExternalStore(
    viewer.adaptiveQuality.subscribe,
    viewer.adaptiveQuality.getSnapshot,
  );
  return (
    <SettingsSection id="visual-performance" title={t('performance.quality')}>
      <Select
        size="small"
        value={state.mode}
        disabled={isSettingsLocked()}
        inputProps={{ 'aria-label': t('performance.quality') }}
        onChange={(event) =>
          selectPerformanceQuality(viewer.adaptiveQuality, event.target.value as QualityMode)
        }
      >
        {(['auto', 'high', 'balanced', 'fast', 'manual'] as const).map((mode) => (
          <MenuItem key={mode} value={mode}>
            {t(`performance.${mode}`)}
          </MenuItem>
        ))}
      </Select>
      <Typography variant="body2" role="status">
        {t('performance.qualityStatus', {
          tier: t(`performance.${state.mode === 'manual' ? 'manual' : (['fast', 'balanced', 'high'] as const)[state.tier]}`),
        })}
      </Typography>
      <Typography variant="caption">{t('performance.qualityHint')}</Typography>
    </SettingsSection>
  );
}
