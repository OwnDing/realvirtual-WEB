import type { BrowserIdentity, Check, CapabilityId, Workflow, Assessment } from './evaluate.mjs';
export interface EnvironmentReport { kind: 'xyvirtual-environment-check'; schemaVersion: 1; generatedAt: string; productVersion: string | null; matrixRevision: string | null; workflow: Workflow; renderer: 'webgl' | 'webgpu' | 'webgpu-gl'; environment: BrowserIdentity; checks: Record<CapabilityId, Check>; assessment: Assessment; }
export function boundedCheck(work: (signal: AbortSignal) => Promise<Check> | Check, signal?: AbortSignal, timeoutMs?: number): Promise<Check>;
export function probeOpfs(storage: Pick<StorageManager, 'getDirectory'> | undefined, signal?: AbortSignal): Promise<Check>;
export function probeWebgl(documentObject?: Document): Check;
export function probeWebgpu(gpu: GPU | undefined, signal?: AbortSignal, documentObject?: Document): Promise<Check>;
export function probeXr(xr: XRSystem | undefined, mode: XRSessionMode, signal?: AbortSignal): Promise<Check>;
export function checkDirectoryPermission(windowObject?: Window): Promise<Check>;
export function runEnvironmentCheck(options: { matrix: unknown; workflow?: Workflow; renderer?: 'webgl' | 'webgpu' | 'webgpu-gl'; signal?: AbortSignal; timeoutMs?: number; directoryPermission?: Check }): Promise<EnvironmentReport>;
