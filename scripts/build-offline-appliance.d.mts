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

export function buildOfflineAppliance(options: OfflineApplianceBuildOptions): Promise<{
  bundleDir: string;
  archive: string | null;
  manifest: Record<string, unknown> & { files: unknown[]; services: string[]; components: OfflineApplianceComponent[] };
}>;
