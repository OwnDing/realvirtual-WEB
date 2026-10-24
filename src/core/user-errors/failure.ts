// SPDX-License-Identifier: AGPL-3.0-only
import { userHelpMessages } from '../i18n/catalogs/user-help';
export type UserOperation = 'load' | 'project' | 'save' | 'export';
export type UserReason = 'unknown' | 'permission' | 'quota' | 'cancelled' | 'timeout' | 'missing' | 'network' | 'invalid';
export interface UserFailure { readonly operation: UserOperation; readonly reason: UserReason }
/** No arbitrary text, paths, URLs, stack or parameters cross this presentation boundary. */
export function userFailure(error: unknown, operation: UserOperation): UserFailure {
  let reason: UserReason = 'unknown';
  if (error instanceof DOMException) {
    const names: Record<string, UserReason> = { NotAllowedError: 'permission', SecurityError: 'permission', QuotaExceededError: 'quota', AbortError: 'cancelled', TimeoutError: 'timeout', NotFoundError: 'missing', NetworkError: 'network', DataError: 'invalid' };
    reason = names[error.name] ?? 'unknown';
  } else if (error instanceof SyntaxError) reason = 'invalid';
  else if (error instanceof Error) {
    const codes: Record<string, UserReason> = { MODEL_TIMEOUT: 'timeout', MODEL_SIZE_LIMIT: 'invalid', MODEL_INCOMPLETE: 'network' };
    reason = codes[error.message] ?? 'unknown';
  }
  return { operation, reason };
}
export function userFailureText(failure: UserFailure, locale: string): string {
  const m = userHelpMessages(locale); return `${m[failure.operation]} ${m[failure.reason]}`;
}
