// SPDX-License-Identifier: AGPL-3.0-only

/**
 * builtin-providers — the community implementations of the provider slots that
 * a licensed build fills from its private plugins (ADR-0026).
 *
 * Called once from main.ts AFTER `registerPrivatePlugins()`, and only fills a
 * slot that is still empty, so a licensed provider always wins. Loaded as its
 * own chunk: none of this code is in the entry.
 */

import { ikSolverRegistry } from './rv-ik-solver';
import { builtinIkSolver } from './ik-builtin/builtin-ik-solver';
import { isMachiningWorkerSupported, machiningRegistry } from './rv-machining-registry';
import { BuiltinMachiningProvider } from './machining-builtin/builtin-machining-provider';

export interface BuiltinProviderReport { ik: boolean; machining: boolean }

export function registerBuiltinProviders(): BuiltinProviderReport {
  const report: BuiltinProviderReport = { ik: false, machining: false };
  if (ikSolverRegistry.tier === 'none') {
    ikSolverRegistry.register(builtinIkSolver);
    report.ik = true;
  }
  // The worker starts lazily (provider.init) — only when a model has a MachiningVolume.
  if (!machiningRegistry.rawProvider && isMachiningWorkerSupported()) {
    machiningRegistry.register(new BuiltinMachiningProvider());
    report.machining = true;
  }
  return report;
}
