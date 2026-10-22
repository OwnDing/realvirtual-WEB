export function validateDatabaseMetadata(metadata: unknown, now?: Date): void;
export function evaluateTrivyReport(report: unknown): { status: string; packages: number; findings: Array<{ severity: string }>; licenses: unknown[] };
export function scanArtifact(kind: string, inputPath: string, toolPath: string, cachePath: string): Promise<{ exitCode: number }>;
