// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeDocumentProject, type FakeDocumentProject } from './helpers/fake-document-project';
import { defaultLook } from '../src/core/presentation/look';
import { loadProjectLook, saveProjectLook } from '../src/core/presentation/project-look';
import { setAppConfig } from '../src/core/rv-app-config';
import { BrowserBackend } from '../src/core/project/backends/browser-backend';
import { setSessionLook } from '../src/core/presentation/session-look';
import { loadVisualSettings, saveVisualSettings } from '../src/core/hmi/visual-settings-store';
import { getProjectStore } from '../src/core/project/project-store';
import { FakeDir, asDirHandle } from './helpers/fake-fs-handles';
let f: FakeDocumentProject | null = null;
afterEach(() => { f?.restore(); f = null; setAppConfig({}); setSessionLook(null); vi.restoreAllMocks(); localStorage.clear(); });
describe('presentation project persistence', () => {
  it('saves a project default, preserves unrelated fields and loads it without writing user preferences', async () => {
    const path = 'settings/project-settings.json'; f = installFakeDocumentProject();
    f.writeForeign(path, JSON.stringify({ $schema: 'rv-project-config/1.0', defaults: { locale: 'en-US' }, presentation: { ...defaultLook(), future: 42 } }));
    localStorage.setItem('rv-visual-settings', '{"fov":52}');
    await saveProjectLook(defaultLook('dark'));
    expect(f.project().settingsRef?.ref).toBe(path); expect(f.writes[0].expected).toMatch(/^[a-f0-9]{64}$/);
    expect(await loadProjectLook(null)).toMatchObject({ style: 'dark', future: 42 });
    const raw = JSON.parse(new TextDecoder().decode(f.files.get(path))); expect(raw.defaults.locale).toBe('en-US');
    expect(localStorage.getItem('rv-visual-settings')).toBe('{"fov":52}');
  });
  it('refuses a competing write without retrying and rejects locked or inactive targets', async () => {
    const path = 'settings/project-settings.json'; f = installFakeDocumentProject();
    const originalWrite = f.backend.writeBlob.bind(f.backend), foreign = '{"$schema":"rv-project-config/1.0","future":"someone else"}';
    vi.spyOn(f.backend, 'writeBlob').mockImplementation(async (...args) => { f!.writeForeign(path, foreign); return originalWrite(...args); });
    await expect(saveProjectLook(defaultLook())).rejects.toThrow(); expect(f.writes).toHaveLength(1);
    expect(new TextDecoder().decode(f.files.get(path))).toBe(foreign); expect(f.project().settingsRef).toBeUndefined();
    setAppConfig({ lockedTabs: ['visual'] }); await expect(saveProjectLook(defaultLook())).rejects.toMatchObject({ code: 'locked' });
    expect(f.writes).toHaveLength(1);
  });
  it('does not write when the project switches during a read', async () => {
    f = installFakeDocumentProject(); const first = f;
    vi.spyOn(first.backend, 'readBlobBytes').mockImplementation(async () => { first.restore(); return null; });
    await expect(saveProjectLook(defaultLook())).rejects.toMatchObject({ code: 'changed' });
    expect(first.writes).toHaveLength(0);
  });
  it.each([false, true])('keeps a concurrently installed settings reference (CAS retry: %s)', async retry => {
    f = installFakeDocumentProject();
    const root = new FakeDir('presentation-race'), store = getProjectStore();
    const foreignPath = 'settings/other-tab.json', foreignBytes = JSON.stringify({ $schema: 'rv-project-config/1.0', presentation: defaultLook('warehouse') });
    const foreign = { ...f.project(), settingsRef: { ref: foreignPath } };
    f.writeForeign(foreignPath, foreignBytes);
    root.seedText('project.json', JSON.stringify(f.project()));
    const state = store as unknown as { _dir: FileSystemDirectoryHandle | null }, previousDir = state._dir;
    state._dir = asDirHandle(root);
    const originalApply = store.applyManifestDelta.bind(store), originalWrite = f.backend.writeBlob.bind(f.backend);
    let attempts = 0;
    vi.spyOn(f.backend, 'writeBlob').mockImplementation(async (...args) => {
      const result = await originalWrite(...args);
      if (!retry) root.seedText('project.json', JSON.stringify(foreign));
      return result;
    });
    vi.spyOn(store, 'applyManifestDelta').mockImplementation((apply, opts) => originalApply(current => {
      attempts++;
      if (retry && attempts === 1) root.seedText('project.json', JSON.stringify(foreign));
      return apply(current);
    }, opts));
    try {
      await expect(saveProjectLook(defaultLook('dark'))).rejects.toMatchObject({ code: 'changed' });
      expect(attempts).toBe(retry ? 2 : 1);
      expect(JSON.parse((await root.readText('project.json'))!)).toEqual(foreign);
      expect(new TextDecoder().decode(f.files.get(foreignPath))).toBe(foreignBytes);
      expect(f.writes).toHaveLength(1);
      expect(f.project().settingsRef).toBeUndefined();
    } finally { state._dir = previousDir; }
  });
  it('preserves a concurrently installed reference to the same path, including future fields', async () => {
    f = installFakeDocumentProject();
    const settingsRef = { ref: 'settings/project-settings.json', futureReferenceField: 'keep' };
    vi.spyOn(f.backend, 'readManifest').mockResolvedValue({ ...f.project(), settingsRef });
    await saveProjectLook(defaultLook('dark'));
    expect(f.project().settingsRef).toEqual(settingsRef);
    expect(await loadProjectLook(null)).toMatchObject({ style: 'dark' });
  });
  it('real browser backend reads saved settings across backend recreation and keeps legacy inline settings', async () => {
    const id = 'prj_presentation_test', path = 'settings/project-settings.json';
    const backend = new BrowserBackend(id, { requestPersistence: false }); await backend.activate();
    try {
      const manifest = await backend.readManifest();
      await backend.writeManifest({ ...manifest!, settings: { $schema: 'rv-settings-bundle/1.0', settings: { old: true } } });
      expect(await backend.readSettings()).toMatchObject({ settings: { old: true } });
      const config = { $schema: 'rv-project-config/1.0', presentation: defaultLook('product') };
      await backend.writeBlob(path, new Blob([JSON.stringify(config)]), { expectedRevision: null });
      await backend.writeManifest({ ...(await backend.readManifest())!, settingsRef: { ref: path } });
      await backend.deactivate();
      const reopened = new BrowserBackend(id, { requestPersistence: false });
      expect(await reopened.readSettings()).toEqual(config);
    } finally { await backend.activate(); await backend.deleteBlob(path); await backend.deactivate(); }
  });
  it('session looks respect deployment locks and advanced edits relinquish the preset', () => {
    const base = loadVisualSettings(); saveVisualSettings(base); const bytes = localStorage.getItem('rv-visual-settings');
    setSessionLook(defaultLook('technical')); expect(loadVisualSettings().renderMode).toBe('toon');
    expect(localStorage.getItem('rv-visual-settings')).toBe(bytes);
    const navigation = loadVisualSettings(); navigation.orbitZoomSpeed = 2;
    saveVisualSettings(navigation, { preservePresentation: true });
    expect(loadVisualSettings().renderMode).toBe('toon');
    expect(JSON.parse(localStorage.getItem('rv-visual-settings')!).renderMode).toBe(base.renderMode);
    expect(loadVisualSettings().orbitZoomSpeed).toBe(2);
    setAppConfig({ lockSettings: true }); expect(loadVisualSettings().renderMode).toBe(base.renderMode);
    setAppConfig({}); saveVisualSettings(base); expect(loadVisualSettings().renderMode).toBe(base.renderMode);
  });
});
