// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Versioned deployment identity, service and external-access contract. */

export const DEFAULT_PRODUCT_NAME = 'XYvirtual WEB';
export const DEFAULT_PRODUCT_SHORT_NAME = 'XYvirtual';

export const EGRESS_PURPOSES = [
  'analytics',
  'news',
  'documentation',
  'legal-link',
  'connect-updates',
  'firebase-demo',
  'github-library',
  'cad-link',
  'remote-model',
  'industrial-interface',
  'multiuser',
  'share',
  'debug-tool',
] as const;

export type EgressPurpose = (typeof EGRESS_PURPOSES)[number];
export type EgressMode = 'deny-external' | 'allow-listed';

export interface DeploymentIdentityConfig {
  productName?: string;
  shortName?: string;
  companyName?: string;
  description?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface DeploymentLegalConfig {
  sourceUrl?: string;
  licenseUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  copyrightNotice?: string;
}

export interface EgressOriginRule {
  origin: string;
  purposes: EgressPurpose[];
}

export interface DeploymentEgressConfig {
  mode: EgressMode;
  allow?: EgressOriginRule[];
}

export interface DeploymentServicesConfig {
  analytics?: null | {
    provider: 'google-analytics';
    measurementId: string;
    scriptUrl: string;
    privacyPolicyUrl?: string;
  };
  news?: null | { apiUrl: string };
  documentation?: null | { baseUrl: string };
  connectUpdates?: null | {
    stableDownloadUrl: string;
    stableManifestUrl?: string;
    betaManifestUrl?: string;
  };
  firebaseDemo?: null | { modelBaseUrl: string };
  githubLibrary?: null | {
    webBaseUrl: string;
    apiBaseUrl: string;
    rawBaseUrl: string;
  };
  cadLinks?: null | Array<{ id: string; label: string; url: string }>;
  qr?: null | { mode: 'local' };
}

export interface DeploymentLicenseConfig {
  /**
   * Whether this deployment expects a signed `.rvlic` file.
   *
   * Defaults to false, and that default is load-bearing: without it "the file
   * is missing" and "this deployment never wanted a license" are the same
   * state, so the public demo, the community build and every dev checkout
   * would show unlicensed copy.
   */
  required: boolean;
  /** Same-origin, relative. Validated like any other deployment asset path. */
  path: string;
  /** Self-asserted install identity, compared against the license binding. */
  installId?: string;
}

export interface DeploymentConfigFields {
  schemaVersion?: 1;
  identity?: DeploymentIdentityConfig;
  legal?: DeploymentLegalConfig;
  egress?: DeploymentEgressConfig;
  services?: DeploymentServicesConfig;
  license?: DeploymentLicenseConfig;
}

export interface DeploymentConfigValidation<T extends Record<string, unknown>> {
  config: T & DeploymentConfigFields;
  issues: string[];
}

const PURPOSE_SET = new Set<string>(EGRESS_PURPOSES);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const RELATIVE_ASSET_RE = /^(?![a-z][a-z0-9+.-]*:|\/\/).+/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function httpUrl(value: unknown): string | undefined {
  const candidate = text(value, 1_000);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function relativeAssetUrl(value: unknown): string | undefined {
  const candidate = text(value, 500);
  return candidate && RELATIVE_ASSET_RE.test(candidate) ? candidate : undefined;
}

/** Canonical absolute origin. Paths, credentials, query and fragments are rejected. */
export function canonicalEgressOrigin(value: unknown): string | null {
  const candidate = text(value, 300);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function addInvalidIssue(
  issues: string[],
  path: string,
  original: unknown,
  parsed: unknown,
): void {
  if (original !== undefined && parsed === undefined) issues.push(`${path} is invalid and was ignored`);
}

function parseIdentity(value: unknown, issues: string[]): DeploymentIdentityConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('identity must be an object');
    return undefined;
  }
  const result: DeploymentIdentityConfig = {};
  result.productName = text(value.productName, 200);
  result.shortName = text(value.shortName, 200);
  result.companyName = text(value.companyName, 200);
  result.description = typeof value.description === 'string' && value.description.length <= 500
    ? value.description.trim()
    : undefined;
  result.logoUrl = relativeAssetUrl(value.logoUrl);
  result.faviconUrl = relativeAssetUrl(value.faviconUrl);
  result.primaryColor = typeof value.primaryColor === 'string' && COLOR_RE.test(value.primaryColor)
    ? value.primaryColor
    : undefined;
  result.secondaryColor = typeof value.secondaryColor === 'string' && COLOR_RE.test(value.secondaryColor)
    ? value.secondaryColor
    : undefined;
  for (const key of ['productName', 'shortName', 'companyName', 'description', 'logoUrl', 'faviconUrl', 'primaryColor', 'secondaryColor'] as const) {
    addInvalidIssue(issues, `identity.${key}`, value[key], result[key]);
  }
  return result;
}

function parseLegal(value: unknown, issues: string[]): DeploymentLegalConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('legal must be an object');
    return undefined;
  }
  const result: DeploymentLegalConfig = {
    sourceUrl: httpUrl(value.sourceUrl),
    licenseUrl: httpUrl(value.licenseUrl),
    privacyUrl: httpUrl(value.privacyUrl),
    termsUrl: httpUrl(value.termsUrl),
    copyrightNotice: text(value.copyrightNotice, 300),
  };
  for (const key of ['sourceUrl', 'licenseUrl', 'privacyUrl', 'termsUrl', 'copyrightNotice'] as const) {
    addInvalidIssue(issues, `legal.${key}`, value[key], result[key]);
  }
  return result;
}

function parseEgress(value: unknown, issues: string[]): DeploymentEgressConfig {
  if (value === undefined) return { mode: 'deny-external', allow: [] };
  if (!isRecord(value)) {
    issues.push('egress must be an object; external access remains denied');
    return { mode: 'deny-external', allow: [] };
  }
  const mode: EgressMode = value.mode === 'allow-listed' ? 'allow-listed' : 'deny-external';
  if (value.mode !== undefined && value.mode !== 'allow-listed' && value.mode !== 'deny-external') {
    issues.push('egress.mode is invalid; external access remains denied');
  }
  const allow: EgressOriginRule[] = [];
  if (value.allow !== undefined && !Array.isArray(value.allow)) {
    issues.push('egress.allow must be an array');
  } else if (Array.isArray(value.allow)) {
    for (const [index, rawRule] of value.allow.slice(0, 100).entries()) {
      if (!isRecord(rawRule)) {
        issues.push(`egress.allow[${index}] must be an object`);
        continue;
      }
      const origin = canonicalEgressOrigin(rawRule.origin);
      const purposes = Array.isArray(rawRule.purposes)
        ? [...new Set(rawRule.purposes.filter((purpose): purpose is EgressPurpose => (
          typeof purpose === 'string' && PURPOSE_SET.has(purpose)
        )))]
        : [];
      if (!origin || purposes.length === 0) {
        issues.push(`egress.allow[${index}] has no valid origin/purpose and was ignored`);
        continue;
      }
      allow.push({ origin, purposes });
    }
  }
  return { mode, allow };
}

function parseServices(value: unknown, issues: string[]): DeploymentServicesConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push('services must be an object');
    return undefined;
  }
  const result: DeploymentServicesConfig = {};

  if (value.analytics === null) result.analytics = null;
  else if (isRecord(value.analytics)) {
    const measurementId = text(value.analytics.measurementId, 200);
    const scriptUrl = httpUrl(value.analytics.scriptUrl);
    if (value.analytics.provider === 'google-analytics' && measurementId && scriptUrl) {
      result.analytics = {
        provider: 'google-analytics', measurementId, scriptUrl,
        privacyPolicyUrl: httpUrl(value.analytics.privacyPolicyUrl),
      };
    } else issues.push('services.analytics is invalid and was disabled');
  } else if (value.analytics !== undefined) issues.push('services.analytics is invalid and was disabled');

  if (value.news === null) result.news = null;
  else if (isRecord(value.news)) {
    const apiUrl = httpUrl(value.news.apiUrl);
    if (apiUrl) result.news = { apiUrl };
    else issues.push('services.news is invalid and was disabled');
  } else if (value.news !== undefined) issues.push('services.news is invalid and was disabled');

  if (value.documentation === null) result.documentation = null;
  else if (isRecord(value.documentation)) {
    const baseUrl = httpUrl(value.documentation.baseUrl);
    if (baseUrl) result.documentation = { baseUrl };
    else issues.push('services.documentation is invalid and was disabled');
  } else if (value.documentation !== undefined) issues.push('services.documentation is invalid and was disabled');

  if (value.connectUpdates === null) result.connectUpdates = null;
  else if (isRecord(value.connectUpdates)) {
    const stableDownloadUrl = httpUrl(value.connectUpdates.stableDownloadUrl);
    if (stableDownloadUrl) {
      result.connectUpdates = {
        stableDownloadUrl,
        stableManifestUrl: httpUrl(value.connectUpdates.stableManifestUrl),
        betaManifestUrl: httpUrl(value.connectUpdates.betaManifestUrl),
      };
    } else issues.push('services.connectUpdates is invalid and was disabled');
  } else if (value.connectUpdates !== undefined) issues.push('services.connectUpdates is invalid and was disabled');

  if (value.firebaseDemo === null) result.firebaseDemo = null;
  else if (isRecord(value.firebaseDemo)) {
    const modelBaseUrl = httpUrl(value.firebaseDemo.modelBaseUrl);
    if (modelBaseUrl) result.firebaseDemo = { modelBaseUrl };
    else issues.push('services.firebaseDemo is invalid and was disabled');
  } else if (value.firebaseDemo !== undefined) issues.push('services.firebaseDemo is invalid and was disabled');

  if (value.githubLibrary === null) result.githubLibrary = null;
  else if (isRecord(value.githubLibrary)) {
    const webBaseUrl = httpUrl(value.githubLibrary.webBaseUrl);
    const apiBaseUrl = httpUrl(value.githubLibrary.apiBaseUrl);
    const rawBaseUrl = httpUrl(value.githubLibrary.rawBaseUrl);
    if (webBaseUrl && apiBaseUrl && rawBaseUrl) result.githubLibrary = { webBaseUrl, apiBaseUrl, rawBaseUrl };
    else issues.push('services.githubLibrary is invalid and was disabled');
  } else if (value.githubLibrary !== undefined) issues.push('services.githubLibrary is invalid and was disabled');

  if (value.cadLinks === null) result.cadLinks = null;
  else if (Array.isArray(value.cadLinks)) {
    result.cadLinks = value.cadLinks.slice(0, 20).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const id = text(entry.id, 64);
      const label = text(entry.label, 200);
      const url = httpUrl(entry.url);
      return id && /^[a-z0-9][a-z0-9-]*$/.test(id) && label && url ? [{ id, label, url }] : [];
    });
    if (result.cadLinks.length !== value.cadLinks.slice(0, 20).length) {
      issues.push('one or more services.cadLinks entries were invalid and ignored');
    }
  } else if (value.cadLinks !== undefined) issues.push('services.cadLinks is invalid and was disabled');

  if (value.qr === null) result.qr = null;
  else if (isRecord(value.qr) && value.qr.mode === 'local') result.qr = { mode: 'local' };
  else if (value.qr !== undefined) issues.push('services.qr is invalid and was disabled');

  return result;
}

export const DEFAULT_LICENSE_PATH = 'license.rvlic';
const INSTALL_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Parse the license section.
 *
 * Pure field re-extraction, because the deployment config is validated twice
 * per boot — once in `fetchAppConfig`, once in `setAppConfig` — so feeding this
 * its own output has to be a no-op.
 */
function parseLicense(value: unknown, issues: string[]): DeploymentLicenseConfig {
  const fallback: DeploymentLicenseConfig = { required: false, path: DEFAULT_LICENSE_PATH };
  if (value === undefined) return fallback;
  if (!isRecord(value)) {
    issues.push('license is invalid and was ignored');
    return fallback;
  }
  const result: DeploymentLicenseConfig = {
    required: value.required === true,
    path: relativeAssetUrl(value.path) ?? DEFAULT_LICENSE_PATH,
  };
  if (value.path !== undefined && result.path === DEFAULT_LICENSE_PATH && value.path !== DEFAULT_LICENSE_PATH) {
    issues.push('license.path is not a same-origin relative path; the default was used');
  }
  const installId = text(value.installId, 64);
  if (installId && INSTALL_ID_RE.test(installId)) result.installId = installId;
  else if (value.installId !== undefined) issues.push('license.installId is invalid and was ignored');
  return result;
}

/**
 * Preserve legacy settings while validating the deployment-owned fields.
 * Every invalid security field collapses to the deny-external default.
 */
export function validateDeploymentConfig<T extends Record<string, unknown>>(
  raw: T,
): DeploymentConfigValidation<T> {
  const issues: string[] = [];
  const config = { ...raw } as T & DeploymentConfigFields;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) {
    issues.push('schemaVersion is unsupported; deployment-owned fields were ignored');
    delete config.schemaVersion;
    delete config.identity;
    delete config.legal;
    delete config.services;
    delete config.license;
    config.egress = { mode: 'deny-external', allow: [] };
    return { config, issues };
  }
  if (raw.schemaVersion === 1) config.schemaVersion = 1;
  config.identity = parseIdentity(raw.identity, issues);
  config.legal = parseLegal(raw.legal, issues);
  config.egress = parseEgress(raw.egress, issues);
  config.services = parseServices(raw.services, issues);
  config.license = parseLicense(raw.license, issues);
  return { config, issues };
}

export function deploymentProductName(config: DeploymentConfigFields): string {
  return config.identity?.productName ?? DEFAULT_PRODUCT_NAME;
}

export function deploymentShortName(config: DeploymentConfigFields): string {
  return config.identity?.shortName ?? config.identity?.productName ?? DEFAULT_PRODUCT_SHORT_NAME;
}
