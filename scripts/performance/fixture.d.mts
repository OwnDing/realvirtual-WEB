export function createPerformanceFixture(
  path: string,
  count?: number,
  segments?: number,
): Promise<{ nodes: number; triangles: number }>;
