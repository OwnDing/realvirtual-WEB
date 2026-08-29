// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Pure parsing and resolution for ADR-0008's two-plane configuration model. */

export const UNIFIED_CONFIG_LAYERS = ['builtIn', 'deployment', 'project', 'user', 'session'] as const;
export type UnifiedConfigLayer = (typeof UNIFIED_CONFIG_LAYERS)[number];

export const BUILT_IN_WORKSPACES = [
  'viewer', 'hmi', 'des', 'planner', 'commissioning', 'editor',
] as const;

export type UnifiedLocale = 'zh-CN' | 'en-US';

export interface UnifiedWorkspaceValues {
  default?: string;
  allowed?: string[];
}

export interface UnifiedConfigValues {
  locale?: UnifiedLocale;
  workspace?: UnifiedWorkspaceValues;
  features?: Record<string, boolean>;
}

export interface UnifiedConfigPolicy {
  lockedPaths?: string[];
  workspace?: { allowed?: string[] };
  features?: Record<string, 'allow' | 'deny'>;
}

export interface UnifiedConfigProvenance {
  source: UnifiedConfigLayer | 'policy' | 'capability';
  value: unknown;
}

export interface UnifiedConfigRejection {
  path: string;
  source: UnifiedConfigLayer | 'policy' | 'capability';
  reason: 'locked' | 'denied' | 'not-available' | 'outside-allowed-set';
  value: unknown;
}

export interface EffectiveUnifiedConfig {
  locale: UnifiedLocale;
  workspace: { default: string; allowed: string[] };
  features: Record<string, boolean>;
}

export interface UnifiedConfigResolution {
  effective: EffectiveUnifiedConfig;
  provenance: Record<string, UnifiedConfigProvenance>;
  rejected: UnifiedConfigRejection[];
}

export interface ResolveUnifiedConfigInput {
  builtIn?: UnifiedConfigValues;
  deployment?: UnifiedConfigValues;
  project?: UnifiedConfigValues;
  user?: UnifiedConfigValues;
  session?: UnifiedConfigValues;
  policy?: UnifiedConfigPolicy;
  capabilities?: {
    workspaces?: readonly string[];
    features?: readonly string[];
  };
}

export const CONFIG_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LOCKABLE_PATH_RE = /^(?:locale|workspace\.(?:default|allowed)|features\.[a-z0-9][a-z0-9._-]{0,63})$/;

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

function uniqueIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const candidate of value.slice(0, 100)) {
    if (typeof candidate !== 'string' || !CONFIG_ID_RE.test(candidate) || result.includes(candidate)) continue;
    result.push(candidate);
  }
  return result;
}

/** Validate one ordinary-values object. Invalid fields are ignored independently. */
export function parseUnifiedConfigValues(
  value: unknown,
  issues: string[] = [],
  prefix = 'defaults',
): UnifiedConfigValues | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push(`${prefix} must be an object`);
    return undefined;
  }
  const result: UnifiedConfigValues = {};
  reportUnknownKeys(value, ['locale', 'workspace', 'features'], issues, prefix);

  if (value.locale === 'zh-CN' || value.locale === 'en-US') result.locale = value.locale;
  else if (value.locale !== undefined) issues.push(`${prefix}.locale is invalid and was ignored`);

  if (value.workspace !== undefined) {
    if (!isRecord(value.workspace)) issues.push(`${prefix}.workspace must be an object`);
    else {
      const workspace: UnifiedWorkspaceValues = {};
      reportUnknownKeys(value.workspace, ['default', 'allowed'], issues, `${prefix}.workspace`);
      if (typeof value.workspace.default === 'string' && CONFIG_ID_RE.test(value.workspace.default)) {
        workspace.default = value.workspace.default;
      } else if (value.workspace.default !== undefined) {
        issues.push(`${prefix}.workspace.default is invalid and was ignored`);
      }
      const allowed = uniqueIds(value.workspace.allowed);
      if (allowed !== undefined) workspace.allowed = allowed;
      else if (value.workspace.allowed !== undefined) issues.push(`${prefix}.workspace.allowed is invalid and was ignored`);
      if (Object.keys(workspace).length > 0) result.workspace = workspace;
    }
  }

  if (value.features !== undefined) {
    if (!isRecord(value.features)) issues.push(`${prefix}.features must be an object`);
    else {
      const features: Record<string, boolean> = {};
      for (const [id, enabled] of Object.entries(value.features).slice(0, 200)) {
        if (!CONFIG_ID_RE.test(id) || typeof enabled !== 'boolean') {
          issues.push(`${prefix}.features.${id} is invalid and was ignored`);
          continue;
        }
        features[id] = enabled;
      }
      result.features = features;
    }
  }
  return result;
}

/** Validate the deployment/org policy plane. */
export function parseUnifiedConfigPolicy(
  value: unknown,
  issues: string[] = [],
): UnifiedConfigPolicy | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('policy must be an object');
    return undefined;
  }
  const result: UnifiedConfigPolicy = {};
  reportUnknownKeys(value, ['lockedPaths', 'workspace', 'features'], issues, 'policy');
  if (value.lockedPaths !== undefined) {
    if (!Array.isArray(value.lockedPaths)) issues.push('policy.lockedPaths must be an array');
    else {
      result.lockedPaths = [...new Set(value.lockedPaths.filter((path): path is string => (
        typeof path === 'string' && LOCKABLE_PATH_RE.test(path)
      )))];
      if (result.lockedPaths.length !== value.lockedPaths.length) {
        issues.push('one or more policy.lockedPaths entries were invalid and ignored');
      }
    }
  }
  if (value.workspace !== undefined) {
    if (!isRecord(value.workspace)) issues.push('policy.workspace must be an object');
    else {
      reportUnknownKeys(value.workspace, ['allowed'], issues, 'policy.workspace');
      const allowed = uniqueIds(value.workspace.allowed);
      if (allowed !== undefined) result.workspace = { allowed };
      else if (value.workspace.allowed !== undefined) issues.push('policy.workspace.allowed is invalid and was ignored');
    }
  }
  if (value.features !== undefined) {
    if (!isRecord(value.features)) issues.push('policy.features must be an object');
    else {
      const features: Record<string, 'allow' | 'deny'> = {};
      for (const [id, rule] of Object.entries(value.features).slice(0, 200)) {
        if (!CONFIG_ID_RE.test(id) || (rule !== 'allow' && rule !== 'deny')) {
          issues.push(`policy.features.${id} is invalid and was ignored`);
          continue;
        }
        features[id] = rule;
      }
      result.features = features;
    }
  }
  return result;
}

function intersect(current: readonly string[], requested: readonly string[]): string[] {
  const requestedSet = new Set(requested);
  return current.filter((id) => requestedSet.has(id));
}

/** Resolve ordinary values, then apply deployment policy and shipped-capability clamps. */
export function resolveUnifiedConfig(input: ResolveUnifiedConfigInput): UnifiedConfigResolution {
  const builtIn: UnifiedConfigValues = input.builtIn ?? {
    locale: 'zh-CN',
    workspace: { default: 'hmi', allowed: [...BUILT_IN_WORKSPACES] },
    features: {},
  };
  const layers: Array<[UnifiedConfigLayer, UnifiedConfigValues | undefined]> = [
    ['builtIn', builtIn],
    ['deployment', input.deployment],
    ['project', input.project],
    ['user', input.user],
    ['session', input.session],
  ];
  const locked = new Set(input.policy?.lockedPaths ?? []);
  const provenance: Record<string, UnifiedConfigProvenance> = {};
  const rejected: UnifiedConfigRejection[] = [];

  const scalar = <T>(path: string, read: (values: UnifiedConfigValues) => T | undefined, fallback: T): T => {
    let answer = fallback;
    for (const [source, values] of layers) {
      const candidate = values ? read(values) : undefined;
      if (candidate === undefined) continue;
      if (locked.has(path) && (source === 'project' || source === 'user' || source === 'session')) {
        rejected.push({ path, source, reason: 'locked', value: candidate });
        continue;
      }
      answer = candidate;
      provenance[path] = { source, value: candidate };
    }
    if (locked.has(path)) provenance[path] = { source: 'policy', value: answer };
    return answer;
  };

  const locale = scalar<UnifiedLocale>('locale', values => values.locale, 'zh-CN');

  let allowed = [...(input.capabilities?.workspaces ?? builtIn.workspace?.allowed ?? BUILT_IN_WORKSPACES)];
  provenance['workspace.allowed'] = { source: input.capabilities?.workspaces ? 'capability' : 'builtIn', value: [...allowed] };
  for (const [source, values] of layers.slice(1)) {
    const candidate = values?.workspace?.allowed;
    if (!candidate) continue;
    if (locked.has('workspace.allowed') && (source === 'project' || source === 'user' || source === 'session')) {
      rejected.push({ path: 'workspace.allowed', source, reason: 'locked', value: candidate });
      continue;
    }
    const narrowed = intersect(allowed, candidate);
    for (const id of candidate) {
      if (!allowed.includes(id)) rejected.push({ path: 'workspace.allowed', source, reason: 'not-available', value: id });
    }
    allowed = narrowed;
    provenance['workspace.allowed'] = { source, value: [...allowed] };
  }
  if (input.policy?.workspace?.allowed) {
    allowed = intersect(allowed, input.policy.workspace.allowed);
    provenance['workspace.allowed'] = { source: 'policy', value: [...allowed] };
  }

  let workspaceDefault = scalar<string>('workspace.default', values => values.workspace?.default, 'hmi');
  if (!allowed.includes(workspaceDefault)) {
    rejected.push({
      path: 'workspace.default',
      source: provenance['workspace.default']?.source ?? 'builtIn',
      reason: 'outside-allowed-set',
      value: workspaceDefault,
    });
    workspaceDefault = allowed[0] ?? 'hmi';
    provenance['workspace.default'] = { source: 'policy', value: workspaceDefault };
  }

  const featureIds = new Set<string>();
  for (const [, values] of layers) for (const id of Object.keys(values?.features ?? {})) featureIds.add(id);
  for (const id of Object.keys(input.policy?.features ?? {})) featureIds.add(id);
  const featureCapabilities = input.capabilities?.features ? new Set(input.capabilities.features) : null;
  const features: Record<string, boolean> = {};
  for (const id of [...featureIds].sort()) {
    const path = `features.${id}`;
    let enabled = scalar<boolean>(path, values => values.features?.[id], true);
    if (featureCapabilities && !featureCapabilities.has(id)) {
      if (enabled) {
        rejected.push({ path, source: 'capability', reason: 'not-available', value: true });
        provenance[path] = { source: 'capability', value: false };
      }
      enabled = false;
    }
    if (input.policy?.features?.[id] === 'deny') {
      if (enabled) rejected.push({ path, source: 'policy', reason: 'denied', value: true });
      enabled = false;
      provenance[path] = { source: 'policy', value: false };
    }
    features[id] = enabled;
  }

  return {
    effective: { locale, workspace: { default: workspaceDefault, allowed }, features },
    provenance,
    rejected,
  };
}

export function mergeUnifiedConfigValues(
  lower: UnifiedConfigValues | undefined,
  higher: UnifiedConfigValues | undefined,
): UnifiedConfigValues | undefined {
  if (!lower) return higher;
  if (!higher) return lower;
  return {
    ...lower,
    ...higher,
    workspace: lower.workspace || higher.workspace ? { ...lower.workspace, ...higher.workspace } : undefined,
    features: lower.features || higher.features ? { ...lower.features, ...higher.features } : undefined,
  };
}
