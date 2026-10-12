// SPDX-License-Identifier: AGPL-3.0-only
import { readProjectLook, mergeProjectLook } from './project-look-data';
import { getProjectStore } from '../project/project-store';
import { getOpenDocumentBase } from '../editor/active-asset-store';
import { revisionOfBytes } from '../project/rv-scene-record';
import { PresentationError, type PresentationLook } from './look';
import { isTabLocked } from '../rv-app-config';
import { getLicenseSnapshot } from '../licensing/rv-lic-store';
export function currentProfileId(): string | null {
  const base = getOpenDocumentBase();
  return base?.kind === 'document' ? base.documentId : null;
}
let saving = false;
export async function saveProjectLook(look: PresentationLook): Promise<void> {
  if (saving) throw new PresentationError('busy');
  if (isTabLocked('visual')) throw new PresentationError('locked');
  if (!getLicenseSnapshot().evaluation.canSave) throw new PresentationError('readonly');
  const store = getProjectStore(), project = store.getProject(), backend = store.getBackend();
  if (!project || !backend?.writable || !backend.isActive) throw new PresentationError('readonly');
  saving = true;
  try {
    const path = project.settingsRef?.ref ?? 'settings/project-settings.json';
    const bytes = await backend.readBlobBytes(path);
    if (bytes && bytes.byteLength > 1024 * 1024) throw new PresentationError('size');
    const raw: unknown = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : await backend.readSettings(project.settingsRef?.ref);
    // The main action saves the project-wide default. Profiles remain intact.
    const merged = mergeProjectLook(raw, look, null);
    const revision = bytes ? await revisionOfBytes(bytes) : null;
    if (store.getBackend() !== backend || store.getProject()?.id !== project.id) throw new PresentationError('changed');
    await backend.writeBlob(path, new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' }), { expectedRevision: revision });
    if (store.getBackend() !== backend || store.getProject()?.id !== project.id) throw new PresentationError('changed');
    if (!project.settingsRef) await store.applyManifestDelta(current => {
      if (current.id !== project.id || store.getBackend() !== backend) throw new PresentationError('changed');
      return { ...current, settingsRef: { ref: path } };
    });
    if (store.getBackend() !== backend || store.getProject()?.id !== project.id) throw new PresentationError('changed');
  } finally { saving = false; }
}
export async function loadProjectLook(profileId: string | null): Promise<PresentationLook | null> {
  const store = getProjectStore(), project = store.getProject(), backend = store.getBackend();
  if (!project || !backend) return null;
  const bytes = project.settingsRef ? await backend.readBlobBytes(project.settingsRef.ref) : null;
  if (bytes && bytes.byteLength > 1024 * 1024) throw new PresentationError('size');
  const raw: unknown = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : await backend.readSettings(project.settingsRef?.ref);
  if (store.getBackend() !== backend || store.getProject()?.id !== project.id) throw new PresentationError('changed');
  return readProjectLook(raw, profileId);
}
