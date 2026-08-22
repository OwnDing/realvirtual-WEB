// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The arithmetic behind the paint line's KPIs (EP-DEMO-002, M1), kept pure so
 * it can be tested without a scene.
 *
 * Every number this produces is MEASURED from the running line — there is no
 * seeded generator here and there must never be one. `KpiDemoPlugin`
 * (`src/plugins/demo/`) exists for the other demo and says so in its own file
 * header: "static dummy KPI data … generated once at construction time".
 * Presenting that as a paint line's throughput would be exactly the kind of
 * decorative number `AGENTS.md` P0 forbids.
 *
 * The staleness rule matters as much as the averages: a stopped line has no
 * current cycle time, and showing the last one it had is a lie that looks like
 * a reading. `null` is the honest answer and the UI renders it as "—".
 */

/**
 * A reading goes stale after this many MISSED cycles.
 *
 * Adaptive rather than a fixed number of seconds: a line running one hanger a
 * minute is not "stopped" 30 s after the last one, while a line running one
 * every 3 s plainly is. Scaling by the measured cadence gets both right.
 */
export const STALE_CYCLES = 3;

/** Floor under the adaptive window, so a very fast line does not flicker. */
export const MIN_STALE_S = 10;

/** Crossings kept for the rolling average — about a minute of a running line. */
export const CYCLE_WINDOW = 8;

/**
 * True when a carrier moved from one side of `plane` to the other in the
 * decreasing direction (the return sweep runs -X past the unload station).
 *
 * Strict on the leaving side and inclusive on the arriving side so a carrier
 * parked exactly ON the plane cannot be counted twice on consecutive ticks.
 */
export function crossedDown(prev: number, cur: number, plane: number): boolean {
  return prev > plane && cur <= plane;
}

/**
 * Mean interval between the most recent `CYCLE_WINDOW` crossings, in seconds.
 *
 * `null` when fewer than two crossings are known (no interval exists yet), or
 * when the newest one is older than {@link STALE_CYCLES} cycles — a stopped
 * line reports "no reading", never the one it used to have.
 *
 * All times are SIMULATION seconds. Measuring against the wall clock would
 * report whatever the host managed to render rather than what the line did;
 * EP-CONV-001 recorded a 2.5x error from exactly that mistake.
 */
export function rollingCycleSeconds(
  stampsS: readonly number[],
  nowS: number,
  window = CYCLE_WINDOW,
  staleCycles = STALE_CYCLES,
  minStaleS = MIN_STALE_S,
): number | null {
  if (stampsS.length < 2) return null;

  const used = stampsS.slice(-Math.max(2, window));
  const span = used[used.length - 1] - used[0];
  const intervals = used.length - 1;
  if (!(span > 0) || intervals <= 0) return null;

  const cycle = span / intervals;
  const staleAfterS = Math.max(minStaleS, cycle * staleCycles);
  if (nowS - used[used.length - 1] > staleAfterS) return null;
  return cycle;
}

/**
 * Pieces per hour implied by a cycle time. `null` in, `null` out — a missing
 * cycle time must not silently become a throughput of 0, which would read as
 * "measured, and the answer is nothing".
 */
export function piecesPerHour(cycleS: number | null, piecesPerCarrier: number): number | null {
  if (cycleS === null || !(cycleS > 0)) return null;
  return (3600 / cycleS) * piecesPerCarrier;
}

/** Work in progress held in the buffer, in pieces. */
export function bufferPieces(carriersInBuffer: number, piecesPerCarrier: number): number {
  return Math.max(0, carriersInBuffer) * piecesPerCarrier;
}
