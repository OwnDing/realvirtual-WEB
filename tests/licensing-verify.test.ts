// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { licenseMessage, verifyLicenseText } from '../src/core/licensing/rv-lic-verify';
import { rvKeyV1CertMessage } from '../src/core/crypto/rv-ed25519';
import { RV_LIC_MAX_BYTES } from '../src/core/licensing/rv-lic-types';

let rootKeys: CryptoKeyPair;
let rootPublicKeyBase64: string;
let otherKeys: CryptoKeyPair;
let otherPublicKeyBase64: string;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function exportRaw(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

async function sign(privateKey: CryptoKey, message: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, message)));
}

const BASE_PAYLOAD = {
  v: 1,
  id: 'XYV-LIC-2026-0001',
  issuedAt: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
};

/** Build a signed license. `mutate` runs on the envelope after signing. */
async function makeLicense(
  payload: Record<string, unknown> = BASE_PAYLOAD,
  options: {
    signWith?: CryptoKeyPair;
    cert?: { keys: CryptoKeyPair; org: string; certSignedBy?: CryptoKeyPair };
    /** Sign the bare payload bytes, skipping the RV-LIC-V1 domain prefix. */
    omitDomainPrefix?: boolean;
  } = {},
): Promise<Record<string, unknown>> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signer = options.cert?.keys ?? options.signWith ?? rootKeys;
  const message = options.omitDomainPrefix ? payloadBytes : licenseMessage(payloadBytes);
  const envelope: Record<string, unknown> = {
    rvlic: 1,
    payload: bytesToBase64(payloadBytes),
    sig: await sign(signer.privateKey, message),
  };
  if (options.cert) {
    const pub = await exportRaw(options.cert.keys.publicKey);
    const certMessage = rvKeyV1CertMessage(
      new Uint8Array(await crypto.subtle.exportKey('raw', options.cert.keys.publicKey)),
      options.cert.org,
    );
    envelope.cert = {
      pub,
      org: options.cert.org,
      sig: await sign((options.cert.certSignedBy ?? rootKeys).privateKey, certMessage),
    };
  }
  return envelope;
}

beforeAll(async () => {
  rootKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  rootPublicKeyBase64 = await exportRaw(rootKeys.publicKey);
  otherKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  otherPublicKeyBase64 = await exportRaw(otherKeys.publicKey);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rvlic signature verification', () => {
  it('accepts a license signed by the trust root', async () => {
    const result = await verifyLicenseText(JSON.stringify(await makeLicense()), { rootPublicKeyBase64 });
    expect(result.state).toBe('valid');
    expect(result.reason).toBeNull();
    expect(result.payload?.id).toBe('XYV-LIC-2026-0001');
  });

  it('applies the contract default grace period and clamps an oversized one', async () => {
    const plain = await verifyLicenseText(JSON.stringify(await makeLicense()), { rootPublicKeyBase64 });
    expect(plain.payload?.graceDays).toBe(30);

    const huge = await makeLicense({ ...BASE_PAYLOAD, graceDays: 4000 });
    const clamped = await verifyLicenseText(JSON.stringify(huge), { rootPublicKeyBase64 });
    expect(clamped.state).toBe('valid');
    expect(clamped.payload?.graceDays).toBe(180);
  });

  it('keeps an unknown payload member instead of rejecting the license', async () => {
    const forward = await makeLicense({ ...BASE_PAYLOAD, somethingAddedLater: { nested: true } });
    const result = await verifyLicenseText(JSON.stringify(forward), { rootPublicKeyBase64 });
    expect(result.state).toBe('valid');
  });

  it('rejects a payload altered after signing', async () => {
    const envelope = await makeLicense();
    const bytes = new TextEncoder().encode(JSON.stringify({ ...BASE_PAYLOAD, id: 'XYV-LIC-2026-9999' }));
    envelope.payload = bytesToBase64(bytes);
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });

  it('rejects a flipped signature bit', async () => {
    const envelope = await makeLicense();
    const raw = atob(envelope.sig as string);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    envelope.sig = bytesToBase64(bytes);
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });

  it('rejects a license signed by a key that is not the trust root', async () => {
    const envelope = await makeLicense(BASE_PAYLOAD, { signWith: otherKeys });
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });

  it('rejects a signature made without the RV-LIC-V1 domain prefix', async () => {
    // Cross-protocol replay: the same private key signs GLB files and key
    // certificates. Without the prefix and length, bytes signed for one
    // protocol would be accepted by another.
    const envelope = await makeLicense(BASE_PAYLOAD, { omitDomainPrefix: true });
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });

  it('rejects a non-canonical Base64 signature', async () => {
    const envelope = await makeLicense();
    // Same 64 bytes, different spelling: the final quantum's unused bits set.
    const sig = envelope.sig as string;
    envelope.sig = `${sig.slice(0, 85)}${sig[85] === 'A' ? 'B' : 'A'}==`;
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(['signature-malformed', 'signature-mismatch']).toContain(result.reason);
  });

  it('rejects an unknown envelope member', async () => {
    const envelope = await makeLicense();
    envelope.extra = 'not in the contract';
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('envelope-malformed');
  });

  it('rejects an unsupported envelope version', async () => {
    const envelope = await makeLicense();
    envelope.rvlic = 2;
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.reason).toBe('unsupported-envelope-version');
  });

  it('reports an unsupported payload version separately from a malformed one', async () => {
    const envelope = await makeLicense({ ...BASE_PAYLOAD, v: 2 });
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('unsupported-payload-version');
  });

  it('refuses an oversized body without decoding it', async () => {
    const padded = JSON.stringify({ rvlic: 1, payload: 'A'.repeat(RV_LIC_MAX_BYTES), sig: 'x' });
    const result = await verifyLicenseText(padded, { rootPublicKeyBase64 });
    expect(result.reason).toBe('too-large');
  });
});

describe('rvlic delegated signing', () => {
  it('accepts a license signed by a certified reseller key', async () => {
    const envelope = await makeLicense(BASE_PAYLOAD, { cert: { keys: otherKeys, org: 'Reseller GmbH' } });
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('valid');
    expect(result.signerOrganization).toBe('Reseller GmbH');
  });

  it('rejects a certificate that the trust root did not sign', async () => {
    const envelope = await makeLicense(BASE_PAYLOAD, {
      cert: { keys: otherKeys, org: 'Impostor GmbH', certSignedBy: otherKeys },
    });
    const result = await verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64 });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('cert-untrusted');
  });
});

describe('rvlic environment handling', () => {
  it('reports unverifiable, not invalid, when no trust root is compiled in', async () => {
    const result = await verifyLicenseText(JSON.stringify(await makeLicense()), { rootPublicKeyBase64: '' });
    expect(result.state).toBe('unverifiable');
    expect(result.reason).toBe('no-trust-root');
  });

  it('reports unverifiable when no implementation is usable', async () => {
    const result = await verifyLicenseText(JSON.stringify(await makeLicense()), {
      rootPublicKeyBase64,
      forceFallback: true,
      disableFallback: true,
    });
    expect(result.state).toBe('unverifiable');
    expect(result.reason).toBe('no-crypto');
  });

  it('verifies with NO crypto.subtle at all', async () => {
    // The shape of a private on-prem install: plain HTTP on a LAN address, so
    // no secure context and no crypto.subtle. Before the synchronous SHA-512
    // hook this returned unverifiable 100% of the time — both the WebCrypto
    // path and noble's async path route through crypto.subtle.
    const text = JSON.stringify(await makeLicense());
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(globalThis.crypto.subtle).toBeUndefined();

    const result = await verifyLicenseText(text, { rootPublicKeyBase64, forceFallback: true });
    expect(result.state).toBe('valid');
    expect(result.payload?.id).toBe('XYV-LIC-2026-0001');
  });

  it('still rejects a bad signature with NO crypto.subtle', async () => {
    const envelope = await makeLicense(BASE_PAYLOAD, { signWith: otherKeys });
    const text = JSON.stringify(envelope);
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });

    const result = await verifyLicenseText(text, { rootPublicKeyBase64, forceFallback: true });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });
});

describe('rvlic trust-root separation', () => {
  it('does not accept the rv_sig model trust root for licenses', async () => {
    const envelope = await makeLicense();
    const result = await verifyLicenseText(JSON.stringify(envelope), {
      rootPublicKeyBase64: otherPublicKeyBase64,
    });
    expect(result.state).toBe('invalid');
  });
});
