import type { ApplianceConfig } from './config.mjs';

export interface PreflightFinding {
  id: string;
  level: 'required' | 'advisory';
  status: 'pass' | 'warn' | 'fail';
  code: string;
  detail: string;
  data: unknown;
}

export interface PreflightOptions {
  bundleRoot: string;
  configPath: string;
  expectedTarget?: string;
  mode: 'container' | 'native';
  containerRuntime?: string;
  verifyPlatform?: boolean;
  minimumFreeBytes?: number;
  diskPath?: string;
  skipPortChecks?: boolean;
  installedVersion?: string | null;
  installedCompatibility?: unknown;
}

export interface PreflightDependencies {
  verifyBundleImpl?: (root: string, options: { expectedTarget?: string; verifyPlatform?: boolean }) => Promise<Record<string, any>>;
  isAdministratorImpl?: () => Promise<boolean> | boolean;
  lookupImpl?: (name: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>;
  canBindImpl?: (port: number) => Promise<{ ok: boolean; code?: string }>;
  /** Returns the usable container runtime ('docker' | 'podman') for the requested one, or null. */
  containerRuntimeImpl?: (requested: string | undefined) => string | null;
  /** Whether a host command exists (native-mode tool checks such as git). */
  commandExistsImpl?: (command: string) => boolean;
}

export function runPreflight(options: PreflightOptions, dependencies?: PreflightDependencies): Promise<{
  ok: boolean;
  findings: PreflightFinding[];
  manifest: Record<string, any> | null;
  config: ApplianceConfig | null;
}>;
