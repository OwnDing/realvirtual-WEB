export interface Site { id: string; file: string; text: string; occurrence: number }
export interface Review extends Site { classification: string; rationale: string; evidence: string[]; owner: string; followup?: string }
export function errorSites(findings: {category: string; file: string; text: string}[]): Site[];
export function validateTriage(sites: Site[], registry: {sites: Review[]}): string[];
export function checkErrorBoundaries(): Record<string, number>;
