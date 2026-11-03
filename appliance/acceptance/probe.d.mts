// SPDX-License-Identifier: AGPL-3.0-only

export const PROBE_VERSION: number;
export const HMI_ROLES: readonly ['viewer', 'operator', 'engineer', 'admin'];

export interface ProbeResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type ProbeRequest = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<ProbeResponse>;

export interface ProbeSocket {
  on(event: 'open' | 'close' | 'error', listener: () => void): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export interface ProbeCheck {
  id: string;
  title: string;
  result: 'passed' | 'failed' | 'skipped';
  detail: string;
}

export interface ProbeEvidence {
  probeVersion: number;
  startedAt: string;
  target: string;
  tls: object | null;
  checks: ProbeCheck[];
  summary: { passed: number; failed: number; skipped: number };
}

export function makeRequester(options?: { ca?: Buffer | string; allowHttpLoopback?: boolean }): ProbeRequest;
export function inspectTls(url: string, ca: Buffer | string): Promise<Record<string, string | null>>;
export function runChecks(options: {
  url: string;
  accounts?: Partial<Record<'viewer' | 'operator' | 'engineer' | 'admin', { username: string; password: string }>>;
  multiuser?: boolean;
  request: ProbeRequest;
  openSocket?: (url: string, headers: Record<string, string>) => ProbeSocket;
  tls?: object | null;
}): Promise<ProbeEvidence>;

export const __testing: {
  sessionCookie(headers: Record<string, string | string[] | undefined>): string | null;
  parseArgs(argv: string[]): { url: string; ca: string; accounts?: string; out?: string; multiuser: boolean };
};
