// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * register-des-runner.ts — compatibility re-export for the former
 * `@rv-private/plugins/des/register-des-runner` specifier.
 *
 * The public build owns the DES runtime now (EP-DES-001); see
 * `../../des-runner-stub.ts` for why this path still exists.
 */

export { createDesRunner } from '../../des-runner-stub';
export type { CreateDesRunner } from '../../des-runner-stub';
