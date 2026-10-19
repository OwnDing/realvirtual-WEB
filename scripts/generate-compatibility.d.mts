export function generateCompatibility(checkOnly?: boolean): void;
export function generatedCompatibilityFiles(): Map<string, string>;
export function legacyProjection(matrix: any): { schemaVersion: number; browsers: Record<string, { minimumMajor: null; testedMajor: null; level: string }> };
export function matrixTable(matrix: any, locale: 'zh-CN' | 'en-US'): string;
