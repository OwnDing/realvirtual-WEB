// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The whole `en-US` catalog, for checks that must see all of it.
 *
 * The runtime deliberately does NOT have a module like this: merging the two
 * halves in `src/` would pull the deferred namespaces straight back into the
 * entry chunk and undo ADR-0001 R1. Tests have no such constraint, and a parity
 * check that could only see half the catalog would be worse than none.
 */

import { enUS } from '../../src/core/i18n/catalogs/en-US';
import { enUSDeferred } from '../../src/core/i18n/catalogs/en-US.deferred';

export const enUSFull = { ...enUS, ...enUSDeferred };
