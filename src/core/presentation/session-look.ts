// SPDX-License-Identifier: AGPL-3.0-only
import type { PresentationLook } from './look';
let current: PresentationLook | null = null;
const listeners = new Set<() => void>();
/** Session appearance, never persisted by project loading. */
export function setSessionLook(look: PresentationLook | null): void { current = look; for (const fn of listeners) fn(); }
export function getSessionLook(): PresentationLook | null { return current; }
export function subscribeSessionLook(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
