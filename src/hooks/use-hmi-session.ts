// SPDX-License-Identifier: AGPL-3.0-only
import { useSyncExternalStore } from 'react';
import { hmiCan, hmiSessionStore, type HmiCapability, type HmiSessionSnapshot } from '../core/hmi/hmi-session-store';

/** The current HMI session (ADR-0024); `disabled` where the deployment has no accounts. */
export function useHmiSession(): HmiSessionSnapshot {
  return useSyncExternalStore(hmiSessionStore.subscribe, hmiSessionStore.getSnapshot, hmiSessionStore.getSnapshot);
}

/** Whether the signed-in role may use `capability` (always true without accounts). */
export function useHmiCan(capability: HmiCapability): boolean {
  return hmiCan(capability, useHmiSession());
}
