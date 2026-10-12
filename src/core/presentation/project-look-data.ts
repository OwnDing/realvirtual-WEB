// SPDX-License-Identifier: AGPL-3.0-only
import { isRecord, parseLook, PresentationError, type PresentationLook } from './look';
export function readProjectLook(raw: unknown, profileId: string | null): PresentationLook | null {
  if (!isRecord(raw)) return null;
  let value: unknown;
  if (raw.$schema === 'rv-project-config/1.0') {
    const profile = profileId && isRecord(raw.modelProfiles) ? raw.modelProfiles[profileId] : null;
    value = isRecord(profile) && profile.presentation !== undefined ? profile.presentation : raw.presentation;
  } else if (raw.$schema === 'rv-settings-bundle/1.0' && isRecord(raw.settings)) value = raw.settings.presentation;
  else return null;
  return value === undefined ? null : parseLook(value);
}
/** Preserve all unrelated fields, including future extension fields. */
export function mergeProjectLook(raw: unknown, look: PresentationLook, profileId: string | null): Record<string, unknown> {
  const base = raw == null ? { $schema: 'rv-project-config/1.0' } : structuredClone(raw);
  if (!isRecord(base)) throw new PresentationError('invalid');
  const valid = parseLook(look);
  readProjectLook(base, profileId); // refuse overwriting unknown/invalid existing versions
  if (base.$schema === 'rv-settings-bundle/1.0') {
    if (profileId) throw new PresentationError('invalid'); // legacy bundles only have project scope
    const settings = isRecord(base.settings) ? base.settings : {};
    base.settings = { ...settings, presentation: { ...(isRecord(settings.presentation) ? settings.presentation : {}), ...valid } };
  } else if (base.$schema === 'rv-project-config/1.0') {
    if (profileId) {
      const profiles = isRecord(base.modelProfiles) ? base.modelProfiles : {};
      const profile = isRecord(profiles[profileId]) ? profiles[profileId] : {};
      base.modelProfiles = { ...profiles, [profileId]: { ...profile, presentation: { ...(isRecord(profile.presentation) ? profile.presentation : {}), ...valid } } };
    } else base.presentation = { ...(isRecord(base.presentation) ? base.presentation : {}), ...valid };
  } else throw new PresentationError('invalid');
  return base;
}
