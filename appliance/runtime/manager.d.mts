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
export function uninstallAppliance(options: Record<string, unknown>, dependencies?: Record<string, unknown>): Record<string, unknown>;
