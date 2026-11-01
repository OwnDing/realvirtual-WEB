export interface EvidenceProof { path: string; sha256: string; text: string; source?: string }
export interface EvidenceDetails { manifest?: unknown; evidence: EvidenceProof[]; evidenceSource: string }
export interface SupplementalRegistry { texts: Map<string, { sha256: string; source: string; text: string }>; packages: Map<string, { package: string; version: string; integrity: string; text: string; reason: string }>; used: Set<string> }
export function sha256(bytes: string | Uint8Array): string;
export function lockedEntries(lock: unknown, registry?: string): Array<{ path: string; name: string; installedName: string; version: string; integrity: string }>;
export function archiveEvidence(tar: Uint8Array, entry: unknown): unknown;
export function enrichSbom(bom: unknown, inventory: unknown[]): unknown;
export function validateSupplementalEvidence(document: unknown, readText: (name: string) => Uint8Array & { toString(encoding?: string): string }): SupplementalRegistry;
export function applySupplementalEvidence(details: EvidenceDetails, entry: { name?: string; version: string; integrity: string }, registry: SupplementalRegistry | null): EvidenceDetails;
export function collectInventory(root: string, entries: unknown[], cache: string, policy: unknown, supplemental?: SupplementalRegistry | null): Promise<unknown[]>;
