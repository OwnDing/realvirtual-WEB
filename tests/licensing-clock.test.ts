// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RV_LIC_CLOCK_TOLERANCE_MS,
  readLicenseClock,
  recordLicenseClock,
} from '../src/core/licensing/rv-lic-clock';
import { LICENSE_CLOCK_KEY } from '../src/core/hmi/rv-storage-keys';

const ISSUED_AT = Date.parse('2026-01-01T00:00:00Z');
const LATER = Date.parse('2026-06-01T00:00:00Z');

beforeEach(() => {
  localStorage.removeItem(LICENSE_CLOCK_KEY);
});

afterEach(() => {
  // Unstub BEFORE touching storage: a test that stubbed it to throw would
  // otherwise fail in cleanup rather than in its assertion.
  vi.unstubAllGlobals();
  localStorage.removeItem(LICENSE_CLOCK_KEY);
});

describe('effectiveNow floors', () => {
  it('uses the wall clock when it is the latest source', () => {
    const clock = readLicenseClock(ISSUED_AT, LATER);
    expect(clock.effectiveNow).toBe(LATER);
    expect(clock.wallNow).toBe(LATER);
    expect(clock.clockRollback).toBe(false);
  });

  it('falls back to issuedAt when the machine clock is set to 1970', () => {
    // The naive attack, and the reason issuedAt is a floor at all: it needs no
    // storage and cannot be cleared, so it survives a fresh profile.
    const clock = readLicenseClock(ISSUED_AT, 0);
    expect(clock.effectiveNow).toBe(ISSUED_AT);
    expect(clock.wallNow).toBe(0);
  });

  it('uses the high-water mark when it is ahead of both', () => {
    recordLicenseClock(LATER);
    const clock = readLicenseClock(ISSUED_AT, ISSUED_AT + 1000);
    expect(clock.effectiveNow).toBe(LATER);
  });

  it('has no floor at all without a license or a mark', () => {
    expect(readLicenseClock(null, LATER).effectiveNow).toBe(LATER);
  });
});

describe('the high-water mark', () => {
  it('never moves backwards', () => {
    recordLicenseClock(LATER);
    recordLicenseClock(ISSUED_AT);
    expect(Number(localStorage.getItem(LICENSE_CLOCK_KEY))).toBe(LATER);
  });

  it('advances when time moves on', () => {
    recordLicenseClock(ISSUED_AT);
    recordLicenseClock(LATER);
    expect(Number(localStorage.getItem(LICENSE_CLOCK_KEY))).toBe(LATER);
  });

  it('ignores a corrupted value rather than throwing', () => {
    localStorage.setItem(LICENSE_CLOCK_KEY, 'not a number');
    const clock = readLicenseClock(null, LATER);
    expect(clock.effectiveNow).toBe(LATER);
    expect(clock.clockUnanchored).toBe(false);
  });
});

describe('rollback detection', () => {
  it('reports a wall clock well behind the mark', () => {
    recordLicenseClock(LATER);
    const clock = readLicenseClock(null, LATER - 10 * RV_LIC_CLOCK_TOLERANCE_MS);
    expect(clock.clockRollback).toBe(true);
    // Reported, never punished: the floor still holds the state machine steady.
    expect(clock.effectiveNow).toBe(LATER);
  });

  it('tolerates ordinary drift', () => {
    recordLicenseClock(LATER);
    expect(readLicenseClock(null, LATER - 1000).clockRollback).toBe(false);
    expect(readLicenseClock(null, LATER - RV_LIC_CLOCK_TOLERANCE_MS + 1).clockRollback).toBe(false);
  });

  it('reports nothing on a first run', () => {
    expect(readLicenseClock(null, LATER).clockRollback).toBe(false);
  });
});

describe('unusable storage', () => {
  it('degrades to unanchored instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('site data blocked'); },
      setItem() { throw new Error('site data blocked'); },
      removeItem() { throw new Error('site data blocked'); },
    });
    const clock = readLicenseClock(ISSUED_AT, 0);
    expect(clock.clockUnanchored).toBe(true);
    // The issuedAt floor does not depend on storage, so it still applies.
    expect(clock.effectiveNow).toBe(ISSUED_AT);
    expect(() => recordLicenseClock(LATER)).not.toThrow();
  });
});
