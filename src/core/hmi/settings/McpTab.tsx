// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useState, useEffect, type ReactNode } from 'react';
import { Typography, Box, Button, Switch, TextField } from '@mui/material';
import { useViewer } from '../../../hooks/use-viewer';
import { useMcpBridge, useMcpBridgeLog } from '../../../hooks/use-mcp-bridge';
import type { McpBridgePluginAPI } from '../../types/plugin-types';
import { StatRow, SettingsSection, FieldRow } from './settings-helpers';
import { ConnectDownloadLinks } from '../ConnectPanel';
import { RagStatusSection } from './RagStatusSection';
import { useRvTranslation } from '../../i18n';
import { Trans } from 'react-i18next';

/** The default transport: XYvirtual CONNECT hosts the MCP endpoint itself, so any
 *  MCP client registers ONE http entry and needs neither Node nor Vite (plan-327 AP5). */
const CONNECT_MCP_SNIPPET = `"XYvirtual-CONNECT": {
  "type": "http",
  "url": "http://localhost:5100/mcp"
}`;

/** Emergency fallback only — see doc-ai-integration.md → "Falling back to the Node bridge". */
const NODE_FALLBACK_SNIPPET = `"WebViewerMCP": {
  "command": "node",
  "args": ["<project>/Assets/realvirtual-WebViewer~/mcp-bridge/dist/index.js"]
}`;

const BUILD_CMD = 'cd Assets/realvirtual-WebViewer~/mcp-bridge\nnpm run setup';

/** Monospace block with a copy-to-clipboard button. */
function CodeBlock({ text }: { text: string }) {
  const { t } = useRvTranslation('settings');
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <Box sx={{ position: 'relative', bgcolor: 'rgba(0,0,0,0.35)', borderRadius: 1, p: 1, pr: 5 }}>
      <Typography component="pre" sx={{
        fontFamily: 'monospace', fontSize: 11, m: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'rgba(255,255,255,0.85)',
      }}>
        {text}
      </Typography>
      <Button size="small" variant="text" onClick={copy}
        sx={{ position: 'absolute', top: 2, right: 2, minWidth: 0, px: 0.75, textTransform: 'none', fontSize: 10 }}>
        {copied ? '✓' : t('ai.copy')}
      </Button>
    </Box>
  );
}

/** The caption styling every setup-step body shares. */
function StepText({ children }: { children: ReactNode }) {
  return (
    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
      {children}
    </Typography>
  );
}

/** A numbered setup step. */
function SetupStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
        {n}. {title}
      </Typography>
      {children}
    </Box>
  );
}

export function McpTab() {
  const { t } = useRvTranslation('settings');
  const viewer = useViewer();
  const mcp = useMcpBridge();
  const log = useMcpBridgeLog();
  const mcpPlugin = viewer.getPlugin<McpBridgePluginAPI>('mcp-bridge');
  const [portInput, setPortInput] = useState(mcp.port);
  const [portError, setPortError] = useState(false);

  // Sync portInput when mcp.port changes externally
  useEffect(() => { setPortInput(mcp.port); }, [mcp.port]);

  const stateColor = mcp.connected ? '#66bb6a'
    : mcp.reconnectAttempt > 0 ? '#ffa726'
    : mcp.enabled ? '#ef5350'
    : 'rgba(255,255,255,0.5)';

  const stateLabel = mcp.connected ? t('ai.connected')
    : mcp.reconnectAttempt > 0 ? t('ai.reconnecting', { attempt: mcp.reconnectAttempt })
    : mcp.enabled ? t('ai.disconnected')
    : t('ai.disabled');

  // Full-chain status: the bridge server pushes who's attached (which Claude)
  // and when it was last active. Both CONNECT and the Node bridge send this frame;
  // the legacy Python bridge does not, so these rows stay hidden for it.
  const ss = mcp.serverStatus;
  const aiConnected = !!ss?.clientConnected;
  const aiColor = aiConnected ? '#66bb6a' : '#ef5350';
  const aiLabel = aiConnected ? (ss?.clientName ?? t('ai.clientAttached')) : t('ai.noClient');

  const fmtAgo = (ms: number | null | undefined): string => {
    if (ms == null) return t('ai.idle');
    if (ms < 1500) return t('ai.justNow');
    const s = Math.round(ms / 1000);
    if (s < 60) return t('ai.secondsAgo', { count: s });
    const m = Math.round(s / 60);
    if (m < 60) return t('ai.minutesAgo', { count: m });
    return t('ai.hoursAgo', { count: Math.round(m / 60) });
  };
  const fmtUptime = (ms: number | undefined): string => {
    if (ms == null) return '?';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const bridgeLabel = ss
    ? t('ai.bridgeInfo', { pid: ss.pid, port: ss.port, uptime: fmtUptime(ss.uptimeMs) })
    : '—';

  const validatePort = (val: string): boolean => {
    const n = Number(val);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPortInput(val);
    setPortError(val !== '' && !validatePort(val));
  };

  const handlePortBlur = () => {
    if (portInput !== mcp.port && validatePort(portInput)) {
      // Reconnect if running; otherwise just store the port for the next enable.
      if (mcp.enabled) mcpPlugin?.reconnect(portInput);
      else mcpPlugin?.setPort(portInput);
    } else if (!validatePort(portInput)) {
      setPortInput(mcp.port);
      setPortError(false);
    }
  };

  const handlePortKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SettingsSection id="mcp-bridge" title={t('ai.bridge')}>
        {/* Enable toggle */}
        <FieldRow label={t('ai.bridge')}>
          <Switch size="small" checked={mcp.enabled}
            onChange={(_, v) => mcpPlugin?.setEnabled(v)} />
        </FieldRow>

        {/* Status — the FULL chain: browser ⟷ bridge ⟷ AI client. "State" is
            only the browser↔bridge WebSocket leg; "AI client" shows whether a
            live Claude is actually attached (and which one), so a connected
            browser on a host-less bridge no longer looks healthy. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <StatRow label={t('ai.browserToBridge')} value={stateLabel} color={stateColor} />
          {mcp.connected && ss && (
            <>
              <StatRow label={t('ai.client')} value={aiLabel} color={aiColor} />
              <StatRow label={t('ai.lastActivity')} value={fmtAgo(ss.lastRequestAgoMs)} />
            </>
          )}
          <StatRow label={t('ai.tools')} value={String(mcp.toolCount)} />
          <StatRow label={t('ai.port')} value={mcp.port} />
          {mcp.connected && ss && <StatRow label={t('ai.bridgeProcess')} value={bridgeLabel} />}
        </Box>

        {/* No transport picker. CONNECT is the MCP server: it hosts the endpoint and owns the web_*
            tools, so this row asked the operator to choose between the one real answer and two
            fallbacks nobody reaches for unprompted. The Node bridge stays reachable through the port
            field below (18714 Desktop / 18715 Code) and its code is untouched — retiring it is
            plan-348, which has a precondition of its own. */}

        {/* Port config */}
        <FieldRow label={t('ai.port')}>
          <TextField
            size="small"
            type="number"
            value={portInput}
            onChange={handlePortChange}
            onBlur={handlePortBlur}
            onKeyDown={handlePortKeyDown}
            error={portError}
            helperText={portError ? t('ai.portError') : undefined}
            slotProps={{ htmlInput: { min: 1, max: 65535 } }}
            sx={{ width: 110, '& input': { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </FieldRow>

        {/* Retry button */}
        {mcp.enabled && !mcp.connected && (
          <Button size="small" variant="outlined" onClick={() => mcpPlugin?.reconnect()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
            {t('ai.retryNow')}
          </Button>
        )}

        {/* Server controls — the enable toggle above starts/stops the connection;
            these steer the bridge server itself. */}
        {mcp.connected && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={() => mcpPlugin?.pauseServer()}
              sx={{ textTransform: 'none' }}>{t('ai.pause')}</Button>
            <Button size="small" variant="outlined" onClick={() => mcpPlugin?.resumeServer()}
              sx={{ textTransform: 'none' }}>{t('ai.resume')}</Button>
            <Button size="small" variant="outlined" color="error" onClick={() => mcpPlugin?.shutdownServer()}
              sx={{ textTransform: 'none' }}>{t('ai.shutdown')}</Button>
          </Box>
        )}
      </SettingsSection>

      {/* CONNECT RAG / LLM status — the AI-diagnosis assistant that lives in XYvirtual CONNECT,
          shown here next to the MCP bridge (plan-284). Independent of the MCP connection. */}
      <RagStatusSection />

      {/* Setup helper — shown until the bridge is connected. */}
      {!mcp.connected && (
        <SettingsSection id="mcp-setup" title={t('ai.setup')}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
            {t('ai.setupIntro')}
          </Typography>
          {/* Dead end without a gateway: mobile reaches this tab directly and never
              sees the activity-bar download dialog, so the same affordance sits here. */}
          <ConnectDownloadLinks />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
            {/* Each body is ONE key with numbered slots for its <b>/<code> spans:
                splitting them into JSX fragments would freeze English word order
                into the catalog, and every one of these sentences puts the code
                span mid-clause. */}
            <SetupStep n={1} title={t('ai.step1')}>
              <StepText><Trans ns="settings" i18nKey="ai.step1Body" components={[<b key="menu" />]} /></StepText>
            </SetupStep>
            <SetupStep n={2} title={t('ai.step2')}>
              <StepText>
                <Trans ns="settings" i18nKey="ai.step2Body" components={[<code key="file" />, <code key="cmd" />]} />
              </StepText>
              <CodeBlock text={CONNECT_MCP_SNIPPET} />
            </SetupStep>
            <SetupStep n={3} title={t('ai.step3')}>
              <StepText>
                <Trans ns="settings" i18nKey="ai.step3Body" components={[<code key="port" />, <code key="query" />]} />
              </StepText>
            </SetupStep>
            <SetupStep n={4} title={t('ai.step4')}>
              <StepText>
                <Trans ns="settings" i18nKey="ai.step4Body" components={[<code key="desktop" />, <code key="code" />]} />
              </StepText>
              <CodeBlock text={BUILD_CMD} />
              <CodeBlock text={NODE_FALLBACK_SNIPPET} />
            </SetupStep>
          </Box>
        </SettingsSection>
      )}

      {/* Tool list */}
      {mcp.toolNames.length > 0 && (
        <SettingsSection id="mcp-tools" title={t('ai.registeredTools', { count: mcp.toolNames.length })}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pl: 1 }}>
            {mcp.toolNames.map(name => (
              <Typography key={name} variant="caption"
                sx={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                {name}
              </Typography>
            ))}
          </Box>
        </SettingsSection>
      )}

      {/* Server log — streamed from the bridge server over the WebSocket. */}
      {log.length > 0 && (
        <SettingsSection id="mcp-server-log" title={t('ai.serverLog', { count: log.length })}>
          <Box sx={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.1, pl: 0.5 }}>
            {log.slice(-100).map((line, i) => (
              <Typography key={i} variant="caption"
                sx={{ fontFamily: 'monospace', fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: line.level === 'error' ? '#ef5350' : line.level === 'warn' ? '#ffa726' : 'rgba(255,255,255,0.6)' }}>
                {line.msg}
              </Typography>
            ))}
          </Box>
        </SettingsSection>
      )}
    </Box>
  );
}
