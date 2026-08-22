// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Public orchestration around the core's single document writer. */

import type { ActiveAssetContext } from '../../core/editor/active-asset-store';
import { setOpenDocumentBase } from '../../core/editor/active-asset-store';
import { saveDocument, type SaveDocumentResult } from '../../core/editor/rv-save-document';
import { getProjectStore } from '../../core/project/project-store';
import {
  listLibrarySources,
} from '../../core/library/library-source-registry';
import { PROJECT_LIBRARY_PROVIDER_ID } from '../../core/library/project-library-provider';

export type SmartAssetSaveOutcome = SaveDocumentResult & {
  /** Compatibility fields consumed by the existing MCP save response. */
  fileName?: string;
};

/** Save under an explicit name and make the written document visible immediately. */
export async function saveAssetAs(
  ctx: ActiveAssetContext,
  name: string,
  forceNamePrompt = false,
): Promise<SmartAssetSaveOutcome> {
  const cleanName = name.trim();
  if (!cleanName) return { kind: 'cancelled' };
  if (!forceNamePrompt && ctx.doc.name !== cleanName) ctx.doc.renameDocument(cleanName);

  const outcome = await saveDocument(ctx.viewer, ctx.doc, {
    forceNamePrompt,
    requestName: async () => cleanName,
  });
  if (outcome.kind !== 'saved') return outcome;

  setOpenDocumentBase(outcome.base);
  const projectStore = getProjectStore();
  await projectStore.rescanDocuments();
  const projectSource = listLibrarySources().find(
    item => item.providerId === PROJECT_LIBRARY_PROVIDER_ID,
  );
  await projectSource?.source.refresh?.();
  return {
    ...outcome,
    fileName: outcome.relPath.split('/').pop() ?? `${cleanName}.glb`,
  };
}
