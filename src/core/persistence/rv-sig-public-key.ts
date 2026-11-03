// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Ed25519 trust root for rv_sig model provenance.
 *
 * This is a PUBLIC key. The matching private key is this project's own: it
 * exists only in the repository owner's secret store and reaches the signer
 * through `RV_SIGN_PRIVATE_KEY`; it must never reach this repository, a build
 * artifact, a log, or a test snapshot.
 *
 * It replaced the upstream publish pipeline's root, so models signed by that
 * pipeline report `invalid` here (geometry loads, logic stays gated until the
 * user enables it). `scripts/rv-sign-glb.mjs` carries the same value;
 * `tests/rv-sig-deploy.node.test.ts` pins the two together and keeps this
 * root distinct from the license root (`rv-lic-public-key.ts`).
 *
 * Issued by the repository owner on 2026-11-03 with
 * `node scripts/rv-sign-glb.mjs --keygen <file>`. Rotation requires a new
 * client build; customer signing keys should use the delegated RV-KEY-V1
 * certificate path so this trust anchor remains stable.
 */
export const RV_SIG_ROOT_PUBLIC_KEY_BASE64 = 'ovqirJ8h7sQ0eQLtGnb0AbMHScqcIPHDK45WoyJFjLA=';
