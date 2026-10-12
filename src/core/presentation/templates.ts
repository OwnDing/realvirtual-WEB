// SPDX-License-Identifier: AGPL-3.0-only
import { parseTemplates, PresentationError, isRecord, type LookTemplate } from './look';
import { parseMaterial } from './materials';
import type { MaterialValue } from '../editor/rv-asset-ops';
const KEY = 'rv-presentation-templates-v1';
export interface Templates { schemaVersion: 1; templates: LookTemplate[]; materials: MaterialValue[] }
export function parseTemplateBundle(raw: unknown): Templates {
  const templates = parseTemplates(raw);
  if (!isRecord(raw) || !Array.isArray(raw.materials) || raw.materials.length > 50) throw new PresentationError('invalid');
  return { ...raw, schemaVersion: 1, templates, materials: raw.materials.map(parseMaterial) };
}
export function loadTemplates(): Templates {
  const raw = localStorage.getItem(KEY);
  return raw ? parseTemplateBundle(JSON.parse(raw)) : { schemaVersion: 1, templates: [], materials: [] };
}
export function saveTemplates(value: Templates): void {
  const data = JSON.stringify(parseTemplateBundle(value));
  if (new Blob([data]).size > 256 * 1024) throw new PresentationError('size');
  try { localStorage.setItem(KEY, data); } catch { throw new PresentationError('storage'); }
}
