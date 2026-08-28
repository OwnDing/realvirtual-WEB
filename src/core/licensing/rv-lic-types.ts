// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Wire and payload types for `.rvlic` v1. See docs/contracts/LICENSE_FILE.md. */

/** Days past `notAfter` that stay fully functional when the payload says nothing. */
export const RV_LIC_DEFAULT_GRACE_DAYS = 30;
/** Upper bound on `graceDays`. Larger values are clamped, not rejected (contract §4). */
export const RV_LIC_MAX_GRACE_DAYS = 180;
/** Response bodies above this are refused without Base64-decoding them (contract §1). */
export const RV_LIC_MAX_BYTES = 16 * 1024;

export interface LicenseBinding {
  installId?: string;
  hosts?: readonly string[];
}

export interface LicenseLimits {
  seats?: number;
  signals?: number;
}

export interface LicensePayload {
  v: 1;
  id: string;
  issuedAt: string;
  notAfter: string;
  /** Normalized: the contract default applied and the value clamped. */
  graceDays: number;
  customer?: { org?: string; contact?: string };
  binding?: LicenseBinding;
  features: readonly string[];
  limits?: LicenseLimits;
  terms?: { url?: string; version?: string };
}

/**
 * Why a verification came out the way it did.
 *
 * Kept separate from the state so the audit record and the operator message
 * can say something specific without the state machine growing a branch per
 * cause.
 */
export type LicenseVerifyReason =
  | 'too-large'
  | 'envelope-malformed'
  | 'unsupported-envelope-version'
  | 'signature-malformed'
  | 'cert-malformed'
  | 'cert-untrusted'
  | 'signature-mismatch'
  | 'payload-malformed'
  | 'unsupported-payload-version'
  | 'payload-invalid'
  | 'no-trust-root'
  | 'no-crypto';

export interface LicenseVerification {
  /** `unverifiable` means this environment could not decide — never that the license is bad. */
  state: 'valid' | 'invalid' | 'unverifiable';
  payload: LicensePayload | null;
  reason: LicenseVerifyReason | null;
  /** Delegated signer from an RV-KEY-V1 certificate, when the license carries one. */
  signerOrganization?: string;
}
