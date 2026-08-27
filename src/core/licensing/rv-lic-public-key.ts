// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Ed25519 trust root for `.rvlic` license files.
 *
 * This is a PUBLIC key. The matching private key exists only in the
 * `RV_LIC_SIGN_PRIVATE_KEY` secret of the issuing environment and must never
 * reach this repository, a build artifact, a log, or a test snapshot.
 *
 * It is deliberately NOT the rv_sig model-provenance root
 * (`rv-sig-public-key.ts`): that key's private half belongs to the upstream
 * publish pipeline, so signing this project's entitlements with it would put
 * our contract evidence under someone else's key.
 *
 * EMPTY UNTIL ISSUED. An undecodable root yields `unverifiable`, exactly as a
 * missing rv_sig root does — never `valid`, and never a lockout. A placeholder
 * key is worse than none: it would look like a trust anchor while verifying
 * nothing. Replace this with the real public key once `rv-sign-license.mjs
 * --keygen` has produced the pair.
 */
export const RV_LIC_ROOT_PUBLIC_KEY_BASE64 = '';
