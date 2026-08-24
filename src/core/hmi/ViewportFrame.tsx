// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ViewportFrame — keeps the WebGL canvas full-browser beneath HMI overlays.
 *
 * The Three.js canvas lives in a dedicated `#rv-viewport` container (created in
 * main.ts). HMI chrome owns its own overlay positioning and visible-area insets;
 * it must not shrink the render surface. Reasserting all four edges here also
 * repairs an older session/HMR mount that left central-viewport inline styles on
 * the container.
 */

import { useEffect } from 'react';

export function ViewportFrame() {
  useEffect(() => {
    const el = document.getElementById('rv-viewport');
    if (!el) return;
    el.style.left = '0px';
    el.style.right = '0px';
    el.style.top = '0px';
    el.style.bottom = '0px';
  }, []);

  return null;
}
