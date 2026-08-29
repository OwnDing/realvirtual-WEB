// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import type { DeploymentConfigFields } from '../deployment/deployment-config';
import { parseProjectConfiguration } from './project-config';
import { readUserConfig } from './user-config-store';
import {
  resolveUnifiedConfig,
  type UnifiedConfigResolution,
  type UnifiedConfigValues,
} from './unified-config';

let deployment: UnifiedConfigValues | undefined;
let policy: DeploymentConfigFields['policy'];
let project: UnifiedConfigValues | undefined;
let projectRaw: unknown;
let session: UnifiedConfigValues | undefined;
let userScope: string | null = null;
let workspaceCapabilities: readonly string[] | undefined;
let featureCapabilities: readonly string[] | undefined;
let issues: string[] = [];

export function initializeUnifiedRuntime(
  config: Pick<DeploymentConfigFields, 'defaults' | 'policy'>,
  sessionValues?: UnifiedConfigValues,
): void {
  deployment = config.defaults;
  policy = config.policy;
  session = sessionValues;
  project = undefined;
  projectRaw = undefined;
  userScope = null;
  issues = [];
}

export function setUnifiedProjectConfig(raw: unknown, profileId?: string | null): void {
  projectRaw = raw;
  const parsed = parseProjectConfiguration(raw, profileId);
  project = parsed.values;
  issues = parsed.issues;
}

export function setUnifiedProjectProfile(profileId: string | null): void {
  if (projectRaw === undefined) return;
  const parsed = parseProjectConfiguration(projectRaw, profileId);
  project = parsed.values;
  issues = parsed.issues;
}

export function clearUnifiedProjectConfig(): void {
  project = undefined;
  projectRaw = undefined;
  issues = [];
}

export function setUnifiedUserScope(scope: string | null): void {
  userScope = scope;
}

export function setUnifiedCapabilities(capabilities: {
  workspaces?: readonly string[];
  features?: readonly string[];
}): void {
  workspaceCapabilities = capabilities.workspaces;
  featureCapabilities = capabilities.features;
}

export function getUnifiedConfig(): UnifiedConfigResolution {
  return resolveUnifiedConfig({
    deployment,
    project,
    user: readUserConfig(userScope),
    session,
    policy,
    capabilities: { workspaces: workspaceCapabilities, features: featureCapabilities },
  });
}

export function getUnifiedConfigIssues(): readonly string[] {
  return issues;
}

export function resetUnifiedRuntimeForTests(): void {
  deployment = undefined;
  policy = undefined;
  project = undefined;
  projectRaw = undefined;
  session = undefined;
  userScope = null;
  workspaceCapabilities = undefined;
  featureCapabilities = undefined;
  issues = [];
}
