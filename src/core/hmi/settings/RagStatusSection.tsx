// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useSyncExternalStore, useEffect } from 'react';
import { Box } from '@mui/material';
import { StatRow, SettingsSection } from './settings-helpers';
import {
  subscribeConnectStore,
  getConnectSnapshot,
  fetchDiagnoseStatus,
} from '../connect-store';
import { hasReadyChatProvider, ragState } from './rag-status';
import { useRvTranslation, type RvTranslation } from '../../i18n';

/** Relative "Xs/m/h/d ago" for an ISO-8601 UTC timestamp. */
function fmtIsoAgo(iso: string, t: RvTranslation<'settings'>['t']): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const s = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (s < 60) return t('rag.secondsAgo', { count: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('rag.minutesAgo', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('rag.hoursAgo', { count: h });
  return t('rag.daysAgo', { count: Math.round(h / 24) });
}

/**
 * CONNECT RAG / LLM status, shown in the AI settings tab next to the MCP bridge (plan-284). Reads
 * the shared connect-store snapshot and polls `GET /diagnose/status` on the same 2 s cadence as the
 * connect status dots while this section is mounted and the gateway is connected.
 */
export function RagStatusSection() {
  // Also the language subscription: `ragState` resolves its label against the
  // active locale, so this component has to re-render when the locale moves.
  const { t } = useRvTranslation('settings');
  const snap = useSyncExternalStore(subscribeConnectStore, getConnectSnapshot);

  useEffect(() => {
    if (snap.state !== 'connected') return;
    void fetchDiagnoseStatus();
    const id = window.setInterval(() => void fetchDiagnoseStatus(), 2000);
    return () => window.clearInterval(id);
  }, [snap.state]);

  const st = ragState(snap);
  const rag = snap.rag;
  const detailed = rag !== undefined && rag.supported && rag.enabled;
  const chatReady = hasReadyChatProvider(snap);

  return (
    <SettingsSection id="connect-rag" title={t('rag.section')}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <StatRow label={t('rag.status')} value={st.label} color={st.color} />
        {detailed && (
          <>
            {rag.model && <StatRow label={t('rag.chatModel')} value={rag.model} />}
            {rag.embeddingModel && <StatRow label={t('rag.embedding')} value={rag.embeddingModel} />}
            <StatRow label={t('rag.reranker')} value={rag.rerankState} />
            {rag.providers && (
              <StatRow
                label={t('rag.providers')}
                value={t('rag.providerValue', {
                  embedding: rag.providers.embedding,
                  rerank: rag.providers.rerank,
                  chat: rag.providers.chat,
                })}
              />
            )}
            {rag.chatProviders?.map((provider) => {
              const ready = provider.status.toLowerCase() === 'ready';
              const failed = ['faulted', 'unauthenticated', 'missingbinary', 'unsupportedversion']
                .includes(provider.status.toLowerCase());
              return (
                <StatRow
                  key={provider.name}
                  label={t('rag.chatProvider', { name: provider.name })}
                  value={provider.detail ? `${provider.status} · ${provider.detail}` : provider.status}
                  color={ready ? '#66bb6a' : failed ? '#ef5350' : undefined}
                />
              );
            })}
            {rag.chatTimeoutSeconds !== undefined && (
              <StatRow label={t('rag.chatTimeout')} value={t('rag.seconds', { count: rag.chatTimeoutSeconds })} />
            )}
            {rag.docs !== undefined && <StatRow label={t('rag.indexedDocs')} value={String(rag.docs)} />}
            {rag.chunks !== undefined && <StatRow label={t('rag.indexedChunks')} value={String(rag.chunks)} />}
            <StatRow
              label={t('rag.requestyKey')}
              value={rag.apiKeyConfigured
                ? t('rag.keyConfigured')
                : chatReady ? t('rag.keyNotRequired') : t('rag.keyMissing')}
              color={rag.apiKeyConfigured || chatReady ? undefined : '#ef5350'}
            />
            <StatRow label={t('rag.llmBackend')} value={t('rag.notChecked')} />
            {rag.lastSuccessfulSyncUtc && (
              <StatRow label={t('rag.lastIndexed')} value={fmtIsoAgo(rag.lastSuccessfulSyncUtc, t)} />
            )}
            {rag.lastSyncError && (
              <StatRow label={t('rag.lastSyncError')} value={rag.lastSyncError} color="#ffa726" />
            )}
          </>
        )}
      </Box>
    </SettingsSection>
  );
}
