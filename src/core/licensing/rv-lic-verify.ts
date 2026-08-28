// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Offline verification of `.rvlic` license files.
 *
 * The signature covers the payload BYTES, so this module verifies before it
 * parses. That is the whole reason there is no canonical-JSON step here and no
 * copy of the byte-offset JSON scanner the GLB path needs: key order,
 * duplicate keys, Unicode normalization and whitespace cannot change what was
 * signed, because what was signed is not a JSON value.
 *
 * What this module establishes is that a license was issued by us and has not
 * been altered. It does not, and cannot, establish that nobody bypassed it —
 * the project is AGPL-3.0-only and the licensee holds the source. See ADR-0007.
 */

import {
  type Ed25519VerifyOptions,
  decodeStrictBase64Any,
  decodeStrictPublicKey,
  decodeStrictSignature,
  rvKeyV1CertMessage,
  verifyEd25519,
} from '../crypto/rv-ed25519';
import { RV_LIC_ROOT_PUBLIC_KEY_BASE64 } from './rv-lic-public-key';
import {
  RV_LIC_DEFAULT_GRACE_DAYS,
  RV_LIC_MAX_BYTES,
  RV_LIC_MAX_GRACE_DAYS,
  type LicensePayload,
  type LicenseVerification,
  type LicenseVerifyReason,
} from './rv-lic-types';

export interface VerifyLicenseOptions extends Ed25519VerifyOptions {
  /** Test-only trust anchor override. Production callers use the compiled root key. */
  rootPublicKeyBase64?: string;
}

const encoder = new TextEncoder();
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const INSTALL_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;
const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$|^\[?[0-9a-f:.]+\]?$/;

/**
 * The signed message: `"RV-LIC-V1" || u32LE(payload.length) || payload`.
 *
 * The prefix and the length are what stop a license signature from being
 * replayed as a GLB file signature or an RV-KEY-V1 certificate, and vice
 * versa. Same private key, three protocols, no overlap.
 */
export function licenseMessage(payloadBytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = encoder.encode('RV-LIC-V1');
  const out = new Uint8Array(prefix.length + 4 + payloadBytes.length);
  out.set(prefix, 0);
  new DataView(out.buffer).setUint32(prefix.length, payloadBytes.length, true);
  out.set(payloadBytes, prefix.length + 4);
  return out;
}

function fail(reason: LicenseVerifyReason, signerOrganization?: string): LicenseVerification {
  return { state: 'invalid', payload: null, reason, signerOrganization };
}

function undecided(reason: LicenseVerifyReason, signerOrganization?: string): LicenseVerification {
  return { state: 'unverifiable', payload: null, reason, signerOrganization };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Shape-check the decoded payload.
 *
 * Unknown members are accepted on purpose (contract §4): the payload is
 * additive-only, so a newer issuer must not turn an older client's license
 * into `invalid`.
 */
function readPayload(raw: unknown): LicensePayload | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== 1) return null;
  if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 128) return null;
  if (typeof raw.issuedAt !== 'string' || !INSTANT_RE.test(raw.issuedAt)) return null;
  if (typeof raw.notAfter !== 'string' || !INSTANT_RE.test(raw.notAfter)) return null;
  const issuedAtMs = Date.parse(raw.issuedAt);
  const notAfterMs = Date.parse(raw.notAfter);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(notAfterMs)) return null;
  // A term that ends before it began cannot be honoured: `issuedAt` floors the
  // clock, so such a license would evaluate as expired from its first boot and
  // never recover. Better to name it malformed than to silently degrade.
  if (notAfterMs < issuedAtMs) return null;

  // Clamped, never rejected (contract §4). A grace period is the customer's
  // safety margin; refusing the whole license over an out-of-range one would
  // punish the plant for an issuing mistake.
  let graceDays = RV_LIC_DEFAULT_GRACE_DAYS;
  if (typeof raw.graceDays === 'number' && Number.isFinite(raw.graceDays)) {
    graceDays = Math.min(Math.max(Math.trunc(raw.graceDays), 0), RV_LIC_MAX_GRACE_DAYS);
  }

  let binding: LicensePayload['binding'];
  if (raw.binding !== undefined) {
    if (!isRecord(raw.binding)) return null;
    const installId = raw.binding.installId;
    if (installId !== undefined && (typeof installId !== 'string' || !INSTALL_ID_RE.test(installId))) return null;
    let hosts: string[] | undefined;
    if (raw.binding.hosts !== undefined) {
      if (!Array.isArray(raw.binding.hosts) || raw.binding.hosts.length > 32) return null;
      hosts = [];
      for (const host of raw.binding.hosts) {
        if (typeof host !== 'string' || host.length < 1 || host.length > 253 || !HOST_RE.test(host)) return null;
        hosts.push(host);
      }
    }
    binding = { installId: installId as string | undefined, hosts };
  }

  // Contract §7 is explicit that limits are never a basis for refusal, so a
  // malformed figure is dropped rather than allowed to invalidate the license.
  let limits: LicensePayload['limits'];
  if (isRecord(raw.limits)) {
    limits = {
      seats: nonNegativeInteger(raw.limits.seats),
      signals: nonNegativeInteger(raw.limits.signals),
    };
  }

  // Unknown feature ids are ignored rather than rejected (contract §4).
  const features: string[] = [];
  if (raw.features !== undefined) {
    if (!Array.isArray(raw.features) || raw.features.length > 64) return null;
    for (const feature of raw.features) {
      if (typeof feature !== 'string' || feature.length < 1 || feature.length > 64) return null;
      features.push(feature);
    }
  }

  const customer = isRecord(raw.customer)
    ? { org: optionalText(raw.customer.org, 200), contact: optionalText(raw.customer.contact, 200) }
    : undefined;
  const terms = isRecord(raw.terms)
    ? { url: optionalText(raw.terms.url, 1000), version: optionalText(raw.terms.version, 64) }
    : undefined;

  return {
    v: 1,
    id: raw.id,
    issuedAt: raw.issuedAt,
    notAfter: raw.notAfter,
    graceDays,
    customer,
    binding,
    features,
    limits,
    terms,
  };
}

/**
 * Verify license bytes as fetched.
 *
 * Ordering follows contract §9 exactly, and every early return distinguishes
 * "bad" from "could not tell": an environment that cannot do Ed25519, or a
 * build with no trust root compiled in, yields `unverifiable`, which the state
 * machine must never turn into a lockout.
 */
export async function verifyLicenseText(
  text: string,
  options: VerifyLicenseOptions = {},
): Promise<LicenseVerification> {
  if (encoder.encode(text).length > RV_LIC_MAX_BYTES) return fail('too-large');

  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return fail('envelope-malformed');
  }
  if (!isRecord(envelope)) return fail('envelope-malformed');
  if (envelope.rvlic !== 1) return fail('unsupported-envelope-version');
  if (typeof envelope.payload !== 'string' || typeof envelope.sig !== 'string') {
    return fail('envelope-malformed');
  }
  for (const key of Object.keys(envelope)) {
    if (key !== 'rvlic' && key !== 'payload' && key !== 'sig' && key !== 'cert') {
      return fail('envelope-malformed');
    }
  }

  const payloadBytes = decodeStrictBase64Any(envelope.payload);
  if (!payloadBytes || payloadBytes.length === 0) return fail('envelope-malformed');
  const signature = decodeStrictSignature(envelope.sig);
  if (!signature) return fail('signature-malformed');

  const rootPublicKey = decodeStrictPublicKey(options.rootPublicKeyBase64 ?? RV_LIC_ROOT_PUBLIC_KEY_BASE64);
  if (!rootPublicKey) return undecided('no-trust-root');

  let signingKey = rootPublicKey;
  let signerOrganization: string | undefined;

  if (envelope.cert !== undefined) {
    if (!isRecord(envelope.cert)) return fail('cert-malformed');
    const certPublicKey = decodeStrictPublicKey(envelope.cert.pub);
    const certSignature = decodeStrictSignature(envelope.cert.sig);
    const org = envelope.cert.org;
    if (!certPublicKey || !certSignature || typeof org !== 'string' || org.length < 1 || org.length > 200) {
      return fail('cert-malformed');
    }
    const certOk = await verifyEd25519(
      certSignature,
      rvKeyV1CertMessage(certPublicKey, org),
      rootPublicKey,
      options,
    );
    if (certOk === null) return undecided('no-crypto', org);
    if (!certOk) return fail('cert-untrusted', org);
    signingKey = certPublicKey;
    // The NFC form is what the certificate signature covers; reporting the
    // envelope's spelling would show a string that was never signed.
    signerOrganization = org.normalize('NFC');
  }

  const signatureOk = await verifyEd25519(signature, licenseMessage(payloadBytes), signingKey, options);
  if (signatureOk === null) return undecided('no-crypto', signerOrganization);
  if (!signatureOk) return fail('signature-mismatch', signerOrganization);

  // Only now is it safe to look at the contents.
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
  } catch {
    return fail('payload-malformed', signerOrganization);
  }
  if (isRecord(rawPayload) && rawPayload.v !== 1) {
    return fail('unsupported-payload-version', signerOrganization);
  }
  const payload = readPayload(rawPayload);
  if (!payload) return fail('payload-invalid', signerOrganization);

  return { state: 'valid', payload, reason: null, signerOrganization };
}
