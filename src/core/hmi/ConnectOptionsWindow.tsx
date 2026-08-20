// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ConnectOptionsWindow — floating CONNECT settings window.
 *
 * Everything that configures the gateway (as opposed to operating it) lives
 * here, so the ConnectPanel tab can stay a pure operations view:
 *   1. Connection — server URL, connect/disconnect, gateway version + self-update
 *   2. License — registration / activation / grace status (LicenseSection)
 *   3. Configuration profile — named snapshots of interfaces + bridges
 *   4. Historian (InfluxDB) — recording connection settings
 *
 * Sections 2-4 require a connected gateway and collapse to a hint otherwise.
 */

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Divider,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  FormControlLabel,
  Switch,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Add, Delete, Circle, WarningAmber } from '@mui/icons-material';
import { FloatingPanel } from './FloatingPanel';
import { RV_SCROLL_CLASS } from './shared-sx';
import {
  subscribeConnectStore,
  getConnectSnapshot,
  setServerUrl,
  connectToServer,
  disconnectFromServer,
  fetchProfiles,
  saveProfile,
  deleteProfile,
  activateProfile,
  fetchActiveModel,
  describeProfileBinding,
  type ConnectProfileInfo,
} from './connect-store';
import { historianStore, fetchInfluxSettings, saveInfluxSettings, type InfluxDbSettings } from './historian-store';
import { ISA_GREEN, ISA_RED, ISA_AMBER, connectionStateColor } from './isa-colors';
import { LicenseSection } from './LicenseSection';
import { ConnectUpdateSection } from './ConnectUpdateSection';
import { ConfirmActionDialog, type ConfirmAction } from './ConfirmActionDialog';
import { useRvTranslation } from '../i18n';

// ── Shared section chrome ──────────────────────────────────────────────────

function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
      <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 }}>
        {children}
      </Typography>
      {right}
    </Box>
  );
}

const fieldSx = { '& .MuiInputBase-input': { fontSize: 11 }, '& .MuiInputLabel-root': { fontSize: 11 } } as const;

// ── Section 1: Connection ──────────────────────────────────────────────────

function ConnectionSection() {
  const { t } = useRvTranslation('connect');
  const snap = useSyncExternalStore(subscribeConnectStore, getConnectSnapshot);
  const [urlInput, setUrlInput] = useState(snap.serverUrl);
  const isConnected = snap.state === 'connected';

  const handleConnect = useCallback(async () => {
    setServerUrl(urlInput);
    await connectToServer({ explicit: true });
  }, [urlInput]);

  const statusLabel = snap.state === 'connected' ? 'Connected'
    : snap.state === 'connecting' ? t('options.connecting')
    : snap.state === 'error' ? t('options.error')
    : t('options.disconnected');
  const statusColor = connectionStateColor(snap.state) ?? 'rgba(255,255,255,0.5)';

  return (
    <Box>
      <SectionTitle>{t('options.connection')}</SectionTitle>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small"
          label={t('options.server')}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setServerUrl(urlInput);
              void connectToServer({ explicit: true });
            }
          }}
          placeholder="http://localhost:5100"
          sx={{
            flex: 1,
            '& .MuiInputBase-input': { fontSize: 11, py: 0.75, px: 1, fontFamily: 'monospace' },
            '& .MuiInputLabel-root': { fontSize: 11 },
          }}
        />
        {isConnected ? (
          <Button
            size="small"
            variant="outlined"
            onClick={() => disconnectFromServer()}
            sx={{ fontSize: 10, textTransform: 'none', minWidth: 80, color: 'text.secondary', borderColor: 'rgba(255,255,255,0.23)' }}
          >
            {t('options.disconnect')}
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            onClick={() => void handleConnect()}
            disabled={snap.state === 'connecting'}
            sx={{ fontSize: 10, textTransform: 'none', minWidth: 80 }}
          >
            {snap.state === 'connecting' ? 'Connecting...' : 'Connect'}
          </Button>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
        <Circle sx={{ fontSize: 7, color: statusColor }} />
        <Typography sx={{ fontSize: 11, fontWeight: 500, color: statusColor }}>{statusLabel}</Typography>
        <Box sx={{ flex: 1 }} />
        {isConnected && snap.serverVersion && (
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>
            v{snap.serverVersion}
            {snap.serverBuild && ` · build ${snap.serverBuild}`}
            {snap.serverBuildDate && ` · ${snap.serverBuildDate}`}
          </Typography>
        )}
      </Box>
      {/* The update surface sits exactly where version and build already are. It shows nothing at
          rest, nothing on gateways that do not know the feature, and nothing when an update is
          structurally impossible (plan-343 section 3). */}
      {isConnected && <ConnectUpdateSection />}
      {snap.state === 'error' && snap.errorMessage && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.5 }}>
          <WarningAmber sx={{ fontSize: 13, color: ISA_AMBER, mt: 0.1, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.5 }}>{snap.errorMessage}</Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Section 3: Configuration profile (plan-258) ────────────────────────────
//
// A profile is a named snapshot of the whole signal configuration (interfaces +
// bridges), optionally bound to a GLB model. A model-bound profile activates
// automatically when its model becomes active (upload or startup) — "the model
// always runs with its profile". Switching is lossless: the gateway writes the
// live set back into the previous profile first.

function ProfileSection({ onSwitched }: { onSwitched: () => void }) {
  const { t } = useRvTranslation('connect');
  const [profiles, setProfiles] = useState<ConnectProfileInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetchProfiles();
      setProfiles(r.profiles);
      setActive(r.active);
      setSupported(true);
    } catch {
      setSupported(false); // older gateway
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleActivate = useCallback(async (name: string) => {
    if (!name || name === active) return;
    setBusy(true);
    setError(null);
    try {
      await activateProfile(name);
      await reload();
      onSwitched(); // bridges etc. changed with the swapped config
    } catch (err) {
      setError(err instanceof Error ? err.message : t('options.activateFailed'));
    } finally {
      setBusy(false);
    }
  }, [active, reload, onSwitched]);

  const handleDelete = useCallback(() => {
    if (!active) return;
    setConfirmAction({
      title: t('options.deleteTitle', { name: active }),
      message: t('options.deleteMessage'),
      confirmLabel: t('options.deleteConfirm'),
      onConfirm: async () => {
        try {
          await deleteProfile(active);
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : t('options.deleteFailed'));
        }
      },
    });
  }, [active, reload]);

  if (!supported) return null;

  return (
    <Box>
      <SectionTitle>{t('options.profileSection')}</SectionTitle>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <FormControl size="small" variant="standard" sx={{ flex: 1, minWidth: 0 }}>
          <Select
            displayEmpty
            value={active ?? ''}
            disabled={busy}
            onChange={(e) => void handleActivate(e.target.value)}
            sx={{ fontSize: 11 }}
            inputProps={{ 'aria-label': t('options.activeProfile') }}
            renderValue={(v) => {
              if (!v) return <em style={{ opacity: 0.7 }}>{t('options.unsavedLive')}</em>;
              const p = profiles.find(x => x.name === v);
              // plan-718: prefer the manifest binding (documents / connectRef) and fall back to the
              // deprecated model name, so both gateway generations render something meaningful.
              const binding = p ? describeProfileBinding(p) : null;
              return binding ? `${v} · ${binding}` : v;
            }}
          >
            {profiles.length === 0 && (
              <MenuItem value="" disabled sx={{ fontSize: 12 }}>{t('options.noProfiles')}</MenuItem>
            )}
            {profiles.map((p) => (
              <MenuItem key={p.name} value={p.name} sx={{ fontSize: 12 }}>
                {p.name}
                <Typography component="span" sx={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', ml: 0.75 }}>
                  {t('options.interfaceCount', { count: p.interfaceCount })}
                  {describeProfileBinding(p) ? ` · ${describeProfileBinding(p)}` : ''}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {busy && <CircularProgress size={12} />}
        <Tooltip title={t('options.saveTooltip')}>
          <Button size="small" startIcon={<Add sx={{ fontSize: 12 }} />} onClick={() => setSaveOpen(true)} sx={{ fontSize: 11, textTransform: 'none', minWidth: 0 }}>
            {t('options.save')}
          </Button>
        </Tooltip>
        {active && (
          <Tooltip title={t('options.deleteTooltip', { name: active })}>
            <IconButton size="small" aria-label={t('options.deleteTooltip', { name: active })} onClick={handleDelete} sx={{ p: 0.25, color: 'rgba(255,255,255,0.5)', '&:hover': { color: ISA_RED } }}>
              <Delete sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', mt: 0.75, lineHeight: 1.5 }}>
        {t('options.profileHint')}
      </Typography>
      {error && <Typography sx={{ fontSize: 11, color: ISA_RED, mt: 0.5 }}>{error}</Typography>}

      <ConfirmActionDialog action={confirmAction} onClose={() => setConfirmAction(null)} />
      {saveOpen && (
        <SaveProfileDialog
          open
          initialName={active ?? ''}
          initialModel={profiles.find(p => p.name === active)?.model ?? ''}
          onClose={() => setSaveOpen(false)}
          onSaved={() => { setSaveOpen(false); void reload(); }}
        />
      )}
    </Box>
  );
}

/** Save the current live config as a named profile, optionally bound to a GLB model name. */
function SaveProfileDialog({
  open,
  initialName,
  initialModel,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialName: string;
  initialModel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useRvTranslation('connect');
  const [name, setName] = useState(initialName);
  const [model, setModel] = useState(initialModel);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill the model binding with the gateway's active model when nothing is set yet.
  useEffect(() => {
    if (initialModel) return;
    void fetchActiveModel().then((m) => {
      if (m) setModel((prev) => prev || m.replace(/^models\//, ''));
    }).catch(() => { /* no model uploaded yet */ });
  }, [initialModel]);

  const handleSave = useCallback(async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(n, model.trim() || undefined);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('options.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [name, model, onSaved]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 14 }}>{t('options.saveDialogTitle')}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', mb: 1.5 }}>
          {t('options.saveDialogHint')}
        </Typography>
        {error && <Typography sx={{ fontSize: 11, color: ISA_RED, mb: 1 }}>{error}</Typography>}
        <TextField
          fullWidth size="small" label={t('options.profileName')} value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mb: 1.5, mt: 0.5 }}
        />
        <TextField
          fullWidth size="small" label={t('options.boundModel')} value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t('options.boundModelPlaceholder')}
          helperText={t('options.boundModelHelp')}
          FormHelperTextProps={{ sx: { fontSize: 9 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>{t('options.cancel')}</Button>
        <Button variant="contained" disabled={!name.trim() || saving} onClick={() => void handleSave()} sx={{ textTransform: 'none' }}>
          {t(saving ? 'options.saving' : 'options.saveProfile')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Section 4: Historian (InfluxDB) ────────────────────────────────────────

/**
 * Historian (InfluxDB) connection settings. The token is write-only: CONNECT
 * never returns it (`tokenConfigured` flag instead), and saving with an empty
 * token keeps the stored one.
 */
function HistorianSettingsSection() {
  const { t } = useRvTranslation('connect');
  const historian = useSyncExternalStore(historianStore.subscribe, historianStore.getSnapshot, historianStore.getSnapshot);
  const [settings, setSettings] = useState<InfluxDbSettings | null>(null);
  const [token, setToken] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInfluxSettings()
      .then((loaded) => { if (!cancelled) setSettings(loaded); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, []);

  const patch = (partial: Partial<InfluxDbSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    setBusy(true);
    setLoadError(null);
    try {
      await saveInfluxSettings({
        enabled: settings.enabled, url: settings.url, org: settings.org,
        project: settings.project, token,
      });
      setToken('');
      setDirty(false);
      setSettings(await fetchInfluxSettings());
      void historianStore.refreshStatus();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Status truth from /history/status: unambiguous per design principle 3 —
  // color + label, never color alone.
  const status = historian.status;
  const statusColor = !settings?.enabled ? 'rgba(255,255,255,0.4)'
    : status?.connected ? ISA_GREEN
    : status?.authError ? ISA_RED : ISA_AMBER;
  const statusLabel = !settings?.enabled ? 'Recording disabled'
    : status?.connected ? `Recording to ${status.bucket ?? 'InfluxDB'}`
    : status?.authError ? 'Auth error — check token'
    : status?.disabledReason ?? 'Not connected';

  return (
    <Box>
      <SectionTitle
        right={(
          <>
            <Circle sx={{ fontSize: 8, color: statusColor }} />
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{statusLabel}</Typography>
          </>
        )}
      >
        {t('options.historian')}
      </SectionTitle>
      <FormControlLabel
        control={(
          <Switch
            size="small"
            checked={settings?.enabled === true}
            disabled={!settings || busy}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
        )}
        label={t('options.historianEnable')}
        slotProps={{ typography: { sx: { fontSize: 11, color: 'rgba(255,255,255,0.8)' } } }}
        sx={{ ml: -0.5, mb: 0.25 }}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <TextField
          variant="standard" size="small" label={t('options.influxUrl')} sx={fieldSx}
          value={settings?.url ?? ''} disabled={!settings || busy}
          onChange={(e) => patch({ url: e.target.value })}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            variant="standard" size="small" label={t('options.org')} sx={{ ...fieldSx, flex: 1 }}
            value={settings?.org ?? ''} disabled={!settings || busy}
            onChange={(e) => patch({ org: e.target.value })}
          />
          <TextField
            variant="standard" size="small" label={t('options.project')} sx={{ ...fieldSx, flex: 1 }}
            value={settings?.project ?? ''} disabled={!settings || busy}
            onChange={(e) => patch({ project: e.target.value })}
            helperText={settings?.project
              ? t('options.buckets', { raw: `${settings.project.toLowerCase()}_raw` })
              : t('options.projectEmpty')}
            slotProps={{ formHelperText: { sx: { fontSize: 9, mt: 0.25 } } }}
          />
        </Box>
        <TextField
          variant="standard" size="small" type="password" label={t('options.token')} sx={fieldSx}
          value={token} disabled={!settings || busy}
          placeholder={t(settings?.tokenConfigured ? 'options.tokenConfigured' : 'options.tokenPlaceholder')}
          onChange={(e) => { setToken(e.target.value); setDirty(true); }}
          slotProps={{ htmlInput: { 'aria-label': t('options.tokenAria'), autoComplete: 'new-password' } }}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
        {loadError && <Typography sx={{ fontSize: 10, color: ISA_RED, flex: 1, minWidth: 0 }}>{loadError}</Typography>}
        {!loadError && <Box sx={{ flex: 1 }} />}
        {busy && <CircularProgress size={12} />}
        <Button
          size="small" onClick={() => void handleSave()} disabled={!settings || busy || !dirty}
          sx={{ fontSize: 11, textTransform: 'none', minWidth: 0 }}
        >
          {t('options.save')}
        </Button>
      </Box>
    </Box>
  );
}

// ── Window ─────────────────────────────────────────────────────────────────

export interface ConnectOptionsWindowProps {
  open: boolean;
  onClose: () => void;
  /** Bridges etc. changed with a swapped profile — panel reloads them. */
  onProfileSwitched: () => void;
}

export function ConnectOptionsWindow({ open, onClose, onProfileSwitched }: ConnectOptionsWindowProps) {
  const { t } = useRvTranslation('connect');
  const snap = useSyncExternalStore(subscribeConnectStore, getConnectSnapshot);
  const isConnected = snap.state === 'connected';

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title={t('options.windowTitle')}
      panelId="connect-options"
      minWidth={340}
      defaultWidth={400}
      defaultHeight={560}
    >
      <Box className={RV_SCROLL_CLASS} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <ConnectionSection />
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        {isConnected ? (
          <>
            <Box>
              <SectionTitle>{t('options.license')}</SectionTitle>
              {/* LicenseSection carries status, grace detail and the activation dialog. */}
              <LicenseSection serverUrl={snap.serverUrl} />
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
            <ProfileSection onSwitched={onProfileSwitched} />
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
            <HistorianSettingsSection />
          </>
        ) : (
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {t('options.notConnected')}
          </Typography>
        )}
      </Box>
    </FloatingPanel>
  );
}
