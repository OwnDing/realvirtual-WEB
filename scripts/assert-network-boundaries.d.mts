export interface NetworkSink { file: string; api: string; fingerprint: string; line: number; expression: string }
export function collectNetworkSinks(file: string, source: string): NetworkSink[];
export function inspectNetworkBoundaries(repoRoot?: string): NetworkSink[];
export function assertNetworkBoundaries(sinks: NetworkSink[], reviewed: Array<{ file: string; api: string; fingerprint: string; reason: string }>): void;
