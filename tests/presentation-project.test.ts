// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeDocumentProject, type FakeDocumentProject } from './helpers/fake-document-project';
import { defaultLook } from '../src/core/presentation/look';
import { loadProjectLook, saveProjectLook } from '../src/core/presentation/project-look';
import { setAppConfig } from '../src/core/rv-app-config';
import { BrowserBackend } from '../src/core/project/backends/browser-backend';
import { setSessionLook } from '../src/core/presentation/session-look';
import { loadVisualSettings, saveVisualSettings } from '../src/core/hmi/visual-settings-store';
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
