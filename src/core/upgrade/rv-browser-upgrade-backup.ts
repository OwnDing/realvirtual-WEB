// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { idbGet, idbPut, idbRequest, openIdb } from '../persistence/rv-idb-utils';
import { LS_KEY_INDEX } from '../hmi/scene/rv-scene-storage';
import { browserBlobIndexKey, browserManifestKey } from '../project/backends/browser-backend';
import { WORKSPACE_DEFAULT_PROJECT_ID } from '../project/rv-workspace-default';

export const BROWSER_UPGRADE_BACKUP_SCHEMA_VERSION = 1;
export const WORKSPACE_SCENES_MIGRATION_ID = 'workspace-scenes-v1';
export const UPGRADE_BLOCKED_KEY = 'rv-upgrade/blocked';

const DB_NAME = 'rv-upgrade-backups';
const DB_VERSION = 1;
const STORE = 'backups';
const PRODUCT = 'xyvirtual-browser-upgrade-backup';

const EXACT_KEYS = new Set([
  LS_KEY_INDEX,
  'rv-migration/scenes-v1',
  browserManifestKey(WORKSPACE_DEFAULT_PROJECT_ID),
  browserBlobIndexKey(WORKSPACE_DEFAULT_PROJECT_ID),
]);
const OWNED_PREFIXES = [
  'rv-scenes/',
  'rv-scene-glb/',
  'rv-scenes-retired/',
  'rv-doc-alias/',
] as const;

export interface BrowserUpgradeBackupItem {
  key: string;
  value: string;
}

export interface BrowserUpgradeBackup {
  schemaVersion: 1;
  product: typeof PRODUCT;
  id: string;
  migrationId: string;
  sourceVersion: string;
  targetVersion: string;
  createdAt: string;
  origin: string;
  items: BrowserUpgradeBackupItem[];
  sha256: string;
}

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

function isOwnedKey(key: string): boolean {
  return EXACT_KEYS.has(key) || OWNED_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function collectUpgradeStorageItems(storage: StorageLike = localStorage): BrowserUpgradeBackupItem[] {
  const items: BrowserUpgradeBackupItem[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !isOwnedKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) items.push({ key, value });
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

function payloadOf(backup: Omit<BrowserUpgradeBackup, 'sha256'>): string {
  return JSON.stringify(backup);
}

async function checksumOf(backup: Omit<BrowserUpgradeBackup, 'sha256'>): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('SHA-256 is unavailable; a verified upgrade backup cannot be created outside a secure context.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadOf(backup)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function newBackupId(migrationId: string): string {
  const nonce = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${migrationId}:${nonce}`;
}

async function openBackupDb(): Promise<IDBDatabase> {
  return openIdb(DB_NAME, DB_VERSION, [STORE]);
}

export async function createBrowserUpgradeBackup(options: {
  migrationId: string;
  sourceVersion: string;
  targetVersion: string;
  storage?: StorageLike;
  now?: () => string;
  origin?: string;
}): Promise<BrowserUpgradeBackup> {
  const storage = options.storage ?? localStorage;
  const withoutChecksum: Omit<BrowserUpgradeBackup, 'sha256'> = {
    schemaVersion: BROWSER_UPGRADE_BACKUP_SCHEMA_VERSION,
    product: PRODUCT,
    id: newBackupId(options.migrationId),
    migrationId: options.migrationId,
    sourceVersion: options.sourceVersion,
    targetVersion: options.targetVersion,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
    origin: options.origin ?? (typeof location !== 'undefined' ? location.origin : 'test://local'),
    items: collectUpgradeStorageItems(storage),
  };
  const backup: BrowserUpgradeBackup = { ...withoutChecksum, sha256: await checksumOf(withoutChecksum) };
  const db = await openBackupDb();
  try {
    await idbPut(db, STORE, backup.id, backup);
    const stored = await idbGet<BrowserUpgradeBackup>(db, STORE, backup.id);
    if (!stored || !await verifyBrowserUpgradeBackup(stored)) {
      throw new Error('Browser upgrade backup could not be verified after writing.');
    }
  } finally {
    db.close();
  }
  return backup;
}

export async function verifyBrowserUpgradeBackup(backup: BrowserUpgradeBackup): Promise<boolean> {
  if (!backup || backup.schemaVersion !== 1 || backup.product !== PRODUCT || !Array.isArray(backup.items) ||
    typeof backup.id !== 'string' || !backup.id || typeof backup.migrationId !== 'string' || !backup.migrationId ||
    typeof backup.sourceVersion !== 'string' || typeof backup.targetVersion !== 'string' ||
    typeof backup.createdAt !== 'string' || typeof backup.origin !== 'string' ||
    typeof backup.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(backup.sha256)) return false;
  let previous = '';
  for (const item of backup.items) {
    if (!item || typeof item.key !== 'string' || typeof item.value !== 'string' || !isOwnedKey(item.key)) return false;
    if (previous && item.key.localeCompare(previous) <= 0) return false;
    previous = item.key;
  }
  const { sha256: _checksum, ...payload } = backup;
  return backup.sha256 === await checksumOf(payload);
}

export async function listBrowserUpgradeBackups(): Promise<BrowserUpgradeBackup[]> {
  const db = await openBackupDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const all = await idbRequest<BrowserUpgradeBackup[]>(
      tx.objectStore(STORE).getAll() as IDBRequest<BrowserUpgradeBackup[]>,
    );
    for (const backup of all ?? []) {
      if (!await verifyBrowserUpgradeBackup(backup)) throw new Error('A stored browser upgrade backup failed integrity verification.');
    }
    return (all ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

function sameStorageItems(left: BrowserUpgradeBackupItem[], right: BrowserUpgradeBackupItem[]): boolean {
  return left.length === right.length && left.every((item, index) =>
    item.key === right[index]?.key && item.value === right[index]?.value,
  );
}

/** Reuse only an exact source snapshot; otherwise create a fresh verified backup. */
export async function ensureBrowserUpgradeBackup(options: {
  migrationId: string;
  sourceVersion: string;
  targetVersion: string;
}): Promise<BrowserUpgradeBackup> {
  try {
    const currentItems = collectUpgradeStorageItems();
    const currentOrigin = typeof location !== 'undefined' ? location.origin : 'test://local';
    const existing = (await listBrowserUpgradeBackups()).find(backup =>
      backup.migrationId === options.migrationId &&
      backup.sourceVersion === options.sourceVersion &&
      backup.targetVersion === options.targetVersion &&
      backup.origin === currentOrigin &&
      sameStorageItems(backup.items, currentItems),
    );
    if (existing && await verifyBrowserUpgradeBackup(existing)) {
      localStorage.removeItem(UPGRADE_BLOCKED_KEY);
      return existing;
    }
    const created = await createBrowserUpgradeBackup(options);
    localStorage.removeItem(UPGRADE_BLOCKED_KEY);
    return created;
  } catch (error) {
    try {
      localStorage.setItem(UPGRADE_BLOCKED_KEY, JSON.stringify({
        migrationId: options.migrationId,
        targetVersion: options.targetVersion,
        at: new Date().toISOString(),
        reason: error instanceof Error ? error.message : String(error),
      }));
    } catch { /* diagnostics are best effort; the migration remains blocked */ }
    throw error;
  }
}

export async function restoreBrowserUpgradeBackup(
  backup: BrowserUpgradeBackup,
  storage: StorageLike = localStorage,
): Promise<void> {
  if (!await verifyBrowserUpgradeBackup(backup)) throw new Error('Backup integrity verification failed.');
  if (typeof location !== 'undefined' && backup.origin !== location.origin) {
    throw new Error(`Backup belongs to a different origin: ${backup.origin}`);
  }
  await createBrowserUpgradeBackup({
    migrationId: `pre-restore:${backup.id}`,
    sourceVersion: backup.targetVersion,
    targetVersion: backup.sourceVersion,
    storage,
  });

  // Write the recoverable source state first. Only after every write succeeds do
  // we remove migration-owned keys that were not present in the backup.
  const restoredKeys = new Set(backup.items.map(item => item.key));
  for (const item of backup.items) storage.setItem(item.key, item.value);
  for (const item of collectUpgradeStorageItems(storage)) {
    if (!restoredKeys.has(item.key)) storage.removeItem(item.key);
  }
  try {
    storage.removeItem(UPGRADE_BLOCKED_KEY);
    storage.setItem('rv-upgrade/last-restore', JSON.stringify({ backupId: backup.id, at: new Date().toISOString() }));
  } catch { /* restored data is already committed */ }
}

export function downloadBrowserUpgradeBackup(backup: BrowserUpgradeBackup): void {
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `xyvirtual-upgrade-backup-${backup.createdAt.replaceAll(':', '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
