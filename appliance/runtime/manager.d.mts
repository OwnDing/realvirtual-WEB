import type { ApplianceConfig } from './lib/config.mjs';

export interface ManagedRoots { installRoot: string; configRoot: string; stateRoot: string }
export interface NativeServiceDefinition { id: string; unit?: string; wrapper?: string; xml?: string }
export interface ApplianceInstallState {
  schemaVersion: 1;
  installId: string;
  version: string;
  previousVersion: string | null;
  target: string;
  mode: 'container' | 'native';
  origin: string;
  releaseRoot: string;
  [key: string]: unknown;
}

export function buildNativeServiceDefinitions(options: { roots: ManagedRoots; releaseRoot: string; manifest: { target: string }; config: ApplianceConfig }): NativeServiceDefinition[];
export function installOrUpgrade(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Promise<{ state: ApplianceInstallState; roots: ManagedRoots; generatedOperatorPassword: string | null; [key: string]: unknown }>;
export function rollbackAppliance(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Promise<ApplianceInstallState>;
export function backupAppliance(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Promise<string>;
export function restoreAppliance(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Promise<Record<string, unknown>>;
/** Native: control on loopback AND the HTTPS entry; container: the HTTPS entry only (control is on the internal network). */
export function waitForReadiness(
  config: ApplianceConfig, roots: ManagedRoots, timeoutMs?: number,
  fetchImpl?: (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>,
  httpsProbeImpl?: (config: ApplianceConfig, roots: ManagedRoots) => Promise<{ ok: boolean; code: string }>,
  mode?: 'container' | 'native', pauseMs?: number,
): Promise<void>;
export function uninstallAppliance(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Record<string, unknown>;
