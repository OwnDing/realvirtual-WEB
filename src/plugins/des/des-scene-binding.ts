// SPDX-License-Identifier: AGPL-3.0-only

import type { Object3D } from 'three';
import { createBindContext, type BindContextHost, type KinematicsSpec } from '../../core/behavior-runtime';
import { createSelf, type JsonValue, type MU } from '../../core/material-flow/material-flow-self';
import { allMaterialFlows, getMaterialFlow } from '../../core/material-flow/registry';
import type { MaterialFlowDefinition } from '../../core/material-flow/define-material-flow';
import type { DESRunner } from './des-runner';
import { autoConnectByDistance, breakTwoCycles, type ConnectableInstance } from './logical-connections';
import type { MaterialFlowAdapter } from './material-flow-adapter';
import { extractGlbName, matchesAny } from '../../core/glob-match';

export function bindSceneToRunner(runner: DESRunner, scene: Object3D, host: BindContextHost): number {
  const definitions = new Map(allMaterialFlows().map((definition) => [definition.type, definition]));
  const nodes: Array<{ node: Object3D; def: MaterialFlowDefinition; raw: Record<string, unknown> }> = [];
  scene.traverse((node) => {
    const extras = node.userData.realvirtual;
    if (!extras || typeof extras !== 'object') return;
    for (const [type, raw] of Object.entries(extras as Record<string, unknown>)) {
      const def = definitions.get(type) ?? getMaterialFlow(type);
      if (def && raw && typeof raw === 'object' && matchesDefinitionScope(def, node, host)) {
        nodes.push({ node, def, raw: raw as Record<string, unknown> });
      }
    }
  });

  const connected: ConnectableInstance[] = [];
  const adapterByRoot = new Map<Object3D, MaterialFlowAdapter>();
  let bound = 0;
  for (const item of nodes) {
    try {
      const accum: KinematicsSpec = {};
      const { ctx } = createBindContext(item.node, host, accum);
      let adapter!: MaterialFlowAdapter;
      const localFactory = item.def.state ?? item.def.local;
      const self = createSelf(ctx, item.def, {
        mode: 'des',
        local: localFactory?.() ?? {},
        scheduler: runner.makeScheduler(item.def, () => adapter.entityId),
        onTransfer: (mu, port) => runner.makeTransfer(adapter)(mu, port),
        spawnMU: (templateId) => runner.createMU(templateId),
        canAcceptDownstream: (mu) => adapter.nextComponents.some((target) => target.canAccept(mu as never)),
        mus: () => adapter?.heldMUs as unknown as ReadonlyArray<MU> ?? [],
        reservedLoad: () => adapter?.reservedLoad ?? 0,
        downstreamFreeCapacity: (port) => adapter.downstreamFreeCapacity(port),
        reserveDownstream: (n, port, carrier) => adapter.reserveDownstream(n, port, carrier),
        reservation: (id) => adapter.reservation(id),
        onStatState: (state) => adapter?.setState(state),
      });
      for (const [key, descriptor] of Object.entries(item.def.schema)) {
        const raw = item.raw[key] ?? descriptor.default;
        if (raw === undefined) continue;
        if (descriptor.type === 'number') {
          const number = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(number)) throw new Error(`invalid numeric config '${key}'`);
          self.prop[key] = number;
        } else if (descriptor.type === 'componentRef') {
          self.prop[key] = typeof raw === 'object' && raw && typeof (raw as { path?: unknown }).path === 'string'
            ? (raw as { path: string }).path
            : String(raw);
        } else if (descriptor.type === 'componentRefArray') {
          self.prop[key] = Array.isArray(raw)
            ? raw.map((entry) => typeof entry === 'object' && entry
              && typeof (entry as { path?: unknown }).path === 'string'
              ? (entry as { path: string }).path : entry) as never
            : [];
        } else if (isJsonValue(raw)) self.prop[key] = raw;
      }
      for (const [key, value] of Object.entries(item.raw)) {
        if (!(key in self.prop) && isJsonValue(value)) self.prop[key] = value;
      }
      adapter = runner.addInstance(item.def, self, item.node);
      const capacity = item.def.capacity?.(self) ?? Number(self.prop.MaxCapacity ?? 1);
      if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('invalid numeric config MaxCapacity');
      adapter.MaxCapacity = Math.floor(capacity);
      connected.push({ root: item.node, adapter, kind: item.def.kind, connectionType: 'material-flow' });
      adapterByRoot.set(item.node, adapter);
      bound++;
    } catch (error) {
      console.error(`[DES] bind error at '${item.node.name}'`, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Stable snap connections are authoritative. `self.outputs()` resolves the
  // live snap graph to downstream owner roots; only nodes without an authored
  // connection fall through to the distance heuristic below.
  for (const instance of connected) {
    const adapter = instance.adapter as MaterialFlowAdapter;
    for (const port of adapter.self.outputs()) {
      const target = adapterByRoot.get(port.ownerRoot);
      if (!target || target === adapter || adapter.nextComponents.includes(target)) continue;
      adapter.nextComponents.push(target);
      if (!target.previousComponents.includes(adapter)) target.previousComponents.push(adapter);
    }
  }
  breakTwoCycles(connected);
  autoConnectByDistance(connected);
  return bound;
}

/**
 * Definitions with an explicit `models` list follow the same discovery scope
 * as the continuous BehaviorManager: match the loaded model name or a Planner
 * LayoutObject asset root, never an arbitrary inner component node. This keeps
 * legacy engine `Source`/`Sink` extras in an unrelated viewer model from being
 * mistaken for an authored DES line (and from arming an unbounded heartbeat).
 */
function matchesDefinitionScope(
  def: MaterialFlowDefinition,
  node: Object3D,
  host: BindContextHost,
): boolean {
  if (!def.models) return true;
  let current: Object3D | null = node;
  while (current) {
    const rv = current.userData.realvirtual as Record<string, unknown> | undefined;
    if (rv?.LayoutObject && matchesAny(def.models, current.name)) return true;
    current = current.parent;
  }
  const modelName = extractGlbName((host as BindContextHost & { currentModelUrl?: string }).currentModelUrl);
  return modelName !== '' && matchesAny(def.models, modelName);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === 'object' && Object.values(value as Record<string, unknown>).every(isJsonValue);
}
