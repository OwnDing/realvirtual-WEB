export type Workflow = 'viewer' | 'browser-project' | 'folder-project' | 'xr-vr' | 'xr-ar' | 'demo-package';
export type SupportLevel = 'supported' | 'limited' | 'experimental' | 'unverified' | 'unsupported';
export type CapabilityId = 'secureContext' | 'webgl2' | 'opfs' | 'directoryPermission' | 'webgpu' | 'xrVr' | 'xrAr';
export interface BrowserIdentity { os: string; osRelease: string | null; arch: string | null; browser: string; version: string | null; major: number | null }
export interface Check { status: 'pass' | 'fail' | 'unknown'; code: string; data?: Record<string, string | number | boolean | null>; }
export interface Assessment { capability: 'satisfied' | 'limited' | 'unknown'; certification: SupportLevel; reasons: string[]; targetId: string | null; matrixRevision: string | null }
export const capabilityIds: CapabilityId[];
export const workflowIds: Workflow[];
export const supportLevels: SupportLevel[];
export function validateMatrix(matrix: unknown): string[];
export function browserIdentity(userAgent?: string, brands?: { brand: string }[]): BrowserIdentity;
export function evaluateCompatibility(matrix: unknown, environment: BrowserIdentity, checks?: Partial<Record<CapabilityId, Check>>, workflow?: Workflow, renderer?: 'webgl' | 'webgpu' | 'webgpu-gl'): Assessment;
