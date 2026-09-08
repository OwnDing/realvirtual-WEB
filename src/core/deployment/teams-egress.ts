// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { allowRuntimeEgressUrl } from './runtime-egress';

/** The bundled Teams SDK fetches its remote configuration on import. */
export function canInitializeTeams(): boolean {
  return allowRuntimeEgressUrl('https://res.cdn.office.net', 'multiuser') !== null;
}
