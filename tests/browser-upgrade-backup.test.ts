// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/upgrade/6.3.16/browser-storage.json';
import {
  collectUpgradeStorageItems,
  createBrowserUpgradeBackup,
  listBrowserUpgradeBackups,
  restoreBrowserUpgradeBackup,
  verifyBrowserUpgradeBackup,
} from '../src/core/upgrade/rv-browser-upgrade-backup';

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('rv-upgrade-backups');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // A just-completed transaction may report `blocked` before its connection's
    // close event is observed; keep waiting for the eventual success event.
    request.onblocked = () => {};
  });
}

describe('browser upgrade backup', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDb();
    for (const item of fixture.items) localStorage.setItem(item.key, item.value);
  });

  afterEach(async () => {
    localStorage.clear();
    await deleteDb();
  });

  it('stores and verifies the released 6.3.16 browser fixture', async () => {
    const backup = await createBrowserUpgradeBackup({
      migrationId: 'workspace-scenes-v1',
      sourceVersion: fixture.release,
      targetVersion: '6.4.0',
      now: () => '2026-08-31T00:00:00.000Z',
    });

    expect(await verifyBrowserUpgradeBackup(backup)).toBe(true);
    expect(backup.items).toEqual(collectUpgradeStorageItems());
    expect((await listBrowserUpgradeBackups()).map(item => item.id)).toContain(backup.id);
  });

  it('restores exact migration-owned keys and first backs up the current state', async () => {
    const backup = await createBrowserUpgradeBackup({
      migrationId: 'workspace-scenes-v1', sourceVersion: fixture.release, targetVersion: '6.4.0',
    });
    localStorage.removeItem('rv-scenes/scn_6316_fixture');
    localStorage.setItem('rv-doc-alias/scn_6316_fixture', '{"documentId":"doc_new","at":"now"}');
    localStorage.setItem('unrelated-customer-key', 'keep');
    localStorage.setItem('rv-project/browser/customer-project', '{"name":"keep this project"}');
    localStorage.setItem('rv-scene-owner/folder-cache', '{"projectId":"keep-owner"}');

    await restoreBrowserUpgradeBackup(backup);

    expect(localStorage.getItem('rv-scenes/scn_6316_fixture')).toBe(fixture.items[1].value);
    expect(localStorage.getItem('rv-doc-alias/scn_6316_fixture')).toBeNull();
    expect(localStorage.getItem('unrelated-customer-key')).toBe('keep');
    expect(localStorage.getItem('rv-project/browser/customer-project')).toBe('{"name":"keep this project"}');
    expect(localStorage.getItem('rv-scene-owner/folder-cache')).toBe('{"projectId":"keep-owner"}');
    expect((await listBrowserUpgradeBackups()).some(item => item.migrationId.startsWith('pre-restore:'))).toBe(true);
  });

  it('rejects a modified backup before changing browser data', async () => {
    const backup = await createBrowserUpgradeBackup({
      migrationId: 'workspace-scenes-v1', sourceVersion: fixture.release, targetVersion: '6.4.0',
    });
    const tampered = { ...backup, items: backup.items.map((item, index) => index ? item : { ...item, value: 'tampered' }) };
    await expect(restoreBrowserUpgradeBackup(tampered)).rejects.toThrow(/integrity/);
    expect(localStorage.getItem(fixture.items[0].key)).toBe(fixture.items[0].value);
  });

  it('creates a pre-restore safety point even when the current owned state is empty', async () => {
    const backup = await createBrowserUpgradeBackup({
      migrationId: 'workspace-scenes-v1', sourceVersion: fixture.release, targetVersion: '6.4.0',
    });
    localStorage.clear();

    await restoreBrowserUpgradeBackup(backup);

    const safety = (await listBrowserUpgradeBackups()).find(item => item.migrationId === `pre-restore:${backup.id}`);
    expect(safety?.items).toEqual([]);
  });
});
