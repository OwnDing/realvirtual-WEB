export interface ApplianceFileDeclaration {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ApplianceComponentDeclaration {
  id: string;
  version: string;
  license: string;
  licenseFiles: string[];
}

export interface ApplianceDataFormatCompatibility {
  minReadable: number;
  maxReadable: number;
  current: number;
}

export interface ApplianceReleaseCompatibility {
  schemaVersion: 1;
  policy: 'N-2';
  effectiveBaseline: string;
  directUpgrade: {
    sameMajorOnly: true;
    maximumMinorDistance: 2;
    minimumSourceVersion: string;
  };
  bridges: Array<{ sourceBefore: string; via: string }>;
  dataFormats: Record<string, ApplianceDataFormatCompatibility>;
}

export interface ApplianceManifest {
  schemaVersion: 1;
  product: 'xyvirtual-web-appliance';
  version: string;
  target: 'linux-x64' | 'linux-arm64' | 'windows-x64';
  modes: Array<'container' | 'native'>;
  compatibility?: ApplianceReleaseCompatibility;
  services: string[];
  components: ApplianceComponentDeclaration[];
  files: ApplianceFileDeclaration[];
  [key: string]: unknown;
}

export const APPLIANCE_PRODUCT: 'xyvirtual-web-appliance';
export const APPLIANCE_MANIFEST: 'appliance-manifest.json';
export const APPLIANCE_MANIFEST_DIGEST: 'manifest.sha256';
export const SUPPORTED_TARGETS: Set<string>;
export function normalizeBundlePath(value: unknown): string;
export function targetForPlatform(platform?: string, arch?: string): ApplianceManifest['target'] | null;
export function sha256File(path: string): Promise<string>;
export function listBundleFiles(root: string, current?: string, excludes?: Set<string>): Promise<Array<{ path: string; absolute: string; bytes: number }>>;
export function validateManifestShape(manifest: unknown): ApplianceManifest;
export function createFileInventory(root: string): Promise<ApplianceFileDeclaration[]>;
export function verifyBundle(root: string, options?: { expectedTarget?: string; verifyPlatform?: boolean }): Promise<ApplianceManifest>;
