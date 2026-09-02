// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import compatibility from '../appliance/release-compatibility.json';
import {
  assessDataFormatReadability,
  assessReleaseUpgrade,
  compareReleaseVersions,
  isRollbackDataCompatible,
} from '../appliance/runtime/lib/compatibility.mjs';

describe('appliance release compatibility', () => {
  it('allows the supported 6.3 to 6.4 path and repeat installs', () => {
    expect(assessReleaseUpgrade('6.3.16', '6.4.0', compatibility).code).toBe('DIRECT_UPGRADE_SUPPORTED');
    expect(assessReleaseUpgrade('6.4.0', '6.4.0', compatibility).code).toBe('REPEAT_INSTALL');
  });

  it('requires a compatibility declaration even for a fresh install candidate', () => {
    expect(assessReleaseUpgrade(null, '6.4.0', null).code).toBe('COMPATIBILITY_DECLARATION_MISSING');
  });

  it('refuses downgrade and names the required bridge for pre-baseline sources', () => {
    expect(assessReleaseUpgrade('6.4.0', '6.3.27', compatibility).code).toBe('DOWNGRADE_REQUIRES_ROLLBACK_OR_RESTORE');
    expect(assessReleaseUpgrade('6.2.9', '6.4.0', compatibility)).toMatchObject({
      ok: false, code: 'UPGRADE_BRIDGE_REQUIRED', bridge: '6.3.16',
    });
  });

  it('enforces N-2 and persisted-format rollback readability', () => {
    expect(assessReleaseUpgrade('6.3.27', '6.6.0', compatibility).code).toBe('SOURCE_OUTSIDE_N_MINUS_2');
    expect(compareReleaseVersions('6.3.27', '6.4.0')).toBeLessThan(0);
    expect(compareReleaseVersions('6.4.0-rc.2', '6.4.0-rc.10')).toBeLessThan(0);
    expect(compareReleaseVersions('6.4.0-rc.10', '6.4.0')).toBeLessThan(0);
    expect(() => compareReleaseVersions('6.4.0-rc.01', '6.4.0')).toThrow(/Invalid release version/);
    expect(isRollbackDataCompatible(compatibility, compatibility)).toBe(true);
    expect(isRollbackDataCompatible(
      { dataFormats: { projectManifest: { minReadable: 1, maxReadable: 3, current: 3 } } },
      compatibility,
    )).toBe(false);
  });

  it('blocks a candidate that cannot read a format written by the source', () => {
    expect(assessDataFormatReadability(
      { dataFormats: { projectManifest: { minReadable: 1, maxReadable: 3, current: 3 } } },
      compatibility,
    )).toMatchObject({ ok: false, code: 'PERSISTED_FORMAT_UNSUPPORTED', format: 'projectManifest' });
    expect(assessDataFormatReadability(null, compatibility, { allowUndeclaredWriter: true }))
      .toMatchObject({ ok: true, code: 'LEGACY_SOURCE_FORMATS_ACCEPTED' });
  });
});
