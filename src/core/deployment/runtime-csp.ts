// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { buildDeploymentCsp } from './deployment-csp.mjs';

/** Additional policies intersect with the build policy; they cannot relax it. */
export function installRuntimeCsp(config: Record<string, unknown>): void {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.dataset.rvRuntimeCsp = '';
  meta.content = buildDeploymentCsp(config);
  document.head.append(meta);
}
