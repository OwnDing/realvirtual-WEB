// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { defaultLook, parseLook, parseTemplates, STYLE_IDS } from '../src/core/presentation/look';
import { mergeProjectLook, readProjectLook } from '../src/core/presentation/project-look-data';
describe('presentation versioned project settings', () => {
  it('validates every shipped style and refuses invalid numeric values and versions', () => {
    for (const id of STYLE_IDS) expect(parseLook(defaultLook(id)).style).toBe(id);
    for (const patch of [{ brightness: NaN }, { reflection: 2 }, { background: -1 }, { schemaVersion: 2 }, { style: 'unknown' }, { ground: 1 }]) expect(() => parseLook({ ...defaultLook(), ...patch })).toThrow();
  });
  it('preserves unrelated settings and future extensions while selecting a document profile', () => {
    const raw = { $schema: 'rv-project-config/1.0', future: { foo: true }, defaults: { locale: 'en-US' }, modelProfiles: { machine: { future: 12, presentation: defaultLook('dark') } } };
    const updated = mergeProjectLook(raw, defaultLook('product'), null);
    expect(updated.future).toEqual({ foo: true }); expect(updated.modelProfiles).toEqual(raw.modelProfiles);
    expect(readProjectLook(updated, 'machine')?.style).toBe('dark');
    expect(readProjectLook(updated, 'other')?.style).toBe('product'); expect(raw).not.toHaveProperty('presentation');
    const profileUpdate = mergeProjectLook(updated, defaultLook('technical'), 'machine');
    expect((profileUpdate.modelProfiles as typeof raw.modelProfiles).machine.future).toBe(12);
    expect(readProjectLook(profileUpdate, 'machine')?.style).toBe('technical');
  });
  it('round-trips old bundles without losing interface or unknown fields and refuses future documents', () => {
    const raw = { $schema: 'rv-settings-bundle/1.0', settings: { visual: { fov: 52 }, future: 'preserved' } };
    const next = mergeProjectLook(raw, defaultLook('warehouse'), null);
    expect(readProjectLook(next, null)?.style).toBe('warehouse');
    expect(next.settings).toMatchObject(raw.settings);
    expect(() => mergeProjectLook({ $schema: 'future' }, defaultLook(), null)).toThrow();
    expect(() => mergeProjectLook({ $schema: 'rv-project-config/1.0', presentation: { schemaVersion: 99 } }, defaultLook(), null)).toThrow();
  });
  it('bounds template collections and rejects duplicate identity independently from display names', () => {
    const t = { id: 'stable', name: '中文模板', look: defaultLook() };
    expect(parseTemplates({ schemaVersion: 1, templates: [t] })[0].name).toBe(t.name);
    expect(() => parseTemplates({ schemaVersion: 1, templates: [t, t] })).toThrow();
    expect(() => parseTemplates({ schemaVersion: 1, templates: [{ ...t, name: ' ' }] })).toThrow();
    expect(() => parseTemplates({ schemaVersion: 2, templates: [] })).toThrow();
  });
});
