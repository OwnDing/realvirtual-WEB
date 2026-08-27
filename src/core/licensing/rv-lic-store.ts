// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Loads `license.rvlic` and publishes the evaluated state.
 *
 * The load is same-origin by construction — the configured path is validated
 * as a relative asset URL, so it cannot name another origin, and a same-origin
 * request returns from `decideEgress` before the allow-list is consulted. No
 * egress purpose, no CSP change, no network call to us. Ever.
 *
 * Unlike `settings.json`, which fails open to `{}` so the app always boots,
 * this loader fails CLOSED to `absent`. A deployment that declared it needs a
 * license must not read as licensed because a file 404'd. `absent` still does
 * not lock anything — it is contract evidence that is missing, not permission.
 */

import { createStore } from '../hmi/create-store';
import { getAppConfig } from '../rv-app-config';
import { DEFAULT_LICENSE_PATH } from '../deployment/deployment-config';
import { readLicenseClock, recordLicenseClock } from './rv-lic-clock';
import { evaluateLicense, type LicenseEvaluation } from './rv-lic-state';
import { RV_LIC_MAX_BYTES, type LicenseVerification } from './rv-lic-types';
import { verifyLicenseText, type VerifyLicenseOptions } from './rv-lic-verify';

export interface LicenseSnapshot {
  evaluation: LicenseEvaluation;
  /** False until the first load settles. The app never waits on this. */
  loaded: boolean;
}

const NOT_REQUIRED: LicenseEvaluation = {
  state: 'not-required',
  payload: null,
  reason: null,
  daysToExpiry: null,
  canSave: true,
  watermark: false,
  mismatch: null,
  clockRollback: false,
};

const store = createStore<LicenseSnapshot>({ evaluation: NOT_REQUIRED, loaded: false });

export const subscribeLicense = store.subscribe;
export const getLicenseSnapshot = store.getSnapshot;

/**
 * Fetch the license file.
 *
 * Returns null for every "no usable file" outcome, including an oversized
 * body: a same-origin file the customer hosts is not a bounded input, so it is
 * measured before it is decoded.
 */
async function fetchLicenseText(path: string): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const text = await response.text();
    if (new TextEncoder().encode(text).length > RV_LIC_MAX_BYTES) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Load, verify and evaluate. Safe to call again; the last call wins.
 *
 * `options` is a test seam for the trust anchor and the crypto path, and
 * `now`/`hostname` keep the boundary tests off the wall clock.
 */
export async function refreshLicense(
  options: VerifyLicenseOptions = {},
  overrides: { now?: number; hostname?: string } = {},
): Promise<LicenseEvaluation> {
  const config = getAppConfig().license;
  const hostname = overrides.hostname
    ?? (typeof window === 'undefined' ? '' : window.location.hostname);

  if (config?.required !== true) {
    const evaluation = evaluateLicense({
      required: false,
      verification: null,
      clock: readLicenseClock(null, overrides.now),
      hostname,
    });
    store.set({ evaluation, loaded: true });
    return evaluation;
  }

  const text = await fetchLicenseText(config.path || DEFAULT_LICENSE_PATH);
  let verification: LicenseVerification | null = null;
  if (text !== null) verification = await verifyLicenseText(text, options);

  const issuedAtMs = verification?.payload ? Date.parse(verification.payload.issuedAt) : null;
  const clock = readLicenseClock(Number.isFinite(issuedAtMs) ? issuedAtMs : null, overrides.now);
  recordLicenseClock(clock.effectiveNow);

  const evaluation = evaluateLicense({
    required: true,
    verification,
    clock,
    installId: config.installId,
    hostname,
  });
  store.set({ evaluation, loaded: true });
  return evaluation;
}

/** @internal Test-only snapshot injection. */
export function _setLicenseEvaluationForTests(evaluation: LicenseEvaluation): void {
  store.set({ evaluation, loaded: true });
}
