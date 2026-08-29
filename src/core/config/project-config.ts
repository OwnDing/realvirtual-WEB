// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import {
  mergeUnifiedConfigValues,
  parseUnifiedConfigValues,
  type UnifiedConfigValues,
} from './unified-config';

export const PROJECT_CONFIG_SCHEMA = 'rv-project-config/1.0';

export interface ProjectConfiguration {
  $schema: typeof PROJECT_CONFIG_SCHEMA;
  defaults?: UnifiedConfigValues;
  modelProfiles?: Record<string, { defaults?: UnifiedConfigValues }>;
}

export interface ParsedProjectConfiguration {
  values?: UnifiedConfigValues;
  issues: string[];
  kind: 'unified' | 'legacy-bundle' | 'unsupported';
  legacySettings?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: string[],
  prefix: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) issues.push(`${prefix}.${key} is unknown and was ignored`);
  }
}

/** Parse a project file without applying or persisting it. */
export function parseProjectConfiguration(raw: unknown, profileId?: string | null): ParsedProjectConfiguration {
  const issues: string[] = [];
  if (!isRecord(raw)) return { issues: ['project config must be an object'], kind: 'unsupported' };
  if (raw.$schema === 'rv-settings-bundle/1.0') {
    return {
      issues,
      kind: 'legacy-bundle',
      legacySettings: isRecord(raw.settings) ? raw.settings : {},
    };
  }
  if (raw.$schema !== PROJECT_CONFIG_SCHEMA) {
    return { issues: ['project config schema is unsupported'], kind: 'unsupported' };
  }
  reportUnknownKeys(raw, ['$schema', 'defaults', 'modelProfiles'], issues, 'project');
  const defaults = parseUnifiedConfigValues(raw.defaults, issues, 'project.defaults');
  let profileValues: UnifiedConfigValues | undefined;
  if (raw.modelProfiles !== undefined && !isRecord(raw.modelProfiles)) {
    issues.push('project.modelProfiles must be an object');
  } else if (profileId && isRecord(raw.modelProfiles)) {
    const profile = raw.modelProfiles[profileId];
    if (profile !== undefined && !isRecord(profile)) issues.push(`project.modelProfiles.${profileId} must be an object`);
    else if (isRecord(profile)) {
      reportUnknownKeys(profile, ['defaults'], issues, `project.modelProfiles.${profileId}`);
      profileValues = parseUnifiedConfigValues(profile.defaults, issues, `project.modelProfiles.${profileId}.defaults`);
    }
  }
  return { values: mergeUnifiedConfigValues(defaults, profileValues), issues, kind: 'unified' };
}
