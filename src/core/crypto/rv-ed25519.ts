// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Ed25519 primitives shared by rv_sig model provenance and `.rvlic` licenses.
 *
 * Both subjects need the same three things — a Base64 codec that rejects
 * non-canonical encodings, a verify that works on whatever the browser
 * actually provides, and a three-way outcome that distinguishes "the signature
 * is wrong" from "this environment cannot tell me". Neither of them needs the
 * other's container format, so only these primitives live here.
 */

/** Test seams. Production callers pass nothing. */
export interface Ed25519VerifyOptions {
  /** Skip WebCrypto and exercise the `@noble/ed25519` path. */
  forceFallback?: boolean;
  /** Model an environment where no implementation is usable. */
  disableFallback?: boolean;
}

/** Standard-alphabet Base64. Chunked to keep `String.fromCharCode` off its argument limit. */
export function bytesToBase64(value: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < value.length; i += chunk) {
    binary += String.fromCharCode(...value.subarray(i, Math.min(i + chunk, value.length)));
  }
  return btoa(binary);
}

/**
 * Decode exactly `expectedLength` bytes of standard Base64, or null.
 *
 * The re-encode comparison is the point: `atob` accepts several spellings of
 * the same bytes, so a length check alone would let a signature or key be
 * rewritten without changing what it decodes to.
 */
export function decodeStrictBase64(value: string, expectedLength: number): Uint8Array | null {
  try {
    const binary = atob(value);
    if (binary.length !== expectedLength) return null;
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return bytesToBase64(out) === value ? out : null;
  } catch {
    return null;
  }
}

/**
 * Decode standard Base64 of unknown length, or null.
 *
 * Same canonicality guarantee as {@link decodeStrictBase64} — the payload of a
 * signed document has no fixed size, but it still must have exactly one legal
 * spelling.
 */
export function decodeStrictBase64Any(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return bytesToBase64(out) === value ? out : null;
  } catch {
    return null;
  }
}

/** Strict 32-byte Ed25519 public key. */
export function decodeStrictPublicKey(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  return decodeStrictBase64(value, 32);
}

/** Strict 64-byte Ed25519 signature. */
export function decodeStrictSignature(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(value)) return null;
  return decodeStrictBase64(value, 64);
}

/** Encode a 64-byte Ed25519 signature. */
export function signatureToBase64(value: Uint8Array): string {
  if (value.length !== 64) throw new Error(`Ed25519 signature must be 64 bytes, got ${value.length}`);
  return bytesToBase64(value);
}

const encoder = new TextEncoder();

/**
 * The RV-KEY-V1 delegation-certificate message.
 *
 * `prefix || publicKey || u32LE(orgLength) || org`, org NFC-normalized. Both
 * rv_sig and `.rvlic` verify delegated signers against this exact byte string,
 * so it lives here once — two copies that drift apart would silently stop
 * accepting each other's certificates.
 */
export function rvKeyV1CertMessage(publicKey: Uint8Array, organization: string): Uint8Array<ArrayBuffer> {
  const org = encoder.encode(organization.normalize('NFC'));
  const prefix = encoder.encode('RV-KEY-V1');
  const out = new Uint8Array(prefix.length + publicKey.length + 4 + org.length);
  out.set(prefix, 0);
  out.set(publicKey, prefix.length);
  new DataView(out.buffer).setUint32(prefix.length + publicKey.length, org.length, true);
  out.set(org, prefix.length + publicKey.length + 4);
  return out;
}

type NobleModule = typeof import('@noble/ed25519');

let nobleOnce: Promise<NobleModule | null> | null = null;

/**
 * Load `@noble/ed25519` and give it a synchronous SHA-512.
 *
 * Without this hook there is no Ed25519 at all in a non-secure context, which
 * is the ordinary shape of a private on-prem install: plain HTTP on a LAN
 * address. `crypto.subtle` is secure-context-only, and noble's async path
 * routes SHA-512 back through `crypto.subtle` too, so both paths fail
 * together. `hashes.sha512` ships unset and `@noble/hashes` is not pulled in
 * transitively, so the fix has to be explicit.
 *
 * Memoized because the assignment only has to happen once and the dynamic
 * import keeps noble out of the bundle when WebCrypto Ed25519 works.
 */
async function loadNoble(): Promise<NobleModule | null> {
  nobleOnce ??= (async () => {
    let noble: NobleModule;
    try {
      noble = await import('@noble/ed25519');
    } catch {
      return null;
    }
    // Separate on purpose: a failure to install the SYNC hook must not throw
    // away a noble that already works. Where `crypto.subtle` exists the async
    // path still verifies, and one memoized `null` here would have disabled the
    // fallback for the whole session.
    if (!noble.hashes.sha512) {
      try {
        const { sha512 } = await import('@noble/hashes/sha2.js');
        noble.hashes.sha512 = sha512;
      } catch {
        // Leaves only the async path, which is exactly the pre-hook behaviour.
      }
    }
    return noble;
  })();
  return nobleOnce;
}

/**
 * Verify an Ed25519 signature.
 *
 * Returns `true`/`false` for a decided answer and `null` for "this environment
 * could not decide" — callers map that to `unverifiable`, never to `invalid`,
 * because a browser that cannot do the maths has not told us the signature is
 * bad.
 *
 * Three implementations are tried in order of decreasing capability, not
 * decreasing preference: WebCrypto Ed25519 first because its digest runs off
 * the main thread and the model path hands this function whole multi-megabyte
 * files; then noble's async path, which still gets an off-thread digest from
 * `crypto.subtle` and covers browsers whose WebCrypto lacks the Ed25519
 * algorithm; then noble's synchronous path, the only one that survives with no
 * WebCrypto at all.
 */
export async function verifyEd25519(
  signature: Uint8Array,
  message: Uint8Array<ArrayBuffer>,
  publicKey: Uint8Array,
  options: Ed25519VerifyOptions = {},
): Promise<boolean | null> {
  const signatureBytes = Uint8Array.from(signature);
  // NOT copied: both model call sites pass a freshly allocated, offset-free
  // Uint8Array, and for the file signature that is the whole GLB.
  // `Uint8Array.from` would walk it through the iterator protocol — a second
  // full copy per load.
  const messageBytes = message;
  const publicKeyBytes = Uint8Array.from(publicKey);

  if (!options.forceFallback) {
    try {
      const key = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);
      return await crypto.subtle.verify('Ed25519', key, signatureBytes, messageBytes);
    } catch {
      // Feature detection: fall through to the lazily loaded implementations.
    }
  }
  if (options.disableFallback) return null;

  const noble = await loadNoble();
  if (!noble) return null;
  try {
    return await noble.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    // No `crypto.subtle` for the digest. The synchronous path below needs none.
  }
  try {
    return noble.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return null;
  }
}
