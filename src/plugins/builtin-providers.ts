// SPDX-License-Identifier: AGPL-3.0-only

/**
 * builtin-providers — the community implementations of the provider slots that
 * a licensed build fills from its private plugins (ADR-0026).
 *
 * Called once from main.ts AFTER `registerPrivatePlugins()`, and only fills a
 * slot that is still empty, so a licensed provider always wins. Loaded as its
 * own chunk: none of this code is in the entry.
 */

import type { RVViewer } from '../core/rv-viewer';
import type { RVViewerPlugin } from '../core/rv-plugin';
import { ikSolverRegistry } from '../core/engine/rv-ik-solver';
import { builtinIkSolver } from '../core/engine/ik-builtin/builtin-ik-solver';
import { isMachiningWorkerSupported, machiningRegistry } from '../core/engine/rv-machining-registry';
import { BuiltinMachiningProvider } from '../core/engine/machining-builtin/builtin-machining-provider';
import { getKinematicManager } from '../core/engine/rv-kinematic-registry';
import { builtinMechanismManager, installBuiltinMechanismSupport } from '../core/engine/mechanism-builtin/mechanism-runtime';

/** Drives the built-in mechanism solve after the drives moved (TickStage.POST). */
class BuiltinMechanismsPlugin implements RVViewerPlugin {
  readonly id = 'builtin-mechanisms';
  readonly order = 900;
  onFixedUpdatePost(): void { builtinMechanismManager.tick(); }
  onModelCleared(): void { builtinMechanismManager.clear(); }
}

export interface BuiltinProviderReport { ik: boolean; machining: boolean; mechanisms: boolean }

export function registerBuiltinProviders(viewer: RVViewer): BuiltinProviderReport {
  const report: BuiltinProviderReport = { ik: false, machining: false, mechanisms: false };
  if (ikSolverRegistry.tier === 'none') {
    ikSolverRegistry.register(builtinIkSolver);
    report.ik = true;
  }
  // The worker starts lazily (provider.init) — only when a model has a MachiningVolume.
  if (!machiningRegistry.rawProvider && isMachiningWorkerSupported()) {
    machiningRegistry.register(new BuiltinMachiningProvider());
    report.machining = true;
  }
  // Mechanism component factories must exist before a model loads (main.ts calls this first).
  if (!getKinematicManager()) {
    installBuiltinMechanismSupport({ setByPath: (path, value) => viewer.signalStore?.setByPath(path, value) });
    if (!viewer.getPlugin('builtin-mechanisms')) viewer.use(new BuiltinMechanismsPlugin(), 'core');
    report.mechanisms = true;
  }
  return report;
}
