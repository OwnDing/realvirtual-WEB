// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  MIGRATION_CATALOG_VERSION,
  assertValidMigrationCatalog,
  migrationCatalog,
} from '../src/core/upgrade/rv-migration-registry';

describe('migration registry', () => {
  it('has stable unique ids and an explicit recovery posture for every migration', () => {
    const catalog = migrationCatalog();
    expect(MIGRATION_CATALOG_VERSION).toBe(1);
    expect(() => assertValidMigrationCatalog(catalog)).not.toThrow();
    expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
    expect(catalog.find(item => item.id === 'workspace-scenes-v1')).toMatchObject({
      backup: 'verified-browser-backup', rollback: 'automatic-restore',
    });
  });

  it('rejects duplicate ids', () => {
    const first = migrationCatalog()[0];
    expect(() => assertValidMigrationCatalog([first, first])).toThrow(/Duplicate/);
  });
});
