// SPDX-License-Identifier: AGPL-3.0-only

import type { RVScriptHost } from '../../core/engine/rv-script-host';
import type { ParamOverride } from './rv-des-experiment-model';

export interface ParamScriptResult { ok: boolean; fields: ParamOverride[]; error?: unknown }

export function runParamScript(host: RVScriptHost, source: string): ParamScriptResult {
  const fields: ParamOverride[] = [];
  const context = host.createContext({ callDeadlineMs: 50 });
  try {
    context.exposeFunction('__rvSetField', (path, component, field, value) => {
      const scalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
      if (typeof path === 'string' && typeof component === 'string' && typeof field === 'string' && scalar) {
        fields.push({ path, component, field, value: value as ParamOverride['value'] });
      }
      return null;
    });
    const result = context.evaluate(`const self = Object.freeze({ setField: __rvSetField });\n${source}`);
    return result.ok ? { ok: true, fields } : { ok: false, fields: [], error: result.error };
  } catch (error) {
    return { ok: false, fields: [], error };
  } finally {
    context.dispose();
  }
}
