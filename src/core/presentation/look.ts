// SPDX-License-Identifier: AGPL-3.0-only
import type { VisualSettings } from '../hmi/visual-settings-store';
export const STYLE_IDS = ['showroom', 'product', 'dark', 'warehouse', 'technical'] as const;
export type StyleId = typeof STYLE_IDS[number];
export interface PresentationLook {
  schemaVersion: 1;
  style: StyleId;
  brightness: number;
  background: number;
  shadow: number;
  ground: boolean;
  reflection: number;
  [key: string]: unknown;
}
export class PresentationError extends Error {
  constructor(readonly code: 'invalid' | 'locked' | 'readonly' | 'changed' | 'busy' | 'renderer' | 'size' | 'encoding' | 'material' | 'empty' | 'storage' | 'resources') { super(code); }
}
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseLook(v: unknown): PresentationLook {
  if (!isRecord(v) || v.schemaVersion !== 1 || !STYLE_IDS.includes(v.style as StyleId) || typeof v.ground !== 'boolean') throw new PresentationError('invalid');
  for (const [key, max] of [['brightness', 2], ['background', 2], ['shadow', 3], ['reflection', 1]] as const) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > max) throw new PresentationError('invalid');
  }
  return structuredClone(v) as PresentationLook;
}
export function defaultLook(style: StyleId = 'showroom'): PresentationLook {
  return { schemaVersion: 1, style, brightness: style === 'dark' ? 1.3 : 1,
    background: style === 'dark' ? 0.08 : style === 'product' ? 1.5 : 1,
    shadow: style === 'product' ? 0.6 : 1, ground: true, reflection: style === 'showroom' || style === 'dark' ? 0.15 : 0 };
}
/** Only appearance fields change: navigation, camera, user layout and quality stay owned by their existing stores. */
export function settingsForLook(base: VisualSettings, input: PresentationLook): VisualSettings {
  const look = parseLook(input), settings = structuredClone(base);
  settings.renderMode = look.style === 'technical' ? 'toon' : 'default';
  const mode = settings.modeSettings[settings.renderMode];
  Object.assign(mode, { lightIntensity: look.brightness, toneMapping: 'aces', toneMappingExposure: 1,
    ambientColor: '#ffffff', ambientIntensity: 0.45, dirLightEnabled: true, dirLightIntensity: 1, dirLightColor: '#ffffff', shadowEnabled: look.shadow > 0,
    shadowIntensity: look.shadow, shadowQuality: 'medium' });
  settings.backgroundBrightness = look.background;
  settings.groundEnabled = look.ground;
  settings.groundBrightness = look.style === 'dark' ? 0.15 : look.style === 'warehouse' ? 0.65 : 1.5;
  settings.groundColor = '#ffffff'; settings.checkerContrast = look.style === 'warehouse' ? 0.1 : 0;
  settings.reflectionEnabled = look.reflection > 0; settings.reflectionStrength = look.reflection; settings.reflectionBlur = 0.4;
  settings.aoMode = 'gtao'; settings.ssaoIntensity = 1; settings.ssaoRadius = 0.15;
  settings.bloomEnabled = false;
  settings.toonBands = 4; settings.toonOutlineAmount = 0.6;
  return settings;
}
export interface LookTemplate { id: string; name: string; look: PresentationLook }
export function parseTemplates(raw: unknown): LookTemplate[] {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.templates) || raw.templates.length > 50) throw new PresentationError('invalid');
  const seen = new Set<string>();
  return raw.templates.map(v => {
    if (!isRecord(v) || typeof v.id !== 'string' || !/^[\w-]{1,100}$/.test(v.id) || seen.has(v.id)
      || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80) throw new PresentationError('invalid');
    seen.add(v.id); return { ...v, id: v.id, name: v.name.trim(), look: parseLook(v.look) };
  });
}
