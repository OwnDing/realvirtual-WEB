// SPDX-License-Identifier: AGPL-3.0-only
export type DemoErrorCode = 'recipe' | 'camera' | 'model' | 'size' | 'reference' | 'external' | 'script' | 'compression' | 'runtime' | 'changed';
export class DemoPackageError extends Error {
  constructor(readonly code: DemoErrorCode) { super(code); this.name = 'DemoPackageError'; }
}
export interface DemoCamera { position: [number, number, number]; target: [number, number, number]; fov: number }
export interface DemoStep { id: string; title: string; description: string; camera: DemoCamera; durationMs: number; dwellMs: number }
export interface DemoRecipe { schemaVersion: 1; title: string; locale: 'zh-CN' | 'en-US'; startCamera: DemoCamera; loop: boolean; steps: DemoStep[] }
export const MAX_DEMO_STEPS = 50;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export function parseDemoCamera(value: unknown): DemoCamera {
  const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => finite(n, -1e7, 1e7));
  if (!record(value) || !vector(value.position) || !vector(value.target) || !finite(value.fov, 1, 150)
    || value.position.every((n, i) => n === (value.target as number[])[i])) throw new DemoPackageError('camera');
  return { position: [...value.position], target: [...value.target], fov: value.fov };
}
/** Return a bounded, fresh, known-field-only value; unknown versions never migrate implicitly. */
export function parseDemoRecipe(value: unknown): DemoRecipe {
  if (!record(value) || value.schemaVersion !== 1 || !text(value.title, 120) || !value.title.trim()
    || !['zh-CN', 'en-US'].includes(String(value.locale)) || typeof value.loop !== 'boolean'
    || !Array.isArray(value.steps) || value.steps.length > MAX_DEMO_STEPS) throw new DemoPackageError('recipe');
  const ids = new Set<string>();
  const steps = value.steps.map((step): DemoStep => {
    if (!record(step) || !text(step.id, 100) || !step.id || ids.has(step.id) || !text(step.title, 120)
      || !text(step.description, 2000) || !finite(step.durationMs, 0, 10000) || !finite(step.dwellMs, 1000, 60000)) throw new DemoPackageError('recipe');
    ids.add(step.id);
    return { id: step.id, title: step.title, description: step.description, camera: parseDemoCamera(step.camera), durationMs: step.durationMs, dwellMs: step.dwellMs };
  });
  return { schemaVersion: 1, title: value.title.trim(), locale: value.locale as DemoRecipe['locale'], loop: value.loop, startCamera: parseDemoCamera(value.startCamera), steps };
}
export function demoFileName(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'demo';
}
