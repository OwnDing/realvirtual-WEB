// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import {
  evaluateLicense,
  matchesHost,
  type LicenseEvalContext,
  type LicenseState,
} from '../src/core/licensing/rv-lic-state';
import type { LicenseClock } from '../src/core/licensing/rv-lic-clock';
import type { LicensePayload, LicenseVerification } from '../src/core/licensing/rv-lic-types';
import { validateDeploymentConfig } from '../src/core/deployment/deployment-config';

const DAY = 24 * 60 * 60 * 1000;
const NOT_AFTER = Date.parse('2027-01-01T00:00:00Z');

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    id: 'XYV-LIC-2026-0001',
    issuedAt: '2026-01-01T00:00:00Z',
    notAfter: '2027-01-01T00:00:00Z',
    graceDays: 30,
    features: [],
    ...overrides,
  };
}

function clock(effectiveNow: number, extra: Partial<LicenseClock> = {}): LicenseClock {
  return {
    effectiveNow,
    wallNow: effectiveNow,
    clockRollback: false,
    clockUnanchored: false,
    ...extra,
  };
}

function valid(p: LicensePayload = payload()): LicenseVerification {
  return { state: 'valid', payload: p, reason: null };
}

function context(overrides: Partial<LicenseEvalContext> = {}): LicenseEvalContext {
  return {
    required: true,
    verification: valid(),
    clock: clock(NOT_AFTER - 100 * DAY),
    hostname: 'hmi.acme.local',
    ...overrides,
  };
}

describe('license decision order', () => {
  it('stays inert when the deployment did not ask for a license', () => {
    const result = evaluateLicense(context({ required: false, verification: null }));
    expect(result.state).toBe('not-required');
    expect(result.watermark).toBe(false);
    expect(result.canSave).toBe(true);
  });

  it('reports absent when a required license could not be loaded', () => {
    expect(evaluateLicense(context({ verification: null })).state).toBe('absent');
  });

  it('keeps unverifiable separate from invalid', () => {
    const unverifiable = evaluateLicense(context({
      verification: { state: 'unverifiable', payload: null, reason: 'no-crypto' },
    }));
    expect(unverifiable.state).toBe('unverifiable');
    expect(unverifiable.reason).toBe('no-crypto');

    const invalid = evaluateLicense(context({
      verification: { state: 'invalid', payload: null, reason: 'signature-mismatch' },
    }));
    expect(invalid.state).toBe('invalid');
  });
});

describe('license expiry boundaries', () => {
  const cases: Array<[string, number, LicenseState]> = [
    ['well before expiry', NOT_AFTER - 100 * DAY, 'valid'],
    ['exactly at the reminder boundary', NOT_AFTER - 30 * DAY, 'valid'],
    ['one ms inside the reminder window', NOT_AFTER - 30 * DAY + 1, 'expiring'],
    ['one second before expiry', NOT_AFTER - 1000, 'expiring'],
    ['exactly at expiry', NOT_AFTER, 'expiring'],
    ['one ms past expiry', NOT_AFTER + 1, 'grace'],
    ['mid grace', NOT_AFTER + 15 * DAY, 'grace'],
    ['exactly at the end of grace', NOT_AFTER + 30 * DAY, 'grace'],
    ['one ms past grace', NOT_AFTER + 30 * DAY + 1, 'readonly'],
    ['long past grace', NOT_AFTER + 400 * DAY, 'readonly'],
  ];

  for (const [label, now, expected] of cases) {
    it(`is ${expected} ${label}`, () => {
      expect(evaluateLicense(context({ clock: clock(now) })).state).toBe(expected);
    });
  }

  it('honours a shorter grace period from the payload', () => {
    const short = valid(payload({ graceDays: 0 }));
    expect(evaluateLicense(context({ verification: short, clock: clock(NOT_AFTER + 1) })).state)
      .toBe('readonly');
  });

  it('counts remaining days for display', () => {
    expect(evaluateLicense(context({ clock: clock(NOT_AFTER - 10 * DAY) })).daysToExpiry).toBe(10);
    expect(evaluateLicense(context({ clock: clock(NOT_AFTER + 10 * DAY) })).daysToExpiry).toBe(-10);
  });
});

describe('the red line: only readonly withholds anything', () => {
  const states: Array<[LicenseState, LicenseEvalContext]> = [
    ['not-required', context({ required: false, verification: null })],
    ['valid', context()],
    ['expiring', context({ clock: clock(NOT_AFTER - DAY) })],
    ['grace', context({ clock: clock(NOT_AFTER + DAY) })],
    ['readonly', context({ clock: clock(NOT_AFTER + 90 * DAY) })],
    ['mismatch', context({ verification: valid(payload({ binding: { installId: 'XYV-INST-OTHER01' } })) })],
    ['unverifiable', context({ verification: { state: 'unverifiable', payload: null, reason: 'no-crypto' } })],
    ['invalid', context({ verification: { state: 'invalid', payload: null, reason: 'signature-mismatch' } })],
    ['absent', context({ verification: null })],
  ];

  for (const [expected, ctx] of states) {
    it(`${expected} allows saving unless it is readonly`, () => {
      const result = evaluateLicense(ctx);
      expect(result.state).toBe(expected);
      expect(result.canSave).toBe(expected !== 'readonly');
    });
  }

  it('shows the watermark from grace onwards and whenever evidence is missing', () => {
    const watermarked = new Set(['grace', 'readonly', 'unverifiable', 'invalid', 'absent']);
    for (const [expected, ctx] of states) {
      expect(evaluateLicense(ctx).watermark, expected).toBe(watermarked.has(expected));
    }
  });
});

describe('binding is compared, not enforced', () => {
  it('reports an install id mismatch with both sides', () => {
    const result = evaluateLicense(context({
      verification: valid(payload({ binding: { installId: 'XYV-INST-9F2A4C81' } })),
      installId: 'XYV-INST-DIFFERENT',
    }));
    expect(result.state).toBe('mismatch');
    expect(result.mismatch).toEqual({
      kind: 'install-id',
      expected: 'XYV-INST-9F2A4C81',
      actual: 'XYV-INST-DIFFERENT',
    });
    expect(result.canSave).toBe(true);
  });

  it('accepts a matching install id', () => {
    expect(evaluateLicense(context({
      verification: valid(payload({ binding: { installId: 'XYV-INST-9F2A4C81' } })),
      installId: 'XYV-INST-9F2A4C81',
    })).state).toBe('valid');
  });

  it('reports a host mismatch', () => {
    const result = evaluateLicense(context({
      verification: valid(payload({ binding: { hosts: ['hmi.acme.local'] } })),
      hostname: 'other.acme.local',
    }));
    expect(result.state).toBe('mismatch');
    expect(result.mismatch).toMatchObject({ kind: 'host', actual: 'other.acme.local' });
  });

  it('checks both dimensions, so either one can fail it', () => {
    const binding = { installId: 'XYV-INST-9F2A4C81', hosts: ['hmi.acme.local'] };
    expect(evaluateLicense(context({
      verification: valid(payload({ binding })),
      installId: 'XYV-INST-9F2A4C81',
      hostname: 'hmi.acme.local',
    })).state).toBe('valid');
    expect(evaluateLicense(context({
      verification: valid(payload({ binding })),
      installId: 'XYV-INST-9F2A4C81',
      hostname: 'wrong.acme.local',
    })).state).toBe('mismatch');
    expect(evaluateLicense(context({
      verification: valid(payload({ binding })),
      installId: undefined,
      hostname: 'hmi.acme.local',
    })).state).toBe('mismatch');
  });
});

describe('host pattern matching', () => {
  it('matches exactly, and case-insensitively', () => {
    expect(matchesHost('hmi.acme.local', 'hmi.acme.local')).toBe(true);
    expect(matchesHost('HMI.Acme.Local', 'hmi.acme.local')).toBe(true);
    expect(matchesHost('hmi.acme.local', 'hmi.acme.localhost')).toBe(false);
  });

  it('lets one wildcard consume exactly one label', () => {
    expect(matchesHost('*.plant.example.com', 'hmi.plant.example.com')).toBe(true);
    expect(matchesHost('*.plant.example.com', 'plant.example.com')).toBe(false);
    expect(matchesHost('*.plant.example.com', 'a.b.plant.example.com')).toBe(false);
  });

  it('does not match loopback implicitly', () => {
    expect(matchesHost('*.acme.local', 'localhost')).toBe(false);
    expect(matchesHost('localhost', 'localhost')).toBe(true);
  });
});

describe('clock rollback is carried, never punished', () => {
  it('surfaces the flag without changing the state', () => {
    const result = evaluateLicense(context({
      clock: clock(NOT_AFTER - 100 * DAY, { wallNow: 0, clockRollback: true }),
    }));
    expect(result.state).toBe('valid');
    expect(result.clockRollback).toBe(true);
    expect(result.canSave).toBe(true);
  });
});

describe('deployment config license section', () => {
  it('defaults to not required, with the default path', () => {
    const { config } = validateDeploymentConfig({});
    expect(config.license).toEqual({ required: false, path: 'license.rvlic' });
  });

  it('accepts a relative path and a well-formed install id', () => {
    const { config } = validateDeploymentConfig({
      license: { required: true, path: 'licenses/plant-1.rvlic', installId: 'XYV-INST-9F2A4C81' },
    });
    expect(config.license).toEqual({
      required: true,
      path: 'licenses/plant-1.rvlic',
      installId: 'XYV-INST-9F2A4C81',
    });
  });

  it('refuses to take the license from another origin', () => {
    const { config, issues } = validateDeploymentConfig({
      license: { required: true, path: 'https://licenses.example.com/plant-1.rvlic' },
    });
    expect(config.license?.path).toBe('license.rvlic');
    expect(issues.join(' ')).toContain('license.path');
  });

  it('ignores a malformed install id and says so', () => {
    const { config, issues } = validateDeploymentConfig({ license: { required: true, installId: 'short' } });
    expect(config.license?.installId).toBeUndefined();
    expect(issues.join(' ')).toContain('license.installId');
  });

  it('treats anything other than true as not required', () => {
    for (const required of ['true', 1, {}, null, undefined]) {
      const { config } = validateDeploymentConfig({ license: { required } });
      expect(config.license?.required, JSON.stringify(required)).toBe(false);
    }
  });

  it('is idempotent, because the config is validated twice per boot', () => {
    const raw = { license: { required: true, path: 'a/b.rvlic', installId: 'XYV-INST-9F2A4C81' } };
    const once = validateDeploymentConfig(raw);
    // The generic cannot consume its own output type without a cast; the
    // runtime behaviour is the point of the test, not the signature.
    const twice = validateDeploymentConfig({ ...once.config } as Record<string, unknown>);
    expect(twice.config.license).toEqual(once.config.license);
    expect(twice.issues).toEqual([]);
  });

  it('drops the license section when the schema version is unsupported', () => {
    const { config } = validateDeploymentConfig({ schemaVersion: 99, license: { required: true } });
    expect(config.license).toBeUndefined();
  });
});
