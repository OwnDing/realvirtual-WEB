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
 * Issued by the repository owner on 2026-08-28. Root-key rotation requires a
 * new client build; routine issuer rotation should use the delegated `cert`
 * path so this trust anchor remains stable.
 */
export const RV_LIC_ROOT_PUBLIC_KEY_BASE64 = 'X2YkhXiagu6+S1dT6P8/UX4PTUhG1j2ATEcuhEi/HCA=';
