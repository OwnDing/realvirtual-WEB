// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { LoadingManager } from 'three';
import type { EgressPurpose } from './deployment-config';
import { requireRuntimeEgressUrl } from './runtime-egress';

/** Applies to nested buffers, textures and decoders, not just the top-level GLB. */
export function createEgressLoadingManager(purpose: EgressPurpose = 'remote-model'): LoadingManager {
  return new LoadingManager().setURLModifier((url) => {
    requireRuntimeEgressUrl(url, purpose);
    return url;
  });
}
