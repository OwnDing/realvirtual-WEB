// SPDX-License-Identifier: AGPL-3.0-only

const CORE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function validSemverIdentifiers(value, { prerelease = false } = {}) {
  if (value === undefined) return true;
  return value.split('.').every((identifier) => {
    if (!identifier || !/^[0-9A-Za-z-]+$/.test(identifier)) return false;
    return !prerelease || !/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0');
  });
}

export function parseReleaseVersion(value) {
  const match = CORE_SEMVER.exec(String(value ?? ''));
  if (!match || !validSemverIdentifiers(match[4], { prerelease: true }) || !validSemverIdentifiers(match[5])) {
    throw new Error(`Invalid release version: ${value}`);
  }
  return {
    raw: String(value),
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function compareReleaseVersions(left, right) {
  const a = typeof left === 'string' ? parseReleaseVersion(left) : left;
  const b = typeof right === 'string' ? parseReleaseVersion(right) : right;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const aParts = a.prerelease.split('.');
  const bParts = b.prerelease.split('.');
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index++) {
    if (aParts[index] === undefined) return -1;
    if (bParts[index] === undefined) return 1;
    if (aParts[index] === bParts[index]) continue;
    const aNumeric = /^\d+$/.test(aParts[index]);
    const bNumeric = /^\d+$/.test(bParts[index]);
    if (aNumeric && bNumeric) {
      if (aParts[index].length !== bParts[index].length) return aParts[index].length < bParts[index].length ? -1 : 1;
      return aParts[index] < bParts[index] ? -1 : 1;
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    // SemVer requires ASCII lexical ordering, not locale-sensitive collation.
    return aParts[index] < bParts[index] ? -1 : 1;
  }
  return 0;
}

function bridgeFor(sourceVersion, compatibility) {
  const source = parseReleaseVersion(sourceVersion);
  return (compatibility.bridges ?? []).find((bridge) => {
    const via = parseReleaseVersion(bridge.via);
    return source.major === via.major && compareReleaseVersions(source, bridge.sourceBefore) < 0;
  }) ?? null;
}

/**
 * Pure upgrade decision shared by preflight and the lifecycle manager.
 * `ok:false` is always a refusal before any managed state is written.
 */
export function assessReleaseUpgrade(sourceVersion, candidateVersion, compatibility) {
  const direct = compatibility?.directUpgrade;
  if (!compatibility || compatibility.schemaVersion !== 1 || !direct) {
    return { ok: false, code: 'COMPATIBILITY_DECLARATION_MISSING', detail: 'Candidate does not declare a supported upgrade path.' };
  }
  if (!sourceVersion) {
    return { ok: true, code: 'FRESH_INSTALL', detail: `Fresh install of ${candidateVersion}.` };
  }
  const source = parseReleaseVersion(sourceVersion);
  const candidate = parseReleaseVersion(candidateVersion);
  const ordering = compareReleaseVersions(source, candidate);
  if (ordering === 0) {
    return { ok: true, code: 'REPEAT_INSTALL', detail: `${candidateVersion} is already installed.` };
  }
  if (ordering > 0) {
    return {
      ok: false,
      code: 'DOWNGRADE_REQUIRES_ROLLBACK_OR_RESTORE',
      detail: `Refusing downgrade from ${sourceVersion} to ${candidateVersion}; use rollback or restore with a verified backup.`,
    };
  }

  if (direct.sameMajorOnly && source.major !== candidate.major) {
    const bridge = bridgeFor(sourceVersion, compatibility);
    return {
      ok: false,
      code: bridge ? 'UPGRADE_BRIDGE_REQUIRED' : 'SOURCE_VERSION_UNSUPPORTED',
      detail: bridge
        ? `Install bridge release ${bridge.via} before ${candidateVersion}.`
        : `Direct major-version upgrade from ${sourceVersion} to ${candidateVersion} is not supported.`,
      bridge: bridge?.via ?? null,
    };
  }
  if (compareReleaseVersions(source, direct.minimumSourceVersion) < 0) {
    const bridge = bridgeFor(sourceVersion, compatibility);
    return {
      ok: false,
      code: bridge ? 'UPGRADE_BRIDGE_REQUIRED' : 'SOURCE_VERSION_UNSUPPORTED',
      detail: bridge
        ? `Install bridge release ${bridge.via} before ${candidateVersion}.`
        : `The earliest direct source for ${candidateVersion} is ${direct.minimumSourceVersion}.`,
      bridge: bridge?.via ?? null,
    };
  }
  if (candidate.minor - source.minor > direct.maximumMinorDistance) {
    return {
      ok: false,
      code: 'SOURCE_OUTSIDE_N_MINUS_2',
      detail: `${sourceVersion} is outside the N-${direct.maximumMinorDistance} direct-upgrade window for ${candidateVersion}.`,
    };
  }
  return { ok: true, code: 'DIRECT_UPGRADE_SUPPORTED', detail: `${sourceVersion} → ${candidateVersion} is supported.` };
}

export function isRollbackDataCompatible(activeCompatibility, previousCompatibility) {
  return assessDataFormatReadability(activeCompatibility, previousCompatibility).ok;
}

/** Determine whether a reader release can consume every format written by the source release. */
export function assessDataFormatReadability(writerCompatibility, readerCompatibility, options = {}) {
  const readerFormats = readerCompatibility?.dataFormats;
  if (!readerFormats || typeof readerFormats !== 'object') {
    return { ok: false, code: 'PERSISTED_FORMAT_UNSUPPORTED', detail: 'Reader does not declare persisted-format compatibility.' };
  }
  const writerFormats = writerCompatibility?.dataFormats;
  if (!writerFormats || typeof writerFormats !== 'object') {
    return options.allowUndeclaredWriter
      ? { ok: true, code: 'LEGACY_SOURCE_FORMATS_ACCEPTED', detail: 'Legacy source formats are accepted through the declared release baseline and fixtures.' }
      : { ok: false, code: 'PERSISTED_FORMAT_UNSUPPORTED', detail: 'Writer does not declare its persisted formats.' };
  }
  for (const [id, writer] of Object.entries(writerFormats)) {
    const reader = readerFormats[id];
    if (!writer || typeof writer !== 'object' || !reader || typeof reader !== 'object' ||
      !Number.isSafeInteger(writer.current) || !Number.isSafeInteger(reader.minReadable) || !Number.isSafeInteger(reader.maxReadable) ||
      writer.current > reader.maxReadable || writer.current < reader.minReadable) {
      return {
        ok: false,
        code: 'PERSISTED_FORMAT_UNSUPPORTED',
        detail: `Reader cannot consume ${id} format ${writer?.current ?? 'unknown'}.`,
        format: id,
        current: writer?.current,
      };
    }
  }
  return { ok: true, code: 'PERSISTED_FORMATS_SUPPORTED', detail: 'Candidate can read every persisted format written by the source release.' };
}
