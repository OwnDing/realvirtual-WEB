// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Stable inventory used by support, tests and upgrade UI; IDs must never be reused. */
export interface MigrationRegistration {
  id: string;
  domain: 'browser-origin' | 'project-manifest' | 'workfolder';
  execution: 'boot' | 'read' | 'manual';
  backup: 'verified-browser-backup' | 'project-bak-or-git' | 'source-retained';
  rollback: 'automatic-restore' | 'marker-reversal' | 'source-retained';
  implementation: string;
}

export const MIGRATION_CATALOG_VERSION = 1;

const BUILTIN_MIGRATIONS: readonly MigrationRegistration[] = Object.freeze([
  {
    id: 'project-loose-scenes-v1',
    domain: 'browser-origin', execution: 'boot', backup: 'source-retained', rollback: 'marker-reversal',
    implementation: 'src/core/project/rv-project-migration.ts',
  },
  {
    id: 'workspace-scenes-v1',
    domain: 'browser-origin', execution: 'boot', backup: 'verified-browser-backup', rollback: 'automatic-restore',
    implementation: 'src/core/project/rv-workspace-migration.ts',
  },
  {
    id: 'project-documents-v2',
    domain: 'project-manifest', execution: 'read', backup: 'project-bak-or-git', rollback: 'marker-reversal',
    implementation: 'src/core/project/rv-project-documents-migration.ts',
  },
  {
    id: 'project-script-refs-v1',
    domain: 'project-manifest', execution: 'read', backup: 'project-bak-or-git', rollback: 'marker-reversal',
    implementation: 'src/core/project/rv-project-refs-migration.ts',
  },
  {
    id: 'project-connect-refs-v1',
    domain: 'project-manifest', execution: 'read', backup: 'project-bak-or-git', rollback: 'marker-reversal',
    implementation: 'src/core/project/rv-project-connect-ref-migration.ts',
  },
  {
    id: 'workfolder-into-project-v1',
    domain: 'workfolder', execution: 'manual', backup: 'source-retained', rollback: 'source-retained',
    implementation: 'src/core/project/rv-workfolder-migration.ts',
  },
]);

export function migrationCatalog(): readonly MigrationRegistration[] {
  return BUILTIN_MIGRATIONS;
}

export function assertValidMigrationCatalog(catalog: readonly MigrationRegistration[] = BUILTIN_MIGRATIONS): void {
  const ids = new Set<string>();
  for (const entry of catalog) {
    if (!/^[a-z][a-z0-9-]+-v\d+$/.test(entry.id)) throw new Error(`Invalid migration id: ${entry.id}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate migration id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.execution !== 'manual' && !entry.backup) throw new Error(`Automatic migration lacks backup policy: ${entry.id}`);
  }
}

assertValidMigrationCatalog();
