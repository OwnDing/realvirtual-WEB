// SPDX-License-Identifier: AGPL-3.0-only
import { isSettingsLocked } from '../rv-app-config';
import { isContextActive, isUIElementVisible, getActiveContexts } from '../hmi/ui-context-store';
export function canExportDiagnostics(): boolean {
  return !isSettingsLocked() && !['kiosk', 'embed', 'guest'].some(isContextActive) && isUIElementVisible('diagnostics', getActiveContexts());
}
