// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveDocument: vi.fn(),
  rescanDocuments: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../src/core/editor/rv-save-document', () => ({ saveDocument: mocks.saveDocument }));
vi.mock('../src/core/project/project-store', () => ({
  getProjectStore: () => ({ rescanDocuments: mocks.rescanDocuments }),
}));
vi.mock('../src/core/library/library-source-registry', () => ({
  listLibrarySources: () => [{ providerId: 'project', source: { refresh: mocks.refresh } }],
}));
vi.mock('../src/core/library/project-library-provider', () => ({
  PROJECT_LIBRARY_PROVIDER_ID: 'project',
}));

import { saveAssetAs } from '../src/plugins/smart-asset-editor/save-flow';

beforeEach(() => vi.clearAllMocks());

describe('smart asset save orchestration', () => {
  it('uses the unified writer and refreshes documents and Project Library after success', async () => {
    mocks.saveDocument.mockResolvedValue({
      kind: 'saved',
      base: { kind: 'document', documentId: 'doc', path: 'library/Custom/Pump.glb', name: 'Pump' },
      relPath: 'library/Custom/Pump.glb',
      copied: false,
    });
    const doc = { name: 'Untitled', renameDocument: vi.fn() };
    const ctx = { viewer: {}, doc } as never;
    const result = await saveAssetAs(ctx, 'Pump');

    expect(doc.renameDocument).toHaveBeenCalledWith('Pump');
    expect(mocks.saveDocument).toHaveBeenCalledOnce();
    expect(mocks.rescanDocuments).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ kind: 'saved', fileName: 'Pump.glb' });
  });

  it('does not refresh catalogs when the core writer reports a conflict', async () => {
    mocks.saveDocument.mockResolvedValue({ kind: 'conflict', message: 'changed elsewhere' });
    const ctx = { viewer: {}, doc: { name: 'Pump', renameDocument: vi.fn() } } as never;
    expect(await saveAssetAs(ctx, 'Pump')).toEqual({ kind: 'conflict', message: 'changed elsewhere' });
    expect(mocks.rescanDocuments).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
