export interface LicenseDecision { status: 'allow' | 'review' | 'deny'; reason?: string; selected?: string }
export interface LicenseDecisionRecord { id: string; package: string; version: string; integrity: string; license: string; decision: 'accept'; rationale: string; obligations: string; tracking: string; owner: string; approvedBy: string; approval: string; createdAt: string }
export interface LicenseFinding { package: string; version: string; path: string; declared: string | null; selected: string | null; status: 'passed' | 'failed'; reasons: string[]; decision: string | null; obligations: string | null; evidenceSource: string | null }
export function validatePolicy(policy: unknown): unknown;
export function licenseDecision(expression: unknown, policy: unknown): LicenseDecision;
export function validateExceptions(document: unknown, now?: Date): unknown[];
export function validateLicenseDecisions(document: unknown): LicenseDecisionRecord[];
export function evaluateAudit(audit: unknown, entries: unknown[], policy: unknown, exceptions?: unknown[], triage?: unknown[], now?: Date, release?: boolean): { status: 'passed' | 'failed'; findings: unknown[] };
export function evaluateLicenses(entries: unknown[], policy: unknown, decisions?: LicenseDecisionRecord[]): { status: 'passed' | 'failed'; findings: LicenseFinding[]; unusedDecisions: string[] };
