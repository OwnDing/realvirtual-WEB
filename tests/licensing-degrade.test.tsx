// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * What an expired license actually changes, at the two places a user meets it.
 *
 * The load-bearing assertion in this file is the negative one: past the grace
 * period exactly ONE thing is withheld, and it is not the ability to run the
 * plant.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { decideSaveVerb } from '../src/core/editor/rv-save-document';
import { LicenseNoticeBanner, LicenseWatermark } from '../src/core/hmi/LicenseNoticeBanner';
import { _setLicenseEvaluationForTests } from '../src/core/licensing/rv-lic-store';
import type { LicenseEvaluation, LicenseState } from '../src/core/licensing/rv-lic-state';
import { setLocale } from '../src/core/i18n';

beforeAll(async () => {
  await setLocale('en-US');
});

afterEach(() => {
  cleanup();
});

function evaluation(overrides: Partial<LicenseEvaluation> = {}): LicenseEvaluation {
  return {
    state: 'valid',
    payload: null,
    reason: null,
    daysToExpiry: 100,
    canSave: true,
    watermark: false,
    mismatch: null,
    clockRollback: false,
    ...overrides,
  };
}

const WRITABLE_BACKEND = { kind: 'opfs', writable: true } as never;

describe('the save chokepoint', () => {
  it('leaves saving alone while the license allows it', () => {
    const decision = decideSaveVerb(
      { lineage: 'scene', open: true, transient: false },
      WRITABLE_BACKEND,
      true,
    );
    expect(decision.verb).toBe('save');
  });

  it('blocks with a reason once the license withholds saving', () => {
    const decision = decideSaveVerb(
      { lineage: 'scene', open: true, transient: false },
      WRITABLE_BACKEND,
      false,
    );
    expect(decision.verb).toBe('blocked');
    expect(decision.reason).toContain('cannot be saved');
    // The sentence has to say what still works, or an operator reads a blocked
    // Save button as "the HMI is dying".
    expect(decision.reason).toContain('device control are unaffected');
  });

  it('answers before the backend refusals, so it never makes a false promise', () => {
    // With no project open AND an expired license, "open or create one to
    // save" would send the user to open a project and hit the same refusal.
    const decision = decideSaveVerb(
      { lineage: 'scene', open: true, transient: false },
      null,
      false,
    );
    expect(decision.verb).toBe('blocked');
    expect(decision.reason).not.toContain('No project is open');
    expect(decision.reason).toContain('cannot be saved');
  });

  it('still reports nothing-open ahead of the license', () => {
    const decision = decideSaveVerb(
      { lineage: 'scene', open: false, transient: false },
      WRITABLE_BACKEND,
      false,
    );
    expect(decision.reason).toBe('Nothing is open.');
  });
});

describe('the notice banner', () => {
  const silent: LicenseState[] = ['not-required', 'valid'];
  const speaks: LicenseState[] = [
    'expiring', 'grace', 'readonly', 'mismatch', 'unverifiable', 'invalid', 'absent',
  ];

  for (const state of silent) {
    it(`says nothing in ${state}`, () => {
      act(() => _setLicenseEvaluationForTests(evaluation({ state })));
      render(<LicenseNoticeBanner />);
      expect(screen.queryByTestId('license-notice-banner')).toBeNull();
    });
  }

  for (const state of speaks) {
    it(`explains ${state}`, () => {
      act(() => _setLicenseEvaluationForTests(evaluation({
        state,
        daysToExpiry: state === 'expiring' ? 12 : -12,
        canSave: state !== 'readonly',
        mismatch: state === 'mismatch'
          ? { kind: 'install-id', expected: 'XYV-INST-AAAAAAAA', actual: 'XYV-INST-BBBBBBBB' }
          : null,
      })));
      render(<LicenseNoticeBanner />);
      expect(screen.getByTestId('license-notice-banner').textContent).toBeTruthy();
    });
  }

  it('names both sides of a binding mismatch', () => {
    act(() => _setLicenseEvaluationForTests(evaluation({
      state: 'mismatch',
      mismatch: { kind: 'host', expected: ['hmi.acme.local'], actual: 'other.acme.local' },
    })));
    render(<LicenseNoticeBanner />);
    const text = screen.getByTestId('license-notice-banner').textContent ?? '';
    expect(text).toContain('hmi.acme.local');
    expect(text).toContain('other.acme.local');
  });

  it('adds the clock note without changing the headline', () => {
    act(() => _setLicenseEvaluationForTests(evaluation({
      state: 'grace', daysToExpiry: -3, clockRollback: true,
    })));
    render(<LicenseNoticeBanner />);
    expect(screen.getByTestId('license-notice-banner').textContent).toContain('system clock');
  });

  it('tells the operator the line keeps running, in every state that speaks', () => {
    for (const state of speaks) {
      cleanup();
      act(() => _setLicenseEvaluationForTests(evaluation({
        state,
        daysToExpiry: state === 'expiring' ? 12 : -12,
        mismatch: state === 'mismatch'
          ? { kind: 'install-id', expected: 'A', actual: 'B' }
          : null,
      })));
      render(<LicenseNoticeBanner />);
      const text = (screen.getByTestId('license-notice-banner').textContent ?? '').toLowerCase();
      const reassures = text.includes('unaffected')
        || text.includes('nothing is restricted')
        || text.includes('nothing stops');
      expect(reassures, `${state}: "${text}"`).toBe(true);
    }
  });
});

describe('the watermark', () => {
  it('appears only once the term has lapsed or the evidence is missing', () => {
    const cases: Array<[LicenseState, boolean]> = [
      ['not-required', false], ['valid', false], ['expiring', false], ['mismatch', false],
      ['grace', true], ['readonly', true], ['unverifiable', true], ['invalid', true], ['absent', true],
    ];
    for (const [state, expected] of cases) {
      cleanup();
      act(() => _setLicenseEvaluationForTests(evaluation({ state, watermark: expected })));
      render(<LicenseWatermark />);
      expect(Boolean(screen.queryByTestId('license-watermark')), state).toBe(expected);
    }
  });

  it('never intercepts a click', () => {
    act(() => _setLicenseEvaluationForTests(evaluation({ state: 'readonly', watermark: true })));
    render(<LicenseWatermark />);
    const mark = screen.getByTestId('license-watermark');
    expect(getComputedStyle(mark).pointerEvents).toBe('none');
  });
});
