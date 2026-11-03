// SPDX-License-Identifier: AGPL-3.0-only

/**
 * multiuser-role — which role a browser may hold in a multiuser room (ADR-0028).
 *
 * The multiuser protocol lets the browser declare `operator` or `observer` in
 * `room_join`. Where the deployment has personal accounts (`services.access`,
 * the Offline Appliance), the HMI session decides: only a session that may write
 * signals can be an operator; a viewer, a signed-out or a still-loading session
 * is an observer. A request can lower that ceiling, never raise it.
 *
 * Without an access service there are no accounts to ask, so the requested role
 * stands — exactly as before. That is NOT a security boundary, and
 * doc-multiuser-system.md says so. The boundary in the Appliance is the
 * gateway's multiuser guard, which overwrites the role server-side; this module
 * is the experience layer that keeps the UI honest about it.
 */

import { hmiCan, type HmiSessionSnapshot } from './hmi-session-store';

export type MultiuserRole = 'operator' | 'observer';

/** Anything that is not literally `operator` is an observer. */
export function normalizeMultiuserRole(value: unknown): MultiuserRole {
  return value === 'operator' ? 'operator' : 'observer';
}

/** Highest role this session may hold, or `null` when the deployment has no accounts. */
export function multiuserRoleCeiling(session: HmiSessionSnapshot): MultiuserRole | null {
  if (session.status === 'disabled') return null;
  return hmiCan('write-signals', session) ? 'operator' : 'observer';
}

/** The role actually used: the request, capped by the session. */
export function effectiveMultiuserRole(requested: unknown, session: HmiSessionSnapshot): MultiuserRole {
  const role = normalizeMultiuserRole(requested);
  return multiuserRoleCeiling(session) === 'observer' ? 'observer' : role;
}
