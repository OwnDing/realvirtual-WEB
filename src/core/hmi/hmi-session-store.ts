// SPDX-License-Identifier: AGPL-3.0-only

/**
 * hmi-session-store — who is signed in to the HMI and what they may do (ADR-0024).
 *
 * Only deployments that configure `services.access` (the Offline Appliance) have
 * personal accounts. Everywhere else the store stays `disabled` and every
 * capability is granted, so public, standalone and CONNECT deployments behave
 * exactly as before.
 *
 * This is the EXPERIENCE layer: it hides or disables controls a role may not use.
 * The boundary is on the server — Caddy `forward_auth`, the gateway's role check
 * and the project API. A tampered browser gains nothing by flipping this state.
 */

import { createStore } from './create-store';
import { getAppConfig } from '../rv-app-config';

export type HmiRole = 'viewer' | 'operator' | 'engineer' | 'admin';
export type HmiCapability = 'write-signals' | 'force-signals' | 'save-server-projects' | 'manage-users';

const ROLE_ORDER: readonly HmiRole[] = ['viewer', 'operator', 'engineer', 'admin'];
const MINIMUM_ROLE: Record<HmiCapability, HmiRole> = {
  'write-signals': 'operator',
  'force-signals': 'engineer',
  'save-server-projects': 'engineer',
  'manage-users': 'admin',
};

export interface HmiSessionSnapshot {
  /** `disabled` = this deployment has no access service (no personal accounts). */
  status: 'disabled' | 'loading' | 'signed-in' | 'signed-out' | 'error';
  username: string | null;
  role: HmiRole | null;
  csrf: string | null;
}

const INITIAL: HmiSessionSnapshot = { status: 'disabled', username: null, role: null, csrf: null };
const store = createStore<HmiSessionSnapshot>(INITIAL);

export const hmiSessionStore = { subscribe: store.subscribe, getSnapshot: store.getSnapshot };

/** The same-origin access API base, or null when the deployment has none. */
export function accessBaseUrl(): string | null {
  const url = getAppConfig().services?.access?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url.replace(/\/$/, '') : null;
}

function isHmiRole(value: unknown): value is HmiRole {
  return typeof value === 'string' && (ROLE_ORDER as readonly string[]).includes(value);
}

/** True when `snapshot` allows `capability`. A deployment without accounts allows everything. */
export function hmiCan(capability: HmiCapability, snapshot: HmiSessionSnapshot = store.getSnapshot()): boolean {
  if (snapshot.status === 'disabled') return true;
  if (snapshot.status !== 'signed-in' || !snapshot.role) return false;
  return ROLE_ORDER.indexOf(snapshot.role) >= ROLE_ORDER.indexOf(MINIMUM_ROLE[capability]);
}

/** Load the session once at boot. Never throws; failures become `error`/`signed-out`. */
export async function initHmiSession(fetchImpl: typeof fetch = fetch): Promise<HmiSessionSnapshot> {
  const base = accessBaseUrl();
  if (!base) { store.set(INITIAL); return INITIAL; }
  store.set({ ...INITIAL, status: 'loading' });
  try {
    const response = await fetchImpl(`${base}/session`, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
    if (response.status === 401) {
      store.set({ ...INITIAL, status: 'signed-out' });
    } else if (!response.ok) {
      store.set({ ...INITIAL, status: 'error' });
    } else {
      const body = await response.json() as { username?: unknown; role?: unknown; csrf?: unknown };
      // A presentation visitor session is not an HMI session.
      store.set(isHmiRole(body.role) && typeof body.username === 'string' && typeof body.csrf === 'string'
        ? { status: 'signed-in', username: body.username, role: body.role, csrf: body.csrf }
        : { ...INITIAL, status: 'signed-out' });
    }
  } catch {
    store.set({ ...INITIAL, status: 'error' });
  }
  return store.getSnapshot();
}

/**
 * Report an HMI event (force set/clear) to the access audit log. Best effort and
 * supplementary: the server-side evidence of a forced value reaching the PLC is
 * the gateway's write audit with the same user. Returns whether it was recorded.
 */
export async function reportHmiEvent(
  action: 'signal.force' | 'signal.unforce',
  target: string,
  detail: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const base = accessBaseUrl();
  const snapshot = store.getSnapshot();
  if (!base || snapshot.status !== 'signed-in' || !snapshot.csrf) return false;
  try {
    const response = await fetchImpl(`${base}/audit-events`, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-csrf-token': snapshot.csrf },
      body: JSON.stringify({ action, target, detail }),
    });
    return response.status === 201;
  } catch {
    return false;
  }
}

/** End the session and return to the login page. */
export async function logoutHmi(fetchImpl: typeof fetch = fetch, navigate: (url: string) => void = (url) => location.assign(url)): Promise<void> {
  const base = accessBaseUrl();
  const snapshot = store.getSnapshot();
  if (base && snapshot.csrf) {
    try {
      await fetchImpl(`${base}/logout`, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'content-type': 'application/json', 'x-csrf-token': snapshot.csrf }, body: '{}' });
    } catch { /* the cookie is cleared server-side when reachable; navigate either way */ }
  }
  store.set({ ...INITIAL, status: base ? 'signed-out' : 'disabled' });
  navigate('/login/');
}

/** Test seam: replace the snapshot. */
export function __setHmiSessionForTests(snapshot: HmiSessionSnapshot): void {
  store.set(snapshot);
}
