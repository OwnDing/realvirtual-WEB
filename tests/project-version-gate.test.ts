// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { RV_PROJECT_SCHEMA_VERSION } from '../src/core/project/rv-project-types';
import { BrowserBackend, browserManifestKey } from '../src/core/project/backends/browser-backend';
import { migrateProjectDocuments } from '../src/core/project/rv-project-documents-migration';
import released6316 from './fixtures/upgrade/6.3.16/project-v1.json';

describe('project schema support window', () => {
  beforeEach(() => localStorage.clear());

  it('migrates the released 6.3.16 fixture and preserves unknown fields', async () => {
    const result = await migrateProjectDocuments(released6316);
    expect(result.outcome).toBe('migrated');
    expect(result.project.schemaVersion).toBe(2);
    expect(result.project.futureTopLevelSection).toEqual({ preserve: true });
    expect(result.project.documents?.[0]).toMatchObject({
      id: 'scn_6316_fixture', futureEntryField: 'preserve-me', section: 'scenes',
    });
  });

  it('accepts an additive newer revision and preserves unknown fields', async () => {
    const projectId = 'prj_future_fixture';
    localStorage.setItem(browserManifestKey(projectId), JSON.stringify({
      schemaVersion: RV_PROJECT_SCHEMA_VERSION + 1,
      id: projectId,
      name: 'Future project',
      documents: [],
      future: { kept: true },
    }));
    const backend = new BrowserBackend(projectId, { requestPersistence: false });
    await expect(backend.readManifest()).resolves.toMatchObject({
      schemaVersion: RV_PROJECT_SCHEMA_VERSION + 1,
      future: { kept: true },
    });
  });
});
