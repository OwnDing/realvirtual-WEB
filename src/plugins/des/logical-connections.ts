// SPDX-License-Identifier: AGPL-3.0-only

import { Box3, Vector3, type Object3D } from 'three';
import type { DESComponent } from '../../core/material-flow/des/rv-des-component';

export interface ConnectableInstance {
  root: Object3D;
  adapter: DESComponent;
  kind: string;
  connectionType: string;
  subType?: string;
}

const center = (node: Object3D): Vector3 => {
  const box = new Box3().setFromObject(node);
  return box.isEmpty() ? node.getWorldPosition(new Vector3()) : box.getCenter(new Vector3());
};

export function autoConnectByDistance(instances: readonly ConnectableInstance[]): number {
  let created = 0;
  for (const source of instances) {
    if (!source.adapter.autoConnect.enabled || source.kind === 'sink' || source.adapter.nextComponents.length > 0) continue;
    const sourcePos = center(source.root);
    const maxDistance = source.adapter.autoConnect.maxDistance;
    let best: ConnectableInstance | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of instances) {
      if (target === source || target.kind === 'source' || !target.adapter.autoConnect.enabled) continue;
      if (target.connectionType !== source.connectionType) continue;
      if (source.subType && target.subType && source.subType !== target.subType) continue;
      const distance = sourcePos.distanceTo(center(target.root));
      if (distance <= maxDistance && distance < bestDistance) { best = target; bestDistance = distance; }
    }
    if (!best) continue;
    source.adapter.nextComponents.push(best.adapter);
    if (!best.adapter.previousComponents.includes(source.adapter)) best.adapter.previousComponents.push(source.adapter);
    created++;
  }
  return created;
}

export function breakTwoCycles(instances: readonly ConnectableInstance[]): number {
  let removed = 0;
  for (let i = 0; i < instances.length; i++) {
    const a = instances[i];
    for (let j = i + 1; j < instances.length; j++) {
      const b = instances[j];
      if (!a.adapter.nextComponents.includes(b.adapter) || !b.adapter.nextComponents.includes(a.adapter)) continue;
      const dropFrom = a.adapter.nextComponents.length > b.adapter.nextComponents.length ? a
        : b.adapter.nextComponents.length > a.adapter.nextComponents.length ? b
          : b;
      const dropTo = dropFrom === a ? b : a;
      dropFrom.adapter.nextComponents = dropFrom.adapter.nextComponents.filter((component) => component !== dropTo.adapter);
      dropTo.adapter.previousComponents = dropTo.adapter.previousComponents.filter((component) => component !== dropFrom.adapter);
      removed++;
    }
  }
  return removed;
}

export function detectCycles(instances: readonly ConnectableInstance[]): Object3D[] {
  const byAdapter = new Map(instances.map((instance) => [instance.adapter, instance]));
  const visiting = new Set<DESComponent>();
  const visited = new Set<DESComponent>();
  const cycle = new Set<DESComponent>();
  const stack: DESComponent[] = [];
  const visit = (component: DESComponent): void => {
    if (visited.has(component)) return;
    if (visiting.has(component)) {
      const start = stack.indexOf(component);
      for (const item of stack.slice(Math.max(0, start))) cycle.add(item);
      return;
    }
    visiting.add(component); stack.push(component);
    for (const next of component.nextComponents) visit(next);
    stack.pop(); visiting.delete(component); visited.add(component);
  };
  for (const instance of instances) visit(instance.adapter);
  return [...cycle].flatMap((component) => byAdapter.get(component)?.root ?? []);
}
