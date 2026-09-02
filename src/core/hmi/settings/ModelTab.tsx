// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Typography, Box, Button } from '@mui/material';
import { RestartAlt, FileDownload, FileUpload, CleaningServices, Cookie, RestorePage } from '@mui/icons-material';
import { useViewer } from '../../../hooks/use-viewer';
import { clearAllRVStorage } from '../rv-storage-keys';
import { clearCadGlbCache, getCadGlbCacheSize } from '../../import/rv-cad-glb-cache';
import { isSettingsLocked } from '../../rv-app-config';
import { isAnalyticsConfigured, useAnalyticsConsent, resetAnalyticsConsent } from '../../consent-store';
import { SettingsSection } from './settings-helpers';
import { WorkfolderMigrationSection } from './WorkfolderMigrationSection';
import { useRvTranslation } from '../../i18n';
import {
  downloadBrowserUpgradeBackup,
  listBrowserUpgradeBackups,
  restoreBrowserUpgradeBackup,
  UPGRADE_BLOCKED_KEY,
  type BrowserUpgradeBackup,
} from '../../upgrade/rv-browser-upgrade-backup';

/**
 * Enumerate legacy WebViewer localStorage keys that the unified Scene model
 * superseded. They are no longer read but may consume quota on long-running
 * deployments. The Settings → Backup tab exposes a button that calls this.
 */
function listLegacyWebViewerKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (
      k === 'rv-layouts-index' ||
      k.startsWith('rv-layouts/') ||
      k === 'rv-scene-active' ||
      k === 'rv-layout-autosave' ||
      k === 'rv-layout-library-urls' ||
      k.startsWith('rv-extras-overlay:') ||
      k.startsWith('rv-extras-originals:')
    ) {
      out.push(k);
    }
  }
  return out;
}
import {
  collectSettingsBundle,
  downloadSettingsBundle,
  importSettingsFile,
  applySettingsBundle,
  getModelBasename,
} from '../rv-settings-bundle';
import type { RVSettingsBundle } from '../rv-settings-bundle';

/**
 * BackupTab — Settings export/import + reset.
 *
 * Note: model selection moved to the Scene window (top-bar Scene button).
 * The file is still named ModelTab.tsx for git-history continuity, but the
 * exported component is `BackupTab` and the Settings tab label is "Backup".
 */
export function BackupTab() {
  const { t, locale } = useRvTranslation('settings');
  const viewer = useViewer();

  // Import confirmation state
  const [pendingImport, setPendingImport] = useState<RVSettingsBundle | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [upgradeBackups, setUpgradeBackups] = useState<BrowserUpgradeBackup[]>([]);
  const [upgradeBackupError, setUpgradeBackupError] = useState<string | null>(null);
  const [upgradeRestoreBusy, setUpgradeRestoreBusy] = useState(false);

  useEffect(() => {
    void listBrowserUpgradeBackups()
      .then(setUpgradeBackups)
      .catch(error => setUpgradeBackupError(error instanceof Error ? error.message : String(error)));
  }, []);

  const latestUpgradeBackup = upgradeBackups[0] ?? null;
  const upgradeBlocked = useMemo(() => {
    try {
      const raw = localStorage.getItem(UPGRADE_BLOCKED_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { reason?: unknown };
      return typeof parsed.reason === 'string' ? parsed.reason : t('backup.upgradeBlockedUnknown');
    } catch {
      return t('backup.upgradeBlockedUnknown');
    }
  }, [t]);
  const handleRestoreUpgradeBackup = useCallback(() => {
    if (upgradeRestoreBusy || !latestUpgradeBackup || !confirm(t('backup.upgradeRestoreConfirm', { version: latestUpgradeBackup.sourceVersion }))) return;
    setUpgradeBackupError(null);
    setUpgradeRestoreBusy(true);
    void restoreBrowserUpgradeBackup(latestUpgradeBackup)
      .then(() => window.location.reload())
      .catch(error => {
        setUpgradeBackupError(error instanceof Error ? error.message : String(error));
        setUpgradeRestoreBusy(false);
      });
  }, [latestUpgradeBackup, t, upgradeRestoreBusy]);

  // Analytics consent (only relevant when a tracker is configured).
  const analyticsConfigured = isAnalyticsConfigured();
  const analyticsConsented = useAnalyticsConsent();
  const handleWithdrawConsent = useCallback(() => {
    resetAnalyticsConsent();
    window.location.reload();
  }, []);

  const handleResetAll = () => {
    clearAllRVStorage();
    window.location.reload();
  };

  // Legacy WebViewer data cleanup — see listLegacyWebViewerKeys above.
  const legacyKeyCount = useMemo(() => listLegacyWebViewerKeys().length, []);
  const handleClearLegacy = useCallback(() => {
    const keys = listLegacyWebViewerKeys();
    if (keys.length === 0) return;
    if (!confirm(t('backup.clearLegacyConfirm', { count: keys.length }))) return;
    for (const k of keys) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    localStorage.setItem('rv-scenes-cleared-legacy', 'true');
    window.location.reload();
  }, [t]);

  // Imported CAD (STEP→GLB) cache size, for the "Clear CAD import cache" button.
  const [cadCacheBytes, setCadCacheBytes] = useState<number | null>(null);
  useEffect(() => {
    void getCadGlbCacheSize().then(setCadCacheBytes).catch(() => setCadCacheBytes(null));
  }, []);
  const handleClearCadCache = useCallback(() => {
    const mb = cadCacheBytes != null ? (cadCacheBytes / 1048576).toFixed(1) : '?';
    if (!confirm(t('backup.clearCadCacheConfirm', { mb }))) return;
    void clearCadGlbCache().then(() => window.location.reload());
  }, [cadCacheBytes, t]);

  const handleExport = useCallback(() => {
    const bundle = collectSettingsBundle(viewer.currentModelUrl ?? null);
    const basename = getModelBasename(viewer.currentModelUrl ?? null);
    downloadSettingsBundle(bundle, `${basename}.settings.json`);
  }, [viewer]);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    setPendingImport(null);
    // Create imperative file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const bundle = await importSettingsFile(file);
        setPendingImport(bundle);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t('backup.importFailed'));
        setPendingImport(null);
      }
    };
    input.click();
  }, [t]);

  const handleApplyImport = useCallback(() => {
    if (!pendingImport) return;
    applySettingsBundle(pendingImport);
    setPendingImport(null);
    window.location.reload();
  }, [pendingImport]);

  const handleCancelImport = useCallback(() => {
    setPendingImport(null);
    setImportError(null);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Export / Import Settings */}
      {!isSettingsLocked() && (
        <SettingsSection id="model-settings" title={t('backup.settings')}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownload sx={{ fontSize: 14 }} />}
              onClick={handleExport}
              sx={{ fontSize: 11, textTransform: 'none', flex: 1 }}
            >
              {t('backup.export')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileUpload sx={{ fontSize: 14 }} />}
              onClick={handleImportClick}
              sx={{ fontSize: 11, textTransform: 'none', flex: 1 }}
            >
              {t('backup.import')}
            </Button>
          </Box>

          {/* Import error */}
          {importError && (
            <Typography variant="caption" sx={{ color: '#f44336', display: 'block', mt: 1, fontSize: 10 }}>
              {importError}
            </Typography>
          )}

          {/* Import confirmation */}
          {pendingImport && (
            <Box sx={{
              mt: 1.5, p: 1.5, borderRadius: 1,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
                {t('backup.importFrom', { name: getModelBasename(pendingImport.modelUrl ?? null) })}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
                {t('backup.importExported', {
                  date: pendingImport.exportedAt
                    ? new Date(pendingImport.exportedAt).toLocaleDateString(locale)
                    : t('backup.unknownDate'),
                })}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  color="primary"
                  onClick={handleApplyImport}
                  sx={{ fontSize: 11, textTransform: 'none' }}
                >
                  {t('backup.apply')}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleCancelImport}
                  sx={{ fontSize: 11, textTransform: 'none' }}
                >
                  {t('backup.cancel')}
                </Button>
              </Box>
            </Box>
          )}
        </SettingsSection>
      )}

      {(latestUpgradeBackup || upgradeBackupError || upgradeBlocked) && (
        <SettingsSection id="model-upgrade-backup" title={t('backup.upgradeTitle')}>
          {latestUpgradeBackup && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontSize: 10 }}>
            {t('backup.upgradeHint', {
              version: latestUpgradeBackup.sourceVersion,
              date: new Date(latestUpgradeBackup.createdAt).toLocaleString(locale),
            })}
          </Typography>}
          {latestUpgradeBackup && <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownload sx={{ fontSize: 14 }} />}
              onClick={() => downloadBrowserUpgradeBackup(latestUpgradeBackup)}
              sx={{ fontSize: 11, textTransform: 'none', flex: 1 }}
            >
              {t('backup.upgradeDownload')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={<RestorePage sx={{ fontSize: 14 }} />}
              onClick={handleRestoreUpgradeBackup}
              disabled={upgradeRestoreBusy}
              sx={{ fontSize: 11, textTransform: 'none', flex: 1 }}
            >
              {t('backup.upgradeRestore')}
            </Button>
          </Box>}
          {(upgradeBackupError || upgradeBlocked) && (
            <Typography variant="caption" sx={{ color: '#f44336', display: 'block', mt: 1, fontSize: 10 }}>
              {t('backup.upgradeBlocked', { reason: upgradeBackupError ?? upgradeBlocked })}
            </Typography>
          )}
        </SettingsSection>
      )}

      {/* Reset all settings (hidden when locked) */}
      {!isSettingsLocked() && (
        <SettingsSection id="model-reset" title={t('backup.reset')}>
          <Box>
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={<RestartAlt sx={{ fontSize: 14 }} />}
              onClick={handleResetAll}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              {t('backup.resetAll')}
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
              {t('backup.resetAllHint')}
            </Typography>
          </Box>
        </SettingsSection>
      )}

      {/* Legacy data cleanup — orphaned keys from before the unified Scene model */}
      {!isSettingsLocked() && legacyKeyCount > 0 && (
        <SettingsSection id="model-legacy" title={t('backup.legacy')}>
          <Box>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<CleaningServices sx={{ fontSize: 14 }} />}
              onClick={handleClearLegacy}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              {t('backup.clearLegacy', { count: legacyKeyCount })}
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
              {t('backup.clearLegacyHint')}
            </Typography>
          </Box>
        </SettingsSection>
      )}

      {/* Imported CAD cache — content-addressed converted GLBs from STEP import. */}
      {!isSettingsLocked() && (cadCacheBytes ?? 0) > 0 && (
        <SettingsSection id="model-cad-cache" title={t('backup.cadData')}>
          <Box>
            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<CleaningServices sx={{ fontSize: 14 }} />}
              onClick={handleClearCadCache}
              sx={{ fontSize: 11, textTransform: 'none' }}
            >
              {t('backup.clearCadCache', { mb: Math.max(1, Math.round((cadCacheBytes ?? 0) / 1048576)) })}
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
              {t('backup.clearCadCacheHint')}
            </Typography>
          </Box>
        </SettingsSection>
      )}

      {/* The permanent way back into an old working folder (plan-709 §2.6). Not
          an upgrade banner: it never expires, because a browser-backed project
          has no other in-app route to those files. */}
      {!isSettingsLocked() && <WorkfolderMigrationSection />}

      {/* Analytics consent — only shown when a tracker is configured (GDPR withdrawal). */}
      {analyticsConfigured && (
        <SettingsSection id="model-privacy" title={t('backup.privacy')}>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontSize: 10 }}>
              {analyticsConsented ? t('backup.analyticsOn') : t('backup.analyticsOff')}
            </Typography>
            {analyticsConsented && (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  color="warning"
                  startIcon={<Cookie sx={{ fontSize: 14 }} />}
                  onClick={handleWithdrawConsent}
                  sx={{ fontSize: 11, textTransform: 'none' }}
                >
                  {t('backup.withdraw')}
                </Button>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: 10 }}>
                  {t('backup.withdrawHint')}
                </Typography>
              </>
            )}
          </Box>
        </SettingsSection>
      )}
    </Box>
  );
}
