// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import type { ConnectSnapshot } from '../connect-store';
import { rvT } from '../../i18n';

/** Derived presentation level for the CONNECT RAG/LLM status row (plan-284). */
export type RagLevel =
  | 'offline'      // CONNECT not connected / gateway unreachable
  | 'unsupported'  // old gateway without /diagnose/status
  | 'disabled'     // gateway has the diagnosis feature turned off
  | 'loading'      // connected, first poll still pending
  | 'error'        // reranker faulted/missing, API key missing, or index faulted
  | 'busy'         // index loading/indexing or reranker loading
  | 'idle'         // index never initialized
  | 'empty'        // index loaded but no documents
  | 'ready'        // index ready
  | 'unknown';     // unexpected/unmapped server value

export interface RagStateResult {
  level: RagLevel;
  /**
   * Resolved against the ACTIVE language at call time (ADR-0001 §1).
   *
   * Not a stored string: `ragState` runs during every render of
   * `RagStatusSection`, which re-renders on `languageChanged`, so resolving here
   * is what makes the row follow the language. `level` stays the stable value
   * tests and callers branch on — only the wording moves.
   */
  label: string;
  color: string;
}

const GREEN = '#66bb6a';
const AMBER = '#ffa726';
const RED = '#ef5350';
const GREY = 'rgba(255,255,255,0.5)';

const LEVEL_COLOR: Record<RagLevel, string> = {
  offline: GREY,
  unsupported: GREY,
  disabled: GREY,
  loading: GREY,
  idle: GREY,
  empty: GREY,
  unknown: GREY,
  busy: AMBER,
  error: RED,
  ready: GREEN,
};

function mk(level: RagLevel, label: string): RagStateResult {
  return { level, label, color: LEVEL_COLOR[level] };
}

/** Shorthand for the common case: the label is `rag.level.<something>`. */
function lvl(level: RagLevel, key: Parameters<typeof rvT<'settings'>>[1]): RagStateResult {
  return mk(level, rvT('settings', key));
}

/** True when CONNECT reports at least one usable chat backend. */
export function hasReadyChatProvider(snapshot: ConnectSnapshot): boolean {
  const rag = snapshot.rag;
  return !!(rag && rag.supported && rag.chatProviders?.some(
    (provider) => provider.status.toLowerCase() === 'ready',
  ));
}

/**
 * Map a {@link ConnectSnapshot} to the RAG/LLM status shown in the settings tab (plan-284).
 *
 * Failure precedence (SOL RC2): a faulted/missing reranker, a missing API key or a faulted index
 * take priority over "ready" — a ready index with no usable LLM is not "ready" to the user. The
 * connection check uses the real snapshot fields `state` + `gatewayUnreachable` (SOL RC4), and an
 * exhaustive tail returns `unknown` instead of silently falling through.
 */
export function ragState(snapshot: ConnectSnapshot): RagStateResult {
  const connected = snapshot.state === 'connected' && !snapshot.gatewayUnreachable;
  if (!connected) return lvl('offline', 'rag.level.offline');

  const rag = snapshot.rag;
  if (rag === undefined) return lvl('loading', 'rag.level.checking');
  if (rag.supported === false) return lvl('unsupported', 'rag.level.unsupported');
  if (!rag.enabled) return lvl('disabled', 'rag.level.disabled');

  if (rag.rerankState === 'faulted' || rag.rerankState === 'missing')
    return mk('error', rvT('settings', 'rag.level.reranker', { state: rag.rerankState }));
  if (rag.apiKeyConfigured === false && !hasReadyChatProvider(snapshot))
    return lvl('error', 'rag.level.apiKeyMissing');
  if (rag.indexState === 'faulted') return lvl('error', 'rag.level.indexFaulted');

  if (rag.indexState === 'loading' || rag.indexState === 'indexing' || rag.rerankState === 'loading')
    return lvl('busy', rag.indexState === 'indexing' ? 'rag.level.indexing' : 'rag.level.loading');

  if (rag.indexState === 'uninitialized') return lvl('idle', 'rag.level.notInitialized');
  if (rag.indexState === 'empty') return lvl('empty', 'rag.level.noDocuments');
  if (rag.indexState === 'ready') return lvl('ready', 'rag.level.ready');

  return lvl('unknown', 'rag.level.unknown');
}
