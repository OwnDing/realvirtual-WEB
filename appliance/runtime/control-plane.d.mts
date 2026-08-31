import type { Server } from 'node:http';

export interface HealthService {
  id: string;
  url: string;
  required: boolean;
  method?: string;
}

export interface ControlConfig {
  schemaVersion: 1;
  version: string;
  target: string;
  installId: string;
  bundleRoot: string;
  host: string;
  port: number;
  staticRoot: string;
  probeTimeoutMs: number;
  integrityTtlMs: number;
  services: HealthService[];
  [key: string]: unknown;
}

export function validateControlConfig(raw: unknown): ControlConfig;
export function probeService(service: HealthService, timeoutMs: number, fetchImpl?: typeof fetch): Promise<Record<string, unknown>>;
export function createReadiness(config: ControlConfig, dependencies?: Record<string, unknown>): () => Promise<Record<string, unknown>>;
export function createControlServer(rawConfig: unknown, dependencies?: Record<string, unknown>): Server;
