// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { createStore } from './create-store';
import { connectRestFetch } from './connect-rest';
import { rvT } from '../i18n';

export type LicenseState =
  | 'Unlicensed'
  | 'PendingRegistration'
  | 'LicensedCommunity'
  | 'LicensedAnnual'
  | 'LicensedLifetime'
  | 'Degraded';

export type LicenseRegistrationState =
  | 'waitingForEmailConfirmation'
  | 'portalUnreachable'
  | 'expired';

export interface LicenseRegistrationStatus {
  status: LicenseRegistrationState;
  email: string;
  startedAt: string;
  error?: string | null;
}

export interface LicenseStatus {
  state: LicenseState;
  gatewayAllowed: boolean;
  maxSignals: number;
  admittedSignals: number;
  effectiveNow: string;
  licenseType?: string | null;
  licenseId?: string | null;
  error?: string | null;
  overLimitSignals: string[];
  registration?: LicenseRegistrationStatus | null;
  /** Masked commercial key (e.g. LIC-****-****-CCCC); the gateway never exposes the full key. */
  licenseKeyMasked?: string | null;
}

export interface LicenseSnapshot {
  status: LicenseStatus | null;
  /** null = not checked, false = older gateway without /license/status. */
  supported: boolean | null;
  loading: boolean;
  action: 'idle' | 'registering' | 'activating' | 'deactivating' | 'success' | 'error';
  actionMessage: string;
}

export interface LicensePresentation {
  kind: 'licensed' | 'free' | 'pending' | 'warning';
  label: string;
  detail?: string;
  actionLabel?: string;
}

const EMPTY_SNAPSHOT: LicenseSnapshot = {
  status: null,
  supported: null,
  loading: false,
  action: 'idle',
  actionMessage: '',
};

const store = createStore<LicenseSnapshot>(EMPTY_SNAPSHOT);
let requestGeneration = 0;

export const subscribeLicenseStore = store.subscribe;
export const getLicenseSnapshot = store.getSnapshot;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function registrationStatus(value: unknown): LicenseRegistrationStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.status !== 'waitingForEmailConfirmation'
    && record.status !== 'portalUnreachable'
    && record.status !== 'expired'
  ) return null;
  if (typeof record.email !== 'string' || typeof record.startedAt !== 'string') return null;
  return {
    status: record.status,
    email: record.email,
    startedAt: record.startedAt,
    error: typeof record.error === 'string' ? record.error : null,
  };
}

/** Parse the fail-closed CONNECT response into the UI contract. */
export function mapLicenseStatus(value: unknown): LicenseStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const states: readonly LicenseState[] = [
    'Unlicensed', 'PendingRegistration', 'LicensedCommunity',
    'LicensedAnnual', 'LicensedLifetime', 'Degraded',
  ];
  if (!states.includes(record.state as LicenseState)) return null;
  const maxSignals = finiteNumber(record.maxSignals);
  const admittedSignals = finiteNumber(record.admittedSignals);
  if (maxSignals === null || admittedSignals === null) return null;
  return {
    state: record.state as LicenseState,
    gatewayAllowed: record.gatewayAllowed === true,
    maxSignals,
    admittedSignals,
    effectiveNow: typeof record.effectiveNow === 'string' ? record.effectiveNow : '',
    licenseType: typeof record.licenseType === 'string' ? record.licenseType : null,
    licenseId: typeof record.licenseId === 'string' ? record.licenseId : null,
    error: typeof record.error === 'string' ? record.error : null,
    overLimitSignals: Array.isArray(record.overLimitSignals)
      ? record.overLimitSignals.filter((item): item is string => typeof item === 'string')
      : [],
    registration: registrationStatus(record.registration),
    licenseKeyMasked: typeof record.licenseKeyMasked === 'string' ? record.licenseKeyMasked : null,
  };
}

function humanizeReason(reason: string | null | undefined): string {
  // The reason itself is a backend code (`LICENSE_TOKEN_EXPIRED`); ADR-0001 §6
  // keeps server values as they are, so only the fallback sentence is copy.
  if (!reason) return rvT('shell', 'license.reasonRequired');
  return reason
    .replace(/^LICENSE_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

/** Derive all operator-facing state from one backend snapshot. */
export function deriveLicensePresentation(status: LicenseStatus): LicensePresentation {
  if (status.state === 'Degraded') {
    return {
      kind: 'warning',
      label: rvT('shell', 'license.degraded', { reason: humanizeReason(status.error) }),
      actionLabel: rvT('shell', 'license.actionActivate'),
    };
  }
  switch (status.state) {
    case 'LicensedAnnual':
      return {
        kind: 'licensed',
        label: rvT('shell', 'license.annual', { signals: status.maxSignals }),
        detail: status.licenseKeyMasked ?? undefined,
        actionLabel: rvT('shell', 'license.actionDeactivate'),
      };
    case 'LicensedLifetime':
      return {
        kind: 'licensed',
        label: rvT('shell', 'license.lifetime', {
          signals: status.maxSignals >= 2_147_483_647 ? rvT('shell', 'license.unlimited') : status.maxSignals,
        }),
        detail: status.licenseKeyMasked ?? undefined,
        actionLabel: rvT('shell', 'license.actionDeactivate'),
      };
    case 'LicensedCommunity':
      return {
        kind: 'free',
        label: rvT('shell', 'license.free', { used: status.admittedSignals, max: status.maxSignals }),
        actionLabel: rvT('shell', 'license.actionActivate'),
      };
    case 'PendingRegistration':
      return {
        kind: 'pending',
        label: rvT('shell', 'license.pending'),
        detail: status.registration?.email
          ? rvT('shell', 'license.checkInbox', { email: status.registration.email })
          : rvT('shell', 'license.checkYourInbox'),
        actionLabel: rvT('shell', 'license.actionView'),
      };
    case 'Unlicensed':
    default:
      return {
        kind: 'warning',
        label: rvT('shell', 'license.required'),
        detail: rvT('shell', 'license.requiredDetail'),
        actionLabel: rvT('shell', 'license.actionActivate'),
      };
  }
}

export async function fetchLicenseStatus(serverUrl: string): Promise<void> {
  const generation = ++requestGeneration;
  store.set({ loading: true });
  try {
    const response = await connectRestFetch(`${serverUrl}/license/status`);
    if (generation !== requestGeneration) return;
    if (response.status === 404) {
      store.set({ supported: false, status: null, loading: false });
      return;
    }
    if (!response.ok) {
      store.set({ supported: true, loading: false });
      return;
    }
    const status = mapLicenseStatus(await response.json());
    store.set({ supported: status !== null, status, loading: false });
  } catch {
    if (generation === requestGeneration) store.set({ loading: false });
  }
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') return humanizeReason(body.error);
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Use the HTTP fallback below.
  }
  return `CONNECT returned HTTP ${response.status}`;
}

/** URL of the license terms the activation dialog links to and the user accepts on activation. */
export const LICENSE_TERMS_URL = 'https://xyvirtual.io/en/terms/';

/** Version stamp of the license terms; recorded server-side as proof of acceptance. Bump when the terms change. */
export const LICENSE_TERMS_VERSION = '2026-07';

export async function registerCommunityLicense(
  serverUrl: string,
  email: string,
  productUpdatesConsent = false,
): Promise<boolean> {
  store.set({ action: 'registering', actionMessage: '' });
  try {
    const response = await connectRestFetch(`${serverUrl}/license/register`, {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        termsVersion: LICENSE_TERMS_VERSION,
        productUpdatesConsent,
      }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    store.set({ action: 'success', actionMessage: 'Registration requested. Check your inbox.' });
    await fetchLicenseStatus(serverUrl);
    return true;
  } catch (error) {
    store.set({
      action: 'error',
      actionMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function activateCommercialLicense(serverUrl: string, licenseKey: string): Promise<boolean> {
  store.set({ action: 'activating', actionMessage: '' });
  try {
    const response = await connectRestFetch(`${serverUrl}/license/activate`, {
      method: 'POST',
      body: JSON.stringify({ licenseKey: licenseKey.trim(), termsVersion: LICENSE_TERMS_VERSION }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    store.set({ action: 'success', actionMessage: 'License activated successfully.' });
    await fetchLicenseStatus(serverUrl);
    return true;
  } catch (error) {
    store.set({
      action: 'error',
      actionMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function deactivateLicense(serverUrl: string, licenseKey: string): Promise<boolean> {
  store.set({ action: 'deactivating', actionMessage: '' });
  try {
    const response = await connectRestFetch(`${serverUrl}/license/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ licenseKey: licenseKey.trim() }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    store.set({
      action: 'success',
      actionMessage: 'License deactivated - this device seat was released.',
    });
    await fetchLicenseStatus(serverUrl);
    return true;
  } catch (error) {
    store.set({
      action: 'error',
      actionMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function clearLicenseAction(): void {
  store.set({ action: 'idle', actionMessage: '' });
}

export function clearLicenseStatus(): void {
  requestGeneration++;
  store.set({ ...EMPTY_SNAPSHOT });
}

/** @internal Test-only snapshot injection. */
export function _setLicenseSnapshotForTests(patch: Partial<LicenseSnapshot>): void {
  store.set({ ...EMPTY_SNAPSHOT, ...patch });
}
