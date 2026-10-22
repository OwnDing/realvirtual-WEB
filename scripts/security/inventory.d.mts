export function sha256(bytes: string | Uint8Array): string;
export function lockedEntries(lock: unknown, registry?: string): Array<{ path: string; name: string; installedName: string; version: string; integrity: string }>;
export function archiveEvidence(tar: Uint8Array, entry: unknown): unknown;
export function enrichSbom(bom: unknown, inventory: unknown[]): unknown;
export function collectInventory(root: string, entries: unknown[], cache: string, policy: unknown): Promise<unknown[]>;
