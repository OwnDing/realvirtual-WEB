import type { PerformancePackage } from '../../src/core/engine/rv-performance-package';
export function prepareModel(
  input: string,
  output?: string,
): Promise<{
  manifest: PerformancePackage;
  report: {
    sourceBytes: number;
    parts: number;
    previewBytes: number;
    withinPreviewBudget: boolean;
    skipped: { nodeIndex: number; primitiveIndex: number; reason: string }[];
  };
}>;
