// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * des-runner-stub.ts — compatibility shim for the former injected-DES seam.
 *
 * HISTORY: the public build used to have no DES runtime at all. `RVViewer`
 * imported `@rv-private/plugins/des/register-des-runner`, which resolved here
 * when the private sibling was absent, exported `createDesRunner = null`, and
 * `SimulationKernel.hasDesRunner()` therefore reported DES as unavailable.
 *
 * TODAY (EP-DES-001) the public build ships the complete DES runtime and
 * `RVViewer` imports `src/plugins/des/register-des-runner` directly. Nothing in
 * the application reaches this file any more; it stays only so extension
 * bundles compiled against the old specifier keep resolving, and it now points
 * at the same public factory the viewer uses rather than claiming DES is absent.
 */

export { createDesRunner } from '../plugins/des/register-des-runner';
export type { CreateDesRunner } from '../plugins/des/register-des-runner';
