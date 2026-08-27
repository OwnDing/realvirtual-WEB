// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Cross-verification: the Node issuer against the browser verifier.
 *
 * The existing rv_sig suite verifies the browser path with WebCrypto-made
 * signatures and the Node path with Node-made ones, so the two signers are
 * only ever checked against themselves. A license is issued by one and read by
 * the other, so that gap has to be closed here.
 */

import { createPrivateKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  certificateMessage,
  generateLicenseKeyPair,
  issueDelegationCertificate,
  licenseMessage as nodeLicenseMessage,
  signLicensePayload,
  verifyLicenseEnvelope,
} from '../scripts/rv-sign-license.mjs';
import { licenseMessage as browserLicenseMessage, verifyLicenseText } from '../src/core/licensing/rv-lic-verify';
import { rvKeyV1CertMessage } from '../src/core/crypto/rv-ed25519';

const PAYLOAD = {
  v: 1 as const,
  id: 'XYV-LIC-2026-0042',
  issuedAt: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
  graceDays: 30,
  customer: { org: 'Acme Werke GmbH' },
  binding: { installId: 'XYV-INST-9F2A4C81', hosts: ['hmi.acme.local'] },
  features: ['planner', 'des'],
  limits: { seats: 25, signals: 5000 },
};

function issuer() {
  const pair = generateLicenseKeyPair();
  return {
    privateKey: createPrivateKey(pair.privateKeyPem),
    publicKeyBase64: pair.publicKeyBase64,
  };
}

describe('message construction agrees byte for byte', () => {
  it('builds the same RV-LIC-V1 message on both sides', () => {
    for (const size of [0, 1, 255, 256, 65_535, 70_000]) {
      const payloadBytes = new Uint8Array(size).fill(0xab);
      expect(Uint8Array.from(nodeLicenseMessage(payloadBytes)))
        .toStrictEqual(Uint8Array.from(browserLicenseMessage(payloadBytes)));
    }
  });

  it('builds the same RV-KEY-V1 certificate message on both sides', () => {
    const pub = new Uint8Array(32).fill(7);
    for (const org of ['Acme', 'Ünïcödé GmbH', '合同凭证有限公司', 'x'.repeat(200)]) {
      expect(Uint8Array.from(certificateMessage(pub, org)))
        .toStrictEqual(Uint8Array.from(rvKeyV1CertMessage(pub, org)));
    }
  });
});

describe('node issuer to browser verifier', () => {
  it('issues a license the browser verifier accepts', async () => {
    const root = issuer();
    const envelope = signLicensePayload(PAYLOAD, { privateKey: root.privateKey, cert: null });

    const result = await verifyLicenseText(JSON.stringify(envelope), {
      rootPublicKeyBase64: root.publicKeyBase64,
    });
    expect(result.state).toBe('valid');
    expect(result.payload?.id).toBe('XYV-LIC-2026-0042');
    expect(result.payload?.binding?.installId).toBe('XYV-INST-9F2A4C81');
    expect(result.payload?.limits?.signals).toBe(5000);
  });

  it('survives re-indented transport, because the signature covers the payload bytes', async () => {
    const root = issuer();
    const envelope = signLicensePayload(PAYLOAD, { privateKey: root.privateKey, cert: null });

    // A deploy pipeline that pretty-prints or minifies the envelope changes the
    // file's bytes but not the payload's, so the signature must still hold.
    for (const text of [JSON.stringify(envelope), JSON.stringify(envelope, null, 4)]) {
      const result = await verifyLicenseText(text, { rootPublicKeyBase64: root.publicKeyBase64 });
      expect(result.state).toBe('valid');
    }
  });

  it('rejects a payload edited after issuance', async () => {
    const root = issuer();
    const envelope = signLicensePayload(PAYLOAD, { privateKey: root.privateKey, cert: null });
    const extended = Buffer.from(
      JSON.stringify({ ...PAYLOAD, notAfter: '2099-01-01T00:00:00Z' }),
      'utf8',
    ).toString('base64');

    const result = await verifyLicenseText(
      JSON.stringify({ ...envelope, payload: extended }),
      { rootPublicKeyBase64: root.publicKeyBase64 },
    );
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('signature-mismatch');
  });

  it('carries a delegation certificate through to the browser verifier', async () => {
    const root = issuer();
    const reseller = issuer();
    const cert = issueDelegationCertificate(
      Buffer.from(reseller.publicKeyBase64, 'base64'),
      'Reseller Nord GmbH',
      root.privateKey,
    );
    const envelope = signLicensePayload(PAYLOAD, { privateKey: reseller.privateKey, cert });

    const result = await verifyLicenseText(JSON.stringify(envelope), {
      rootPublicKeyBase64: root.publicKeyBase64,
    });
    expect(result.state).toBe('valid');
    expect(result.signerOrganization).toBe('Reseller Nord GmbH');
  });

  it('rejects a delegation certificate the root did not sign', async () => {
    const root = issuer();
    const reseller = issuer();
    const cert = issueDelegationCertificate(
      Buffer.from(reseller.publicKeyBase64, 'base64'),
      'Impostor GmbH',
      reseller.privateKey,
    );
    const envelope = signLicensePayload(PAYLOAD, { privateKey: reseller.privateKey, cert });

    const result = await verifyLicenseText(JSON.stringify(envelope), {
      rootPublicKeyBase64: root.publicKeyBase64,
    });
    expect(result.state).toBe('invalid');
    expect(result.reason).toBe('cert-untrusted');
  });
});

describe('the two verifiers agree', () => {
  it('reaches the same verdict on the same inputs', async () => {
    const root = issuer();
    const other = issuer();
    const good = signLicensePayload(PAYLOAD, { privateKey: root.privateKey, cert: null });
    const foreign = signLicensePayload(PAYLOAD, { privateKey: other.privateKey, cert: null });

    const cases: Array<[string, unknown, 'valid' | 'invalid']> = [
      ['well-formed', good, 'valid'],
      ['signed by another key', foreign, 'invalid'],
      ['unknown envelope member', { ...good, extra: 1 }, 'invalid'],
      ['wrong envelope version', { ...good, rvlic: 2 }, 'invalid'],
      ['payload swapped', { ...good, payload: Buffer.from('{"v":1}').toString('base64') }, 'invalid'],
    ];

    const rootRaw = Buffer.from(root.publicKeyBase64, 'base64');
    for (const [label, envelope, expected] of cases) {
      expect(verifyLicenseEnvelope(envelope, rootRaw), `node: ${label}`).toBe(expected);
      const browser = await verifyLicenseText(JSON.stringify(envelope), {
        rootPublicKeyBase64: root.publicKeyBase64,
      });
      expect(browser.state, `browser: ${label}`).toBe(expected);
    }
  });
});

describe('issuer guard rails', () => {
  it('refuses a payload without the fields the contract requires', () => {
    const root = issuer();
    const signing = { privateKey: root.privateKey, cert: null };
    expect(() => signLicensePayload({ v: 1, id: 'x' }, signing)).toThrow(/issuedAt/);
    expect(() => signLicensePayload({ v: 2, id: 'x' }, signing)).toThrow(/v: 1/);
  });

  it('refuses to emit a file over the loader limit', () => {
    const root = issuer();
    const bloated = { ...PAYLOAD, customer: { org: 'x'.repeat(20_000) } };
    expect(() => signLicensePayload(bloated, { privateKey: root.privateKey, cert: null }))
      .toThrow(/over the 16384 limit/);
  });

  it('refuses a certificate whose key does not match the signing key', () => {
    const root = issuer();
    const reseller = issuer();
    const cert = issueDelegationCertificate(
      Buffer.from(reseller.publicKeyBase64, 'base64'),
      'Reseller Nord GmbH',
      root.privateKey,
    );
    // The browser must not accept a license whose cert names a different key
    // than the one that actually signed the payload.
    const envelope = signLicensePayload(PAYLOAD, { privateKey: root.privateKey, cert });
    return expect(
      verifyLicenseText(JSON.stringify(envelope), { rootPublicKeyBase64: root.publicKeyBase64 }),
    ).resolves.toMatchObject({ state: 'invalid', reason: 'signature-mismatch' });
  });
});
