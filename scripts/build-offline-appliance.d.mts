export interface OfflineApplianceBuildOptions {
  target: 'linux-x64' | 'linux-arm64' | 'windows-x64';
  modes: string;
  dependencyRoot: string;
  dependencyLock: string;
  webDist: string;
  output: string;
  archive: boolean;
  createdAt: string;
}

export function buildOfflineAppliance(options: OfflineApplianceBuildOptions): Promise<{
  bundleDir: string;
  archive: string | null;
  manifest: Record<string, unknown> & { files: unknown[] };
}>;
