// SPDX-License-Identifier: AGPL-3.0-only

/**
 * hmi-project-config — HMI configuration documents stored with the project
 * (ADR-0025): `hmi/alarms.json`, `hmi/kpis.json`.
 *
 * They are project data (the plant's alarm priorities and KPI definitions), so
 * they live in the project like any other document: a folder project writes a
 * file, a server project commits it to Forgejo under the signed-in user. Without
 * an open writable project they fall back to this browser's storage, and the
 * caller is told which one happened.
 */

import { getProjectStore } from '../project/project-store';

export type HmiConfigLocation = 'project' | 'browser';

const BROWSER_PREFIX = 'rv-hmi-config/';

function browserKey(relPath: string): string {
  const projectId = getProjectStore().getProject()?.id ?? 'no-project';
  return `${BROWSER_PREFIX}${projectId}/${relPath}`;
}

/** Read a JSON document: the project's copy first, then this browser's. */
export async function loadHmiConfig(relPath: string): Promise<{ value: unknown; location: HmiConfigLocation | null }> {
  const backend = getProjectStore().getBackend();
  if (backend) {
    try {
      const bytes = await backend.readBlobBytes(relPath);
      if (bytes) return { value: JSON.parse(new TextDecoder().decode(bytes)) as unknown, location: 'project' };
    } catch { /* unreadable or invalid: fall through to the browser copy */ }
  }
  try {
    const raw = localStorage.getItem(browserKey(relPath));
    if (raw) return { value: JSON.parse(raw) as unknown, location: 'browser' };
  } catch { /* storage unavailable */ }
  return { value: null, location: null };
}

/** Save a JSON document to the project when it is writable, else to this browser. */
export async function saveHmiConfig(relPath: string, value: unknown): Promise<HmiConfigLocation> {
  const store = getProjectStore();
  const backend = store.getBackend();
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (backend && backend.writable && store.isWritable()) {
    await backend.writeBlob(relPath, new Blob([body], { type: 'application/json' }));
    await backend.flush();
    return 'project';
  }
  localStorage.setItem(browserKey(relPath), body);
  return 'browser';
}

export const ALARM_CONFIG_PATH = 'hmi/alarms.json';
export const KPI_CONFIG_PATH = 'hmi/kpis.json';
