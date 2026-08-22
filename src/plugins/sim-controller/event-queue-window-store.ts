// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * event-queue-window-store — tiny shared open-state for the DES Event Queue
 * window. PUBLIC so the DES toolbar button and any compatible auxiliary entry
 * point share one source of truth. The public toolbar owns the live diagnostics
 * portal; the DES workspace closes this store when the mode is deactivated.
 *
 * `useSyncExternalStore`-compatible (subscribe + a stable getSnapshot).
 */

let _open = false;
const _listeners = new Set<() => void>();
function _emit(): void { for (const l of _listeners) l(); }

/** Subscribe to open-state changes (useSyncExternalStore). */
export function subscribeEventQueueWindow(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

/** Current open state (useSyncExternalStore getSnapshot). */
export function isEventQueueWindowOpen(): boolean { return _open; }

/** Toggle the window. */
export function toggleEventQueueWindow(): void { _open = !_open; _emit(); }

/** Explicitly set the open state. */
export function setEventQueueWindowOpen(open: boolean): void {
  if (_open === open) return;
  _open = open;
  _emit();
}
