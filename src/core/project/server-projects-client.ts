// SPDX-License-Identifier: AGPL-3.0-only
/** List and create Appliance server-side projects (ADR-0024). Same-origin only. */
import { getAppConfig } from '../rv-app-config';
import { hmiSessionStore } from '../hmi/hmi-session-store';

export interface ServerProjectSummary { id: string; name: string; updatedAt: string | null }

/** The deployment's project API base, or null where server projects are not offered. */
export function serverProjectsBaseUrl(): string | null {
  const url = getAppConfig().services?.projects?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url.replace(/\/$/, '') : null;
}

/** Derive a repository id from a display name: lowercase, digits and dashes. */
export function serverProjectIdOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export async function listServerProjects(fetchImpl: typeof fetch = fetch): Promise<ServerProjectSummary[]> {
  const base = serverProjectsBaseUrl();
  if (!base) return [];
  const response = await fetchImpl(`${base}/projects`, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json() as ServerProjectSummary[];
  return Array.isArray(rows) ? rows.filter((r) => typeof r?.id === 'string' && typeof r.name === 'string') : [];
}

export async function createServerProject(id: string, name: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const base = serverProjectsBaseUrl();
  if (!base) throw new Error('Server projects are not available in this deployment.');
  const response = await fetchImpl(`${base}/projects`, {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'content-type': 'application/json', 'x-csrf-token': hmiSessionStore.getSnapshot().csrf ?? '' },
    body: JSON.stringify({ id, name }),
  });
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try { code = ((await response.json()) as { error?: { code?: string } }).error?.code ?? code; } catch { /* keep */ }
    throw new Error(code);
  }
}
