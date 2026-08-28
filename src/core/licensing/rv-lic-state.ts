// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * The license state machine, as a pure function.
 *
 * No I/O, no clock read, no store access: everything it needs arrives in the
 * context, so every boundary in contract §9 and §10 is a table test rather
 * than a timing experiment.
 *
 * The red line encoded here is that no state removes the ability to run the
 * plant. Only `readonly` takes anything away, and the only thing it takes is
 * saving new authoring changes. That is a safety requirement, not a commercial
 * one: an HMI that suddenly cannot send a stop command is an incident.
 */

import type { LicenseClock } from './rv-lic-clock';
import type { LicensePayload, LicenseVerification, LicenseVerifyReason } from './rv-lic-types';

export type LicenseState =
  | 'not-required'
  | 'valid'
  | 'expiring'
  | 'grace'
  | 'readonly'
  | 'mismatch'
  | 'unverifiable'
  | 'invalid'
  | 'absent';

export type LicenseMismatch =
  | { kind: 'install-id'; expected: string; actual: string | null }
  | { kind: 'host'; expected: readonly string[]; actual: string };

export interface LicenseEvalContext {
  /** Deployment config `license.required`. */
  required: boolean;
  /** Verifier result, or null when no file could be loaded. */
  verification: LicenseVerification | null;
  clock: LicenseClock;
  /** Deployment config `license.installId`, self-asserted by the host. */
  installId?: string;
  /** `window.location.hostname`. */
  hostname: string;
}

export interface LicenseEvaluation {
  state: LicenseState;
  payload: LicensePayload | null;
  reason: LicenseVerifyReason | null;
  /** Days until `notAfter`, negative once past it. Null when there is no license. */
  daysToExpiry: number | null;
  /** Whether authoring changes can be saved. False only in `readonly`. */
  canSave: boolean;
  /** Whether the corner watermark shows. */
  watermark: boolean;
  /** Why a binding comparison failed, for a message that names both sides. */
  mismatch: LicenseMismatch | null;
  clockRollback: boolean;
  signerOrganization?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long before `notAfter` the expiry reminder starts (contract §9). */
export const RV_LIC_EXPIRING_WINDOW_DAYS = 30;

/**
 * A host pattern matches a hostname.
 *
 * One leading `*.` consumes exactly one label, so `*.plant.example.com` covers
 * `hmi.plant.example.com` but neither the bare domain nor a deeper subdomain.
 * Loopback names match only when listed explicitly — in the CONNECT-served
 * on-prem shape the page is on loopback, so an implicit match would make host
 * binding vacuous exactly where it is most likely to be relied on.
 */
export function matchesHost(pattern: string, hostname: string): boolean {
  // `location.hostname` brackets an IPv6 literal (`[::1]`) while an issuer
  // naturally writes it bare, so neither side is normalized against the other
  // unless the brackets come off first.
  const unbracket = (value: string): string => value.replace(/^\[|\]$/g, '');
  const host = unbracket(hostname.toLowerCase());
  const rule = unbracket(pattern.toLowerCase());
  if (!rule.startsWith('*.')) return rule === host;
  const suffix = rule.slice(1);
  if (!host.endsWith(suffix)) return false;
  const head = host.slice(0, host.length - suffix.length);
  return head.length > 0 && !head.includes('.');
}

function checkBinding(payload: LicensePayload, context: LicenseEvalContext): LicenseMismatch | null {
  const binding = payload.binding;
  if (!binding) return null;
  if (binding.installId !== undefined && binding.installId !== context.installId) {
    return { kind: 'install-id', expected: binding.installId, actual: context.installId ?? null };
  }
  const hosts = binding.hosts;
  if (hosts && hosts.length > 0 && !hosts.some((host) => matchesHost(host, context.hostname))) {
    return { kind: 'host', expected: hosts, actual: context.hostname };
  }
  return null;
}

function shell(
  state: LicenseState,
  extra: Partial<LicenseEvaluation> & { clockRollback: boolean },
): LicenseEvaluation {
  // Only `readonly` withholds anything. Everything short of it stays fully
  // functional, and even `readonly` keeps running, signals and device writes.
  const watermark = state === 'grace' || state === 'readonly'
    || state === 'unverifiable' || state === 'invalid' || state === 'absent';
  return {
    state,
    payload: null,
    reason: null,
    daysToExpiry: null,
    canSave: state !== 'readonly',
    watermark,
    mismatch: null,
    ...extra,
  };
}

/**
 * Evaluate the license, in the order contract §9 fixes.
 *
 * `invalid` and `absent` deliberately do not lock: under contract-evidence
 * positioning the consequence of a missing credential is an audit gap, and a
 * lockout would only reach the customer who misconfigured something, never the
 * one who deleted the check.
 */
export function evaluateLicense(context: LicenseEvalContext): LicenseEvaluation {
  const clockRollback = context.clock.clockRollback;

  if (!context.required) return shell('not-required', { clockRollback });
  if (!context.verification) return shell('absent', { clockRollback });

  const { verification } = context;
  if (verification.state === 'unverifiable') {
    return shell('unverifiable', {
      clockRollback,
      reason: verification.reason,
      signerOrganization: verification.signerOrganization,
    });
  }
  if (verification.state === 'invalid' || !verification.payload) {
    return shell('invalid', {
      clockRollback,
      reason: verification.reason,
      signerOrganization: verification.signerOrganization,
    });
  }

  const payload = verification.payload;
  const base = {
    clockRollback,
    payload,
    signerOrganization: verification.signerOrganization,
  };

  const mismatch = checkBinding(payload, context);
  if (mismatch) return shell('mismatch', { ...base, mismatch });

  const notAfter = Date.parse(payload.notAfter);
  const now = context.clock.effectiveNow;
  // `+ 0` collapses -0, which would render as "-0 days".
  const daysToExpiry = Math.ceil((notAfter - now) / DAY_MS) + 0;

  if (now <= notAfter - RV_LIC_EXPIRING_WINDOW_DAYS * DAY_MS) {
    return shell('valid', { ...base, daysToExpiry });
  }
  if (now <= notAfter) return shell('expiring', { ...base, daysToExpiry });
  if (now <= notAfter + payload.graceDays * DAY_MS) return shell('grace', { ...base, daysToExpiry });
  return shell('readonly', { ...base, daysToExpiry });
}
