// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * The clock license expiry is measured against.
 *
 * There is no trustworthy clock in a browser. `Date.now()` is the OS clock and
 * the operator owns it; `performance.now()` does not survive a reload. The
 * product already concedes this — the only authoritative timestamp it has ever
 * had is `effectiveNow`, handed to the browser BY the CONNECT gateway, which
 * is by definition unavailable offline.
 *
 * So expiry is arithmetic on a best-effort clock, floored by three sources,
 * and the design is arranged so the worst case of a wrong clock is a wrong
 * banner rather than a stopped plant.
 */

import { LICENSE_CLOCK_KEY } from '../hmi/rv-storage-keys';

/** How far behind the high-water mark the wall clock may drift before it is reported. */
export const RV_LIC_CLOCK_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface LicenseClock {
  /** The instant the state machine uses. */
  effectiveNow: number;
  /** Raw `Date.now()`, kept for the audit record. */
  wallNow: number;
  /** The wall clock is materially behind an instant this install already saw. */
  clockRollback: boolean;
  /** Storage is unusable, so there is no high-water anchor this session. */
  clockUnanchored: boolean;
}

function readHighWater(): { value: number | null; unanchored: boolean } {
  try {
    const raw = localStorage.getItem(LICENSE_CLOCK_KEY);
    if (raw === null) return { value: null, unanchored: false };
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? { value: parsed, unanchored: false } : { value: null, unanchored: false };
  } catch {
    // Private mode, blocked site data, or a thumbnail context: no anchor, and
    // that is not an error worth surfacing to an operator.
    return { value: null, unanchored: true };
  }
}

/**
 * Advance the high-water mark. Never moves it backwards.
 *
 * Cheap enough to call on every re-evaluation; the value only has to be finer
 * than the day granularity the state machine works in.
 */
export function recordLicenseClock(now: number = Date.now()): void {
  try {
    const current = readHighWater().value;
    if (current === null || now > current) localStorage.setItem(LICENSE_CLOCK_KEY, String(now));
  } catch {
    // Best-effort by construction.
  }
}

/**
 * Compute the instant expiry is measured against.
 *
 * `issuedAtMs` is the floor that matters. It costs nothing, needs no storage,
 * and cannot be cleared: a license cannot have been running before it was
 * issued, so winding the machine's clock back to 1970 reads as day zero of the
 * term rather than as an unexpired license.
 */
export function readLicenseClock(
  issuedAtMs: number | null,
  wallNow: number = Date.now(),
): LicenseClock {
  const { value: highWater, unanchored } = readHighWater();
  let effectiveNow = wallNow;
  if (highWater !== null && highWater > effectiveNow) effectiveNow = highWater;
  if (issuedAtMs !== null && Number.isFinite(issuedAtMs) && issuedAtMs > effectiveNow) effectiveNow = issuedAtMs;
  return {
    effectiveNow,
    wallNow,
    clockRollback: highWater !== null && wallNow < highWater - RV_LIC_CLOCK_TOLERANCE_MS,
    clockUnanchored: unanchored,
  };
}
