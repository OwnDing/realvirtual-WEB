// SPDX-License-Identifier: AGPL-3.0-only
import { fetchWithEgress } from '../core/deployment/egress-io';

export interface AccessSession { username: string | null; role: 'admin' | 'visitor'; shareId: string | null; csrf: string; expiresAt: number; }
export interface Presentation { id: string; name: string; size: number; created: number; }
export interface Share { id: string; presentation: string; user: string | null; expires: number; revoked: number; }
export interface Visitor { id: string; username: string; role: string; disabled: number; }
export interface Audit { id: number; time: number; actor: string; action: string; target: string; outcome: string; }
export interface ShareInfo { id: string; name: string; expiresAt: number; serverTime: number; visitor: string; identity: 'account' | 'link'; size: number; }
export class AccessFailure extends Error { constructor(public code: string) { super(code); } }
export const accessRoot = '/api/access/v1';
export async function accessRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithEgress(accessRoot + path, 'share', undefined, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...init });
  const value = await response.json();
  if (!response.ok) throw new AccessFailure(value?.error?.code ?? 'ACCESS_UNAVAILABLE');
  return value as T;
}
export function accessWrite<T>(path: string, value: unknown, csrf?: string, method = 'POST'): Promise<T> {
  return accessRequest<T>(path, { method, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: JSON.stringify(value) });
}
export function consumeAccessLink(): { id: string; token: string } | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const id = fragment.get('share'), token = fragment.get('token');
  if (fragment.has('share') || fragment.has('token')) history.replaceState(null, '', location.pathname + location.search);
  return id && token ? { id, token } : null;
}
