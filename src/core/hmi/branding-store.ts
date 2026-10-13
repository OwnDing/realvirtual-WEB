// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Deployment owns product chrome; project plugins may add a title only. */

import { useSyncExternalStore } from 'react';
import type { DeploymentIdentityConfig } from '../deployment/deployment-config';
import { resolveDeploymentBrand, type DeploymentBranding, type ResolvedBrand } from '../deployment/brand-config.mjs';

// ─── Types ──────────────────────────────────────────────────────────────

export interface CustomBranding {
  resolved?: ResolvedBrand;
  /** Deployment product name used in product chrome and version labels. */
  productName?: string;
  /** Short product name used as the activity-bar logo accessible name. */
  shortName?: string;
  /** Deploying company name; legal copyright remains separate. */
  companyName?: string;
  /** Deployment description used by static/runtime metadata. */
  description?: string;
  /** Deployment-owned activity-bar logo. Ignored by setCustomBranding. */
  logoUrl?: string;
  /** Company/project name shown next to logo (optional, logo-only if omitted). */
  name?: string;
  /** Logo height in pixels (default: 20). */
  logoHeight?: number;
  /** Primary accent color (buttons, highlights). Default: '#4fc3f7'. */
  primaryColor?: string;
  /** Secondary accent color. Default: '#e94078'. */
  secondaryColor?: string;
  /** Logo badge background color. Default: dark glass. Example: 'rgba(224,224,224,0.85)'. */
  badgeBackground?: string;
  /** If true, badge stretches to match left panel width. Default: false. */
  badgeFullWidth?: boolean;

  /** Show the optional top title bar (full width, right of the top-left logo). Default: false. */
  titleBar?: boolean;
  /** Title text shown centered in the title bar. */
  title?: string;
  /** URL to an optional leading logo shown left of the title (wide format supported). */
  titleLogoUrl?: string;
  /** Height in px of the title-bar leading logo (default: 24). */
  titleLogoHeight?: number;
}

// ─── Store ──────────────────────────────────────────────────────────────

let _resolved = resolveDeploymentBrand();
let _issues: string[] = [];
export const getDeploymentBrand = (): ResolvedBrand => _resolved;
export const getBrandingDiagnostics = (): readonly string[] => _issues;

let _branding: CustomBranding | null = null;
let _deploymentBranding: CustomBranding | null = null;
let _projectBranding: CustomBranding | null = null;
const _listeners = new Set<() => void>();
let _snapshot: CustomBranding | null = null;

function notify(): void {
  _branding = _deploymentBranding || _projectBranding
    ? { ...(_deploymentBranding ?? {}), ...(_projectBranding ?? {}) }
    : null;
  _snapshot = _branding ? { ..._branding } : null;
  for (const l of _listeners) l();
}

/** Set project title-bar presentation. Pass null to restore deployment-only branding. */
export function setCustomBranding(branding: CustomBranding | null): void {
  _issues = [];
  _projectBranding = null;
  if (branding) {
    _projectBranding = {};
    for (const key of ['titleBar', 'title', 'titleLogoUrl', 'titleLogoHeight'] as const) {
      if (branding[key] !== undefined) Object.assign(_projectBranding, { [key]: branding[key] });
    }
    if (Object.keys(branding).some(key => !['titleBar', 'title', 'titleLogoUrl', 'titleLogoHeight'].includes(key))) {
      _issues.push('Project branding cannot override deployment identity');
      console.warn('[branding] Project branding cannot override deployment identity');
    }
  }
  notify();
}

/** Install the deployment-owned base identity before React mounts. */
export function setDeploymentBranding(identity: DeploymentIdentityConfig | null | undefined, branding?: DeploymentBranding): void {
  _resolved = resolveDeploymentBrand({ schemaVersion: 2, identity: identity ?? undefined, branding });
  _deploymentBranding = _resolved.configured ? {
    ..._resolved, name: _resolved.shortName, resolved: _resolved,
  } : null;
  notify();
}

/** Clear custom branding (convenience for plugin dispose). */
export function clearCustomBranding(): void {
  setCustomBranding(null);
}

/** React hook: returns the current custom branding or null for default. */
export function useCustomBranding(): CustomBranding | null {
  return useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; },
    () => _snapshot,
  );
}
