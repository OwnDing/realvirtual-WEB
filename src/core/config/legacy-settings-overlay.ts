// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** In-memory project/model defaults for legacy rv-settings-bundle/1.0 files. */

let projectOwner: string | null = null;
let projectSettings: Record<string, unknown> = {};
let modelOwner: string | null = null;
let modelSettings: Record<string, unknown> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function setLegacySettingsOverlay(nextOwner: string, next: Record<string, unknown>): void {
  if (nextOwner.startsWith('model:')) {
    modelOwner = nextOwner;
    modelSettings = { ...next };
  } else {
    projectOwner = nextOwner;
    projectSettings = { ...next };
  }
}

export function clearLegacySettingsOverlay(expectedOwner?: string): void {
  if (expectedOwner === undefined || expectedOwner === projectOwner) {
    projectOwner = null;
    projectSettings = {};
  }
  if (expectedOwner === undefined || expectedOwner === modelOwner) {
    modelOwner = null;
    modelSettings = {};
  }
}

export function clearLegacyModelSettingsOverlay(): void {
  modelOwner = null;
  modelSettings = {};
}

export function getLegacySettingsOverlay<T extends object>(namespace: string): Partial<T> | undefined {
  const project = projectSettings[namespace];
  const model = modelSettings[namespace];
  if (!isRecord(project) && !isRecord(model)) return undefined;
  return {
    ...(isRecord(project) ? project : {}),
    ...(isRecord(model) ? model : {}),
  } as Partial<T>;
}

export function getLegacySettingsOverlayOwner(): string | null {
  return modelOwner ?? projectOwner;
}
