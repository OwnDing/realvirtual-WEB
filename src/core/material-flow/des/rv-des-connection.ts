// SPDX-License-Identifier: AGPL-3.0-only

import type { DESComponent } from './rv-des-component';

export function computePreviousComponents(components: readonly DESComponent[]): void {
  for (const component of components) component.previousComponents = [];
  for (const component of components) {
    for (const next of component.nextComponents) {
      if (!next.previousComponents.includes(component)) next.previousComponents.push(component);
    }
  }
}

export function autoConnect(components: readonly DESComponent[]): void {
  for (const component of components) {
    if (!component.autoConnect.enabled || component.nextComponents.length > 0) continue;
    let best: DESComponent | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of components) {
      if (candidate === component || !candidate.autoConnect.enabled) continue;
      if (candidate.constructor.name.includes('Source')) continue;
      const d = component.outputPosition.distanceTo(candidate.inputPosition);
      if (d <= component.autoConnect.maxDistance && d < distance) { best = candidate; distance = d; }
    }
    if (best) component.nextComponents = [best];
  }
  computePreviousComponents(components);
}
