export const HMI_ROLES: readonly ['viewer', 'operator', 'engineer', 'admin'];
export const ROLES: readonly ['viewer', 'operator', 'engineer', 'admin', 'visitor'];
export function roleAtLeast(role: unknown, needed: string): boolean;
export function digest(value: string | Uint8Array): string;
export function id(): string;
export function randomToken(): string;
export class AccessError extends Error { status: number; code: string; constructor(status: number, code: string); }
export function requireValue(condition: unknown, status: number, code: string): asserts condition;
export function hashPassword(password: string): Promise<string>;
export function checkPassword(password: string, encoded?: string): Promise<boolean>;
export class AccessStore {
  constructor(root: string, options?: { now?: () => number; retentionDays?: number });
  root: string; now: () => number;
  db: { exec(sql: string): void };
  get(sql: string, ...args: unknown[]): any;
  all(sql: string, ...args: unknown[]): any[];
  run(sql: string, ...args: unknown[]): any;
  transaction<T>(action: () => T): T;
  audit(actor: string, action: string, target?: string, outcome?: string, detail?: string): void;
  migrateV1toV2(): void;
  prune(): void;
  session(raw?: string): any;
  share(id: string, session: any): any;
  mintSession(user?: string | null, share?: string | null, expires?: number): any;
  createUser(username: string, password: string, role: string, actor?: string): Promise<any>;
  invalidateRestoredShares(): void;
  close(): void;
}
