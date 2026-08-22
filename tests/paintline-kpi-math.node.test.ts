// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * EP-DEMO-002 M1 — the paint line's KPI arithmetic.
 *
 * The point of these is the HONESTY rules, not the averages. A KPI that keeps
 * showing its last reading after the line stops is indistinguishable from a
 * live one, and a missing cycle time that silently becomes a throughput of 0
 * reads as "measured, and the answer is nothing". Both are the decorative-number
 * failure `AGENTS.md` P0 forbids, and neither throws.
 */

import { describe, it, expect } from 'vitest';
import {
  CYCLE_WINDOW,
  MIN_STALE_S,
  STALE_CYCLES,
  bufferPieces,
  crossedDown,
  piecesPerHour,
  rollingCycleSeconds,
} from '@rv/plugins/models/DemoPaintLine/paintline-kpi-math';

describe('crossing detection', () => {
  it('counts a carrier moving down through the plane', () => {
    expect(crossedDown(7.4, 6.9, 7)).toBe(true);
  });

  it('ignores a carrier moving the other way', () => {
    // The return sweep runs -X; anything travelling +X past the plane is on a
    // different leg and must not be counted.
    expect(crossedDown(6.9, 7.4, 7)).toBe(false);
  });

  it('does not count a carrier parked exactly on the plane twice', () => {
    // Inclusive on arrival, strict on departure: the tick it lands counts, the
    // ticks it sits there do not.
    expect(crossedDown(7.2, 7.0, 7)).toBe(true);
    expect(crossedDown(7.0, 7.0, 7)).toBe(false);
    expect(crossedDown(7.0, 6.8, 7)).toBe(false);
  });

  it('ignores movement that stays on one side', () => {
    expect(crossedDown(9, 8, 7)).toBe(false);
    expect(crossedDown(3, 2, 7)).toBe(false);
  });
});

describe('rolling cycle time', () => {
  it('has no reading before two crossings exist', () => {
    expect(rollingCycleSeconds([], 0)).toBeNull();
    expect(rollingCycleSeconds([10], 10)).toBeNull();
  });

  it('averages the interval between crossings', () => {
    expect(rollingCycleSeconds([0, 5, 10, 15], 15)).toBeCloseTo(5, 9);
  });

  it('uses only the newest window', () => {
    // Ancient 1 s intervals must not drag a line now running at 10 s.
    const stamps = [0, 1, 2, 3, 4, 5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
    expect(rollingCycleSeconds(stamps, 95, 4)).toBeCloseTo(10, 9);
  });

  it('reports NO reading once the line goes quiet', () => {
    // The single rule that keeps a stopped line from looking like it is
    // producing: past the staleness window there is no current cycle time.
    const stamps = [0, 20, 40];           // 20 s cycle → 60 s window
    expect(rollingCycleSeconds(stamps, 40 + 59)).toBeCloseTo(20, 9);
    expect(rollingCycleSeconds(stamps, 40 + 61)).toBeNull();
  });

  it('scales the staleness window with the measured cadence', () => {
    // A slow line is not "stopped" just because a fast line would have been.
    const slow = [0, 60, 120];            // 60 s cycle → 180 s window
    expect(rollingCycleSeconds(slow, 120 + 170)).toBeCloseTo(60, 9);
    expect(rollingCycleSeconds(slow, 120 + 190)).toBeNull();
    expect(STALE_CYCLES).toBeGreaterThan(1);
  });

  it('keeps a floor so a very fast line does not flicker', () => {
    // 0.5 s cycle x 3 would be a 1.5 s window — one hiccup and the tile blanks.
    const fast = [0, 0.5, 1];
    expect(rollingCycleSeconds(fast, 1 + MIN_STALE_S - 1)).toBeCloseTo(0.5, 9);
    expect(rollingCycleSeconds(fast, 1 + MIN_STALE_S + 1)).toBeNull();
  });

  it('never divides by a zero span', () => {
    // Two carriers counted on the same tick (possible when a queue releases)
    // must not produce Infinity.
    expect(rollingCycleSeconds([12, 12], 12)).toBeNull();
  });

  it('defaults to a window that spans several crossings', () => {
    expect(CYCLE_WINDOW).toBeGreaterThan(2);
  });
});

describe('throughput', () => {
  it('converts a cycle time into pieces per hour', () => {
    // One hanger every 6 s, two pieces each → 1200 pieces/h.
    expect(piecesPerHour(6, 2)).toBeCloseTo(1200, 9);
  });

  it('propagates "no reading" instead of reporting zero', () => {
    expect(piecesPerHour(null, 2)).toBeNull();
    expect(piecesPerHour(0, 2)).toBeNull();
    expect(piecesPerHour(-1, 2)).toBeNull();
  });
});

describe('buffer WIP', () => {
  it('counts pieces, not hangers', () => {
    expect(bufferPieces(9, 2)).toBe(18);
  });

  it('never goes negative', () => {
    expect(bufferPieces(-3, 2)).toBe(0);
  });
});
