// SPDX-License-Identifier: AGPL-3.0-only

import type { SdkScheduler, ScriptHookEventData, ScriptHookDispatcher, ScriptMuRef } from '../../core/sdk/rv-script-hook';
import { ensureAction } from '../../core/material-flow/des/rv-des-named-actions';
import type { DESManager } from '../../core/material-flow/des/rv-des-manager';

export const SCRIPT_HOOK_ACTION = 'Script.Hook';

export function ensureScriptHookAction(): number {
  return ensureAction(SCRIPT_HOOK_ACTION, ({ data }) => {
    const payload = data as Partial<ScriptHookEventData> | null;
    if (!payload || payload.rvScriptHook !== true || typeof payload.hook !== 'string'
      || !payload.dispatcher || typeof payload.dispatcher.dispatchScriptHook !== 'function') return;
    payload.dispatcher.dispatchScriptHook(payload.hook, payload.mu ?? null, payload.data);
  });
}

export function makeScriptHookScheduler(manager: DESManager, dispatcher: ScriptHookDispatcher): SdkScheduler {
  const actionIndex = ensureScriptHookAction();
  const schedule = (time: number, hook: string, mu?: ScriptMuRef | null, data?: unknown): number => {
    const payload: ScriptHookEventData = {
      rvScriptHook: true, hook, dispatcher,
      ...(mu === undefined ? {} : { mu }), ...(data === undefined ? {} : { data }),
    };
    return manager.scheduleByIndex(time, actionIndex, -1, -1, 0, payload);
  };
  return {
    in: (delay, hook, mu, data) => schedule(manager.currentTime + delay, hook, mu, data),
    at: (time, hook, mu, data) => schedule(time, hook, mu, data),
    cancel: (id) => { manager.cancelEvent(id); },
    get now() { return manager.currentTime; },
  };
}
