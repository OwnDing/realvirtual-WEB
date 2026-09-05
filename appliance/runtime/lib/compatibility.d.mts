export interface ParsedReleaseVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export interface UpgradeAssessment {
  ok: boolean;
  code: string;
  detail: string;
  bridge?: string | null;
}

export interface DataFormatAssessment extends UpgradeAssessment {
  format?: string;
  current?: number;
}

export function parseReleaseVersion(value: unknown): ParsedReleaseVersion;
export function compareReleaseVersions(left: string | ParsedReleaseVersion, right: string | ParsedReleaseVersion): number;
export function assessReleaseUpgrade(sourceVersion: string | null, candidateVersion: string, compatibility: unknown): UpgradeAssessment;
export function assessDataFormatReadability(writerCompatibility: unknown, readerCompatibility: unknown, options?: { allowUndeclaredWriter?: boolean }): DataFormatAssessment;
export function isRollbackDataCompatible(activeCompatibility: unknown, previousCompatibility: unknown): boolean;
