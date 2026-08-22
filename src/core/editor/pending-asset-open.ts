// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * One-shot handoff into the public asset editor.
 *
 * The Projects dashboard and MCP bridge can request an asset before the
 * detached Editor mode activates. URLs are deliberately not stored here:
 * catalog/blob sources are resolved by identity after the mode transition.
 */

import type { AssetBase } from './rv-asset-document';

let pending: AssetBase | null = null;

export function setPendingAssetOpen(base: AssetBase | null): void {
  pending = base;
}

export function takePendingAssetOpen(): AssetBase | null {
  const next = pending;
  pending = null;
  return next;
}

export function peekPendingAssetOpen(): AssetBase | null {
  return pending;
}

/** Test-only reset. */
export function resetPendingAssetOpenForTests(): void {
  pending = null;
}
