// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { mergeUnifiedConfigValues, parseUnifiedConfigValues, type UnifiedConfigValues } from './unified-config';

export const USER_CONFIG_GLOBAL_KEY = 'rv-config/user/v1/global';
export const USER_CONFIG_SCOPE_PREFIX = 'rv-config/user/v1/scope/';
const LEGACY_LOCALE_KEY = 'rv-language';
const LEGACY_MODE_KEY = 'rv-active-mode';
const LEGACY_PLUGIN_PREFIX = 'rv-plugin-overrides/';

interface UserConfigRecord {
  v: 1;
  preferences: UnifiedConfigValues;
}

const memory = new Map<string, UserConfigRecord>();

function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function keyForScope(scope: string | null): string {
  return scope === null ? USER_CONFIG_GLOBAL_KEY : `${USER_CONFIG_SCOPE_PREFIX}${encodeURIComponent(scope)}`;
}

function readRecord(key: string): UserConfigRecord | null {
  const fallback = memory.get(key) ?? null;
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    // A readable-but-empty store is authoritative (Reset all / refused write).
    // Memory is only the fallback when storage itself cannot be read.
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserConfigRecord> | null;
    if (!parsed || parsed.v !== 1) return null;
    const preferences = parseUnifiedConfigValues(parsed.preferences);
    return preferences ? { v: 1, preferences } : null;
  } catch { return fallback; }
}

function legacyGlobal(): UnifiedConfigValues {
  const result: UnifiedConfigValues = {};
  const store = storage();
  if (!store) return result;
  try {
    const raw = store.getItem(LEGACY_LOCALE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { v?: unknown; locale?: unknown };
      if (parsed.v === 1 && (parsed.locale === 'zh-CN' || parsed.locale === 'en-US')) result.locale = parsed.locale;
    }
    const mode = store.getItem(LEGACY_MODE_KEY);
    if (mode) result.workspace = { default: mode };
  } catch { /* no trusted legacy preferences */ }
  return result;
}

function legacyScope(scope: string): UnifiedConfigValues {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(`${LEGACY_PLUGIN_PREFIX}${scope}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: unknown; disabled?: unknown };
    if (parsed.v !== 1 || !Array.isArray(parsed.disabled)) return {};
    const features: Record<string, boolean> = {};
    for (const id of parsed.disabled) if (typeof id === 'string' && id.length > 0) features[id] = false;
    return Object.keys(features).length > 0 ? { features } : {};
  } catch { return {}; }
}

function ownConfigForWrite(scope: string | null): UnifiedConfigValues {
  const existing = readRecord(keyForScope(scope));
  if (existing) return existing.preferences;
  return scope === null ? legacyGlobal() : legacyScope(scope);
}

/** Read-through migration: new record wins, otherwise legacy keys are projected without writing. */
export function readUserConfig(scope: string | null = null): UnifiedConfigValues {
  const globalRecord = readRecord(USER_CONFIG_GLOBAL_KEY);
  const global = globalRecord?.preferences ?? legacyGlobal();
  if (scope === null) return global;
  const scopedRecord = readRecord(keyForScope(scope));
  const scoped = scopedRecord?.preferences ?? legacyScope(scope);
  return mergeUnifiedConfigValues(global, scoped) ?? {};
}

export function writeUserConfigPatch(scope: string | null, patch: UnifiedConfigValues): void {
  const key = keyForScope(scope);
  const ownCurrent = ownConfigForWrite(scope);
  const preferences = mergeUnifiedConfigValues(ownCurrent, patch) ?? {};
  const record: UserConfigRecord = { v: 1, preferences };
  memory.set(key, record);
  const store = storage();
  if (!store) return;
  try { store.setItem(key, JSON.stringify(record)); } catch { /* memory is the session fallback */ }
}

/** Replace, rather than merge, a scope's feature choices (needed when a switch is turned back on). */
export function replaceUserFeaturePreferences(scope: string, features: Record<string, boolean>): void {
  const key = keyForScope(scope);
  const ownCurrent = ownConfigForWrite(scope);
  const record: UserConfigRecord = { v: 1, preferences: { ...ownCurrent, features: { ...features } } };
  memory.set(key, record);
  const store = storage();
  if (!store) return;
  try { store.setItem(key, JSON.stringify(record)); } catch { /* memory is the session fallback */ }
}

export function clearAllUserFeaturePreferences(): void {
  const store = storage();
  const keys = new Set<string>([...memory.keys()].filter(key => key.startsWith(USER_CONFIG_SCOPE_PREFIX)));
  if (store) {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(USER_CONFIG_SCOPE_PREFIX)) keys.add(key);
      }
    } catch { /* keep memory keys */ }
  }
  for (const key of keys) {
    const scope = decodeURIComponent(key.slice(USER_CONFIG_SCOPE_PREFIX.length));
    replaceUserFeaturePreferences(scope, {});
  }
}

export function clearUserConfigScope(scope: string | null): void {
  const key = keyForScope(scope);
  memory.delete(key);
  try { storage()?.removeItem(key); } catch { /* no persisted record */ }
}

export function resetUserConfigMemoryForTests(): void {
  memory.clear();
}
