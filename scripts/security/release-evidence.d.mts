export interface Artifact { path: string; bytes: number; sha256: string }
export function artifactInventory(directory: string): Promise<Artifact[]>;
export function verifyArtifactInventory(expected: unknown, actual: Artifact[]): void;
export function verifyReleaseEvidence(report: unknown, scan: unknown, actual: Artifact[], policy: unknown, now?: Date): void;
export function collectReleaseEvidence(root: string, directory: string, target: string): Promise<unknown>;
