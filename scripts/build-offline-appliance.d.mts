export interface OfflineApplianceBuildOptions {
  target: 'linux-x64' | 'linux-arm64' | 'windows-x64';
  modes: string;
  dependencyRoot: string;
  dependencyLock: string;
  webDist: string;
  output: string;
  archive: boolean;
  createdAt: string;
  /** Production install of gateway/ (npm ci --omit=dev); defaults to the repository's gateway/. */
  gatewayRoot?: string;
}

export interface OfflineApplianceComponent {
  id: string;
  version: string;
  license: string;
  licenseFiles: string[];
}

/** Entry list of a .tar.gz read by the builder's own ustar/pax/GNU parser (no platform tar). */
export function readArchiveEntries(archive: string): Promise<{ files: string[]; directories: string[]; violations: string[] }>;

/** Throws unless the archive holds exactly `rootName/<path>` for each expected path, with no metadata records or links. */
export function assertArchiveMatchesBundle(archive: string, rootName: string, expectedPaths: string[]): Promise<{ files: number; directories: number }>;

export function buildOfflineAppliance(options: OfflineApplianceBuildOptions): Promise<{
  bundleDir: string;
  archive: string | null;
  manifest: Record<string, unknown> & { files: unknown[]; services: string[]; components: OfflineApplianceComponent[] };
}>;
