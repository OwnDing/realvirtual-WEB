// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Issue and verify `.rvlic` license files.
 *
 * The signature covers `"RV-LIC-V1" || u32LE(len) || payloadBytes`, and the
 * envelope carries the payload as Base64 of those exact bytes. Nothing here
 * re-serializes the payload, so the issuer and the browser verifier cannot
 * disagree about what was signed. See docs/contracts/LICENSE_FILE.md.
 *
 * This tool produces contract evidence, not a lock. See ADR-0007.
 *
 * Unlike rv-sign-glb.mjs this file hardcodes NO trust root. The browser
 * constant lives in src/core/licensing/rv-lic-public-key.ts; a second copy
 * here would be a third place to drift. `--verify` takes the root from
 * `--root <base64>` or RV_LIC_ROOT_PUBLIC_KEY.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Response bodies above this are refused by the browser loader (contract §1). */
export const RV_LIC_MAX_BYTES = 16 * 1024;
const SPKI_ED25519_PREFIX = '302a300506032b6570032100';
// Mirrors the browser verifier's rules so the two cannot drift apart silently.
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const INSTALL_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;
const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$|^\[?[0-9a-f:.]+\]?$/;
const encoder = new TextEncoder();

function strictBase64(value, bytes, label) {
  const chars = bytes === 64 ? 86 : 43;
  const padding = bytes === 64 ? '==' : '=';
  const re = new RegExp(`^[A-Za-z0-9+/]{${chars}}${padding}$`);
  if (typeof value !== 'string' || !re.test(value)) {
    throw new Error(`${label} must be strict padded standard Base64`);
  }
  const out = Buffer.from(value, 'base64');
  if (out.length !== bytes || out.toString('base64') !== value) {
    throw new Error(`${label} has invalid Base64 encoding`);
  }
  return out;
}

function spki(rawPublicKey) {
  return Buffer.concat([Buffer.from(SPKI_ED25519_PREFIX, 'hex'), Buffer.from(rawPublicKey)]);
}

/**
 * Raw 32 bytes out of a Node KeyObject, via JWK rather than DER parsing.
 *
 * Accepts a private key (deriving the public half) or a public key.
 * `createPublicKey` throws on an already-public KeyObject, which the rv_sig
 * version never hits because it only ever sees private keys.
 */
export function rawPublicKey(key) {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  const jwk = publicKey.export({ format: 'jwk' });
  return Buffer.from(jwk.x, 'base64url');
}

function parsePrivateKey(value, label) {
  if (!value?.trim()) throw new Error(`${label} is not configured`);
  const trimmed = value.trim();
  const pem = trimmed.includes('BEGIN PRIVATE KEY')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${label} must be an Ed25519 PKCS#8 key`);
  return key;
}

/** `"RV-LIC-V1" || u32LE(payload.length) || payload`. Byte-identical to the browser builder. */
export function licenseMessage(payloadBytes) {
  const body = Buffer.from(payloadBytes);
  const prefix = Buffer.from(encoder.encode('RV-LIC-V1'));
  const out = Buffer.alloc(prefix.length + 4 + body.length);
  prefix.copy(out, 0);
  out.writeUInt32LE(body.length, prefix.length);
  body.copy(out, prefix.length + 4);
  return out;
}

/** `"RV-KEY-V1" || pub || u32LE(orgLength) || org`, org NFC-normalized. */
export function certificateMessage(publicKeyRaw, organization) {
  const pub = Buffer.from(publicKeyRaw);
  const org = Buffer.from(encoder.encode(organization.normalize('NFC')));
  const prefix = Buffer.from(encoder.encode('RV-KEY-V1'));
  const out = Buffer.alloc(prefix.length + pub.length + 4 + org.length);
  prefix.copy(out, 0);
  pub.copy(out, prefix.length);
  out.writeUInt32LE(org.length, prefix.length + pub.length);
  org.copy(out, prefix.length + pub.length + 4);
  return out;
}

/** A fresh Ed25519 pair. The secret half must never leave the issuing environment. */
export function generateLicenseKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeyBase64: rawPublicKey(publicKey).toString('base64'),
  };
}

/** Sign a reseller's public key so it can issue licenses without the root secret. */
export function issueDelegationCertificate(publicKeyRaw, organization, rootPrivateKey) {
  if (typeof organization !== 'string' || !organization.trim()) {
    throw new Error('organization must be a non-empty string');
  }
  const pub = Buffer.from(publicKeyRaw);
  if (pub.length !== 32) throw new Error(`delegated public key must be 32 bytes, got ${pub.length}`);
  const org = organization.normalize('NFC');
  return {
    pub: pub.toString('base64'),
    org,
    sig: sign(null, certificateMessage(pub, org), rootPrivateKey).toString('base64'),
  };
}

export function loadLicenseSigningConfig(env = process.env) {
  if (!env.RV_LIC_SIGN_PRIVATE_KEY?.trim()) return null;
  const privateKey = parsePrivateKey(env.RV_LIC_SIGN_PRIVATE_KEY, 'RV_LIC_SIGN_PRIVATE_KEY');
  let cert = null;
  if (env.RV_LIC_SIGN_CERT?.trim()) {
    cert = JSON.parse(readFileSync(resolve(env.RV_LIC_SIGN_CERT.trim()), 'utf8'));
    const expected = strictBase64(cert.pub, 32, 'cert.pub');
    if (!rawPublicKey(privateKey).equals(expected)) {
      throw new Error('RV_LIC_SIGN_PRIVATE_KEY does not match cert.pub');
    }
  }
  return { privateKey, cert };
}

/**
 * Build a signed envelope around `payload`.
 *
 * The payload is serialized ONCE, here, and those bytes are both signed and
 * transported. Callers must not re-stringify.
 */
export function signLicensePayload(payload, signing) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('license payload must be an object');
  }
  if (payload.v !== 1) throw new Error('license payload must declare v: 1');
  for (const field of ['id', 'issuedAt', 'notAfter']) {
    if (typeof payload[field] !== 'string' || !payload[field]) {
      throw new Error(`license payload requires a non-empty ${field}`);
    }
  }
  // Refuse here what the browser verifier would refuse there. Without this the
  // issuer happily signs a payload the client rejects, and the mistake is only
  // discovered at the customer site — the most expensive possible place.
  const issuedAtMs = Date.parse(payload.issuedAt);
  const notAfterMs = Date.parse(payload.notAfter);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(notAfterMs)) {
    throw new Error('issuedAt and notAfter must be RFC 3339 instants');
  }
  if (!INSTANT_RE.test(payload.issuedAt) || !INSTANT_RE.test(payload.notAfter)) {
    throw new Error('issuedAt and notAfter must be UTC with a literal Z, e.g. 2026-08-27T00:00:00Z');
  }
  if (notAfterMs < issuedAtMs) throw new Error('notAfter must not be earlier than issuedAt');
  if (payload.id.length > 128) throw new Error('id must be at most 128 characters');
  if (payload.binding !== undefined) {
    const b = payload.binding;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('binding must be an object');
    if (b.installId !== undefined && !INSTALL_ID_RE.test(String(b.installId))) {
      throw new Error('binding.installId must match ^[A-Za-z0-9._-]{8,64}$');
    }
    if (b.hosts !== undefined) {
      if (!Array.isArray(b.hosts) || b.hosts.length > 32) throw new Error('binding.hosts must be an array of at most 32 hosts');
      for (const host of b.hosts) {
        if (typeof host !== 'string' || !HOST_RE.test(host)) {
          throw new Error(`binding.hosts entry ${JSON.stringify(host)} is not a lowercase host or one leading *. wildcard`);
        }
      }
    }
  }

  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = sign(null, licenseMessage(payloadBytes), signing.privateKey);
  if (signature.length !== 64) throw new Error(`unexpected Ed25519 signature length ${signature.length}`);
  const envelope = {
    rvlic: 1,
    payload: payloadBytes.toString('base64'),
    sig: signature.toString('base64'),
  };
  if (signing.cert) envelope.cert = signing.cert;

  const text = JSON.stringify(envelope, null, 2);
  if (Buffer.byteLength(text, 'utf8') > RV_LIC_MAX_BYTES) {
    throw new Error(`license file would be ${Buffer.byteLength(text, 'utf8')} bytes, over the ${RV_LIC_MAX_BYTES} limit`);
  }
  return envelope;
}

/**
 * Verify an envelope against a trust root.
 *
 * Mirrors the browser decision order (contract §9) and, like it, keeps
 * "cannot tell" separate from "bad".
 */
export function verifyLicenseEnvelope(envelope, rootPublicKeyRaw) {
  try {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return 'invalid';
    if (envelope.rvlic !== 1) return 'invalid';
    for (const key of Object.keys(envelope)) {
      if (!['rvlic', 'payload', 'sig', 'cert'].includes(key)) return 'invalid';
    }
    const root = Buffer.from(rootPublicKeyRaw);
    if (root.length !== 32) return 'unverifiable';

    if (typeof envelope.payload !== 'string') return 'invalid';
    const payloadBytes = Buffer.from(envelope.payload, 'base64');
    if (!payloadBytes.length || payloadBytes.toString('base64') !== envelope.payload) return 'invalid';
    const signature = strictBase64(envelope.sig, 64, 'sig');

    let signingKey = root;
    if (envelope.cert !== undefined) {
      const cert = envelope.cert;
      if (!cert || typeof cert !== 'object' || Array.isArray(cert)) return 'invalid';
      const pub = strictBase64(cert.pub, 32, 'cert.pub');
      const certSig = strictBase64(cert.sig, 64, 'cert.sig');
      if (typeof cert.org !== 'string' || !cert.org.trim()) return 'invalid';
      const certOk = verify(
        null,
        certificateMessage(pub, cert.org),
        { key: spki(root), format: 'der', type: 'spki' },
        certSig,
      );
      if (!certOk) return 'invalid';
      signingKey = pub;
    }

    const signatureOk = verify(
      null,
      licenseMessage(payloadBytes),
      { key: spki(signingKey), format: 'der', type: 'spki' },
      signature,
    );
    if (!signatureOk) return 'invalid';

    // §9 step 6. Without this `--verify` reported `valid` for a file the browser
    // would refuse, which is the opposite of what an issuer checks it for.
    let payload;
    try {
      payload = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      return 'invalid';
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'invalid';
    if (payload.v !== 1) return 'invalid';
    if (typeof payload.id !== 'string' || !payload.id || payload.id.length > 128) return 'invalid';
    for (const field of ['issuedAt', 'notAfter']) {
      if (typeof payload[field] !== 'string' || !INSTANT_RE.test(payload[field])) return 'invalid';
    }
    if (Date.parse(payload.notAfter) < Date.parse(payload.issuedAt)) return 'invalid';
    return 'valid';
  } catch {
    return 'invalid';
  }
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function runCli() {
  const args = process.argv.slice(2);

  if (args[0] === '--keygen') {
    const pair = generateLicenseKeyPair();
    console.log('Public key — paste into src/core/licensing/rv-lic-public-key.ts:\n');
    console.log(`export const RV_LIC_ROOT_PUBLIC_KEY_BASE64 = '${pair.publicKeyBase64}';\n`);
    console.log('Private key — store as RV_LIC_SIGN_PRIVATE_KEY in your secret store.');
    console.log('It must never be committed, logged, or pasted into a ticket.\n');
    console.log(pair.privateKeyPem);
    return;
  }

  if (args[0] === '--cert') {
    const org = argValue(args, '--org');
    const pubBase64 = argValue(args, '--pub');
    if (!org || !pubBase64) {
      throw new Error('Usage: node scripts/rv-sign-license.mjs --cert --org "<name>" --pub <base64>');
    }
    const signing = loadLicenseSigningConfig();
    if (!signing) throw new Error('RV_LIC_SIGN_PRIVATE_KEY is required');
    const cert = issueDelegationCertificate(strictBase64(pubBase64, 32, '--pub'), org, signing.privateKey);
    console.log(JSON.stringify(cert, null, 2));
    return;
  }

  if (args[0] === '--verify') {
    const rootBase64 = argValue(args, '--root') ?? process.env.RV_LIC_ROOT_PUBLIC_KEY;
    if (!rootBase64) {
      throw new Error('--verify needs --root <base64> or RV_LIC_ROOT_PUBLIC_KEY');
    }
    const root = strictBase64(rootBase64.trim(), 32, 'root public key');
    const files = [];
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--root') { i++; continue; }
      files.push(args[i]);
    }
    if (files.length === 0) throw new Error('Usage: node scripts/rv-sign-license.mjs --verify [--root <base64>] <file.rvlic> [...]');
    let failed = false;
    for (const file of files) {
      const state = verifyLicenseEnvelope(JSON.parse(readFileSync(file, 'utf8')), root);
      console.log(`${file}: ${state}`);
      if (state !== 'valid') failed = true;
    }
    if (failed) process.exitCode = 1;
    return;
  }

  const payloadPath = args[0];
  const outPath = argValue(args, '--out');
  if (!payloadPath || !outPath) {
    throw new Error('Usage: node scripts/rv-sign-license.mjs <payload.json> --out <file.rvlic>');
  }
  const signing = loadLicenseSigningConfig();
  if (!signing) throw new Error('RV_LIC_SIGN_PRIVATE_KEY is required');
  const payload = JSON.parse(readFileSync(resolve(payloadPath), 'utf8'));
  const envelope = signLicensePayload(payload, signing);
  writeFileSync(resolve(outPath), `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(`${outPath}: signed license ${payload.id}, valid until ${payload.notAfter}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runCli();
  } catch (error) {
    console.error(`[rv-sign-license] ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}
