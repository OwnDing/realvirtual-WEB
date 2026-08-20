// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useState, useEffect } from 'react';
import { Typography, Box, Button, CircularProgress, Select, MenuItem, Switch, TextField } from '@mui/material';
import { useViewer } from '../../../hooks/use-viewer';
import { loadInterfaceSettings, saveInterfaceSettings, type InterfaceSettings, type InterfaceType, INTERFACE_DEFAULTS } from '../../../interfaces/interface-settings-store';
import { InterfaceManager } from '../../../interfaces/interface-manager';
import { StatRow, tfSx, SettingsSection, FieldRow } from './settings-helpers';
import { connectionStateColor } from '../isa-colors';
import { useSignalDisplaySettings, setChipVariant, setTooltipField, type SignalChipVariant } from '../signal-display-store';
import { useRvTranslation, type RVTranslationKey } from '../../i18n';

/** The protocol list. `labelKey` rather than `label`: this table is module-level,
 *  so a resolved string here would be frozen at import time — before any language
 *  preference exists (ADR-0001 §9). */
const INTERFACE_OPTIONS: {
  value: InterfaceType;
  labelKey: RVTranslationKey<'settings'>;
  available: boolean;
}[] = [
  { value: 'none', labelKey: 'interfaces.option.none', available: true },
  { value: 'websocket-realtime', labelKey: 'interfaces.option.wsRealtime', available: true },
  { value: 'ctrlx', labelKey: 'interfaces.option.ctrlx', available: true },
  { value: 'twincat-hmi', labelKey: 'interfaces.option.twincat', available: true },
  { value: 'mqtt', labelKey: 'interfaces.option.mqtt', available: true },
  { value: 'keba', labelKey: 'interfaces.option.keba', available: false },
];

export function InterfacesTab() {
  const { t } = useRvTranslation('settings');
  const viewer = useViewer();
  const manager = viewer.getPlugin<InterfaceManager>('interface-manager');
  const [settings, setSettings] = useState<InterfaceSettings>(loadInterfaceSettings);
  const [connectionState, setConnectionState] = useState<string>(
    manager?.getActive()?.connectionState ?? 'disconnected',
  );
  const [signalCount, setSignalCount] = useState(
    manager?.getActive()?.discoveredSignals.length ?? 0,
  );
  const [connecting, setConnecting] = useState(false);
  const display = useSignalDisplaySettings();

  // Poll connection state
  useEffect(() => {
    const interval = setInterval(() => {
      const active = manager?.getActive();
      setConnectionState(prev => {
        const next = active?.connectionState ?? 'disconnected';
        return prev === next ? prev : next;
      });
      setSignalCount(prev => {
        const next = active?.discoveredSignals.length ?? 0;
        return prev === next ? prev : next;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [manager]);

  const persist = (patch: Partial<InterfaceSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveInterfaceSettings(next);
  };

  const isWsBased = settings.activeType === 'websocket-realtime'
    || settings.activeType === 'ctrlx'
    || settings.activeType === 'twincat-hmi'
    || settings.activeType === 'keba';

  const isMqtt = settings.activeType === 'mqtt';
  const isConnected = connectionState === 'connected';
  const showSettings = settings.activeType !== 'none';

  const handleConnect = async () => {
    if (!manager) return;
    setConnecting(true);
    try {
      await manager.activate(settings.activeType, settings);
    } catch {
      // Error already handled via state
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (!manager) return;
    manager.deactivate();
    setConnectionState('disconnected');
    setSignalCount(0);
  };

  const stateColor = connectionStateColor(connectionState) ?? 'rgba(255,255,255,0.5)';
  const activeProtocolKey = INTERFACE_OPTIONS.find(o => o.value === settings.activeType)?.labelKey;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Interface selector */}
      <SettingsSection id="interfaces-protocol" title={t('interfaces.protocolSection')}>
        <FieldRow label={t('interfaces.protocol')}>
          <Select
            size="small"
            fullWidth
            value={settings.activeType}
            onChange={(e) => {
              const type = e.target.value as InterfaceType;
              if (isConnected) handleDisconnect();
              persist({ activeType: type });
            }}
          >
            {INTERFACE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value} disabled={!opt.available} sx={{ fontSize: 13 }}>
                {t(opt.labelKey)}
                {!opt.available && (
                  <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>{t('interfaces.comingSoon')}</Typography>
                )}
              </MenuItem>
            ))}
          </Select>
        </FieldRow>
      </SettingsSection>

      {/* WebSocket-based settings */}
      {showSettings && isWsBased && (
        <SettingsSection id="interfaces-connection" title={t('interfaces.connection')}>
          <FieldRow label={t('interfaces.address')}>
            <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0 }}>
              <TextField
                size="small"
                fullWidth
                value={settings.wsAddress}
                onChange={(e) => persist({ wsAddress: e.target.value })}
                placeholder="localhost"
                sx={tfSx}
              />
              <TextField
                size="small"
                type="number"
                value={settings.wsPort}
                onChange={(e) => persist({ wsPort: Number(e.target.value) || INTERFACE_DEFAULTS.wsPort })}
                placeholder={t('interfaces.port')}
                sx={{ ...tfSx, width: 90, flexShrink: 0 }}
              />
            </Box>
          </FieldRow>
          <FieldRow label={t('interfaces.path')}>
            <TextField
              size="small"
              fullWidth
              value={settings.wsPath}
              onChange={(e) => persist({ wsPath: e.target.value })}
              placeholder="/"
              sx={tfSx}
            />
          </FieldRow>
          <FieldRow label={t('interfaces.useSsl')}>
            <Switch size="small" checked={settings.wsUseSSL} onChange={(_, v) => persist({ wsUseSSL: v })} />
          </FieldRow>
          {(settings.wsUseSSL || settings.activeType === 'ctrlx' || settings.activeType === 'twincat-hmi') && (
            <FieldRow label={t('interfaces.authToken')}>
              <TextField
                size="small"
                fullWidth
                type="password"
                value={settings.wsAuthToken}
                onChange={(e) => persist({ wsAuthToken: e.target.value })}
                placeholder={settings.activeType === 'twincat-hmi' ? t('interfaces.twincatToken') : t('interfaces.ctrlxToken')}
                sx={tfSx}
              />
            </FieldRow>
          )}
        </SettingsSection>
      )}

      {/* MQTT settings */}
      {showSettings && isMqtt && (
        <SettingsSection id="interfaces-mqtt" title={t('interfaces.mqttBroker')}>
          <FieldRow label={t('interfaces.brokerUrl')}>
            <TextField
              size="small"
              fullWidth
              value={settings.mqttBrokerUrl}
              onChange={(e) => persist({ mqttBrokerUrl: e.target.value })}
              placeholder="ws://localhost:8080/mqtt"
              sx={tfSx}
            />
          </FieldRow>
          <FieldRow label={t('interfaces.username')}>
            <TextField
              size="small"
              fullWidth
              value={settings.mqttUsername}
              onChange={(e) => persist({ mqttUsername: e.target.value })}
              sx={tfSx}
            />
          </FieldRow>
          <FieldRow label={t('interfaces.password')}>
            <TextField
              size="small"
              fullWidth
              type="password"
              value={settings.mqttPassword}
              onChange={(e) => persist({ mqttPassword: e.target.value })}
              sx={tfSx}
            />
          </FieldRow>
          <FieldRow label={t('interfaces.topicPrefix')}>
            <TextField
              size="small"
              fullWidth
              value={settings.mqttTopicPrefix}
              onChange={(e) => persist({ mqttTopicPrefix: e.target.value })}
              placeholder="rv/"
              sx={tfSx}
            />
          </FieldRow>
        </SettingsSection>
      )}

      {/* Connection control — auto-connect toggle + connect/disconnect */}
      {showSettings && (
        <SettingsSection id="interfaces-control" title={t('interfaces.control')}>
          <FieldRow label={t('interfaces.autoConnect')} hint={t('interfaces.autoConnectHint')}>
            <Switch size="small" checked={settings.autoConnect} onChange={(_, v) => persist({ autoConnect: v })} />
          </FieldRow>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {isConnected ? (
              <Button
                variant="outlined"
                size="small"
                color="warning"
                onClick={handleDisconnect}
                sx={{ fontSize: 11, textTransform: 'none' }}
              >
                {t('interfaces.disconnect')}
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={handleConnect}
                disabled={connecting || !manager}
                startIcon={connecting ? <CircularProgress size={12} color="inherit" /> : undefined}
                sx={{ fontSize: 11, textTransform: 'none' }}
              >
                {connecting ? t('interfaces.connecting') : t('interfaces.connect')}
              </Button>
            )}
          </Box>
        </SettingsSection>
      )}

      {/* Status */}
      {showSettings && (
        <SettingsSection id="interfaces-status" title={t('interfaces.status')}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <StatRow label={t('interfaces.state')} value={connectionState} color={stateColor} />
            <StatRow label={t('interfaces.signals')} value={isConnected ? String(signalCount) : '--'} />
            <StatRow label={t('interfaces.protocol')} value={activeProtocolKey ? t(activeProtocolKey) : '--'} />
          </Box>
        </SettingsSection>
      )}

      {/* Signal Display — how signal chips + tooltips render (persisted in the browser) */}
      <SettingsSection id="interfaces-signal-display" title={t('interfaces.signalDisplay')}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FieldRow label={t('interfaces.signalChips')} hint={t('interfaces.signalChipsHint')}>
            <Select
              size="small"
              value={display.chipVariant}
              onChange={(e) => setChipVariant(e.target.value as SignalChipVariant)}
              renderValue={(v) => v === 'full' ? t('interfaces.chipFull') : v === 'standard' ? t('interfaces.chipStandard') : t('interfaces.chipMinimal')}
              sx={tfSx}
            >
              <MenuItem value="full">
                {t('interfaces.chipFull')}
                <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>
                  Conveyor.Start OutBool ●
                </Typography>
              </MenuItem>
              <MenuItem value="standard">
                {t('interfaces.chipStandard')}
                <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>
                  Conveyor.Start ●
                </Typography>
              </MenuItem>
              <MenuItem value="minimal">
                {t('interfaces.chipMinimal')}
                <Typography component="span" sx={{ ml: 1, fontSize: 10, color: 'text.disabled' }}>
                  O ●
                </Typography>
              </MenuItem>
            </Select>
          </FieldRow>
          <FieldRow label={t('interfaces.tooltipValue')}>
            <Switch size="small" checked={display.tooltip.value} onChange={(e) => setTooltipField('value', e.target.checked)} />
          </FieldRow>
          <FieldRow label={t('interfaces.tooltipAddress')}>
            <Switch size="small" checked={display.tooltip.address} onChange={(e) => setTooltipField('address', e.target.checked)} />
          </FieldRow>
          <FieldRow label={t('interfaces.tooltipComment')}>
            <Switch size="small" checked={display.tooltip.comment} onChange={(e) => setTooltipField('comment', e.target.checked)} />
          </FieldRow>
          <FieldRow label={t('interfaces.tooltipBinding')}>
            <Switch size="small" checked={display.tooltip.binding} onChange={(e) => setTooltipField('binding', e.target.checked)} />
          </FieldRow>
        </Box>
      </SettingsSection>

      {!manager && (
        <Typography variant="caption" sx={{ color: '#ef5350' }}>
          {t('interfaces.managerMissing')}
        </Typography>
      )}
    </Box>
  );
}
