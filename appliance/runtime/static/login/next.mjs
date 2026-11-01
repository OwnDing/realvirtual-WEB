// SPDX-License-Identifier: AGPL-3.0-only
/** Only a same-origin path is an acceptable post-login destination (no open redirect). */
export function safeNext(raw) {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !/[\\\r\n]/.test(raw) && !raw.startsWith('/login') ? raw : '/';
}
