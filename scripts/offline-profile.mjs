// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Additive deployment preset; never changes the source file or project state. */
export function offlineProfile(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Deployment config must be an object');
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1 && config.schemaVersion !== 2) {
    throw new Error('Cannot apply offline preset to an unsupported deployment schema');
  }
  return {
    ...config,
    egress: { mode: 'deny-external', allow: [] },
    services: {
      ...config.services,
      analytics: null, news: null, documentation: null, connectUpdates: null,
      firebaseDemo: null, githubLibrary: null, cadLinks: null, qr: { mode: 'local' },
    },
  };
}
