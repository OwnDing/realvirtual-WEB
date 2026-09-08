import type { DeploymentEgressConfig } from './deployment-config';
export declare const EGRESS_PURPOSES: readonly [
  'analytics',
  'news',
  'documentation',
  'legal-link',
  'connect-updates',
  'firebase-demo',
  'github-library',
  'cad-link',
  'remote-model',
  'industrial-interface',
  'multiuser',
  'share',
  'debug-tool',
];


export function canonicalEgressOrigin(value: unknown): string | null;
export function parseEgress(value: unknown, issues: string[]): DeploymentEgressConfig;
