export interface LicenseDecision { status: 'allow' | 'review' | 'deny'; reason?: string; selected?: string }
export function validatePolicy(policy: unknown): unknown;
export function licenseDecision(expression: unknown, policy: unknown): LicenseDecision;
export function validateExceptions(document: unknown, now?: Date): unknown[];
export function evaluateAudit(audit: unknown, entries: unknown[], policy: unknown, exceptions?: unknown[], triage?: unknown[], now?: Date, release?: boolean): { status: 'passed' | 'failed'; findings: unknown[] };
export function evaluateLicenses(entries: unknown[], policy: unknown): { status: 'passed' | 'failed'; findings: unknown[] };
