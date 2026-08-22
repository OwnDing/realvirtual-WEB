// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Model plugins for the paint-line demo scene (EP-DEMO-001, M3).
 *
 * Active only while `DemoPaintLine.glb` is the loaded model. The binding is the
 * FOLDER NAME: `rv-model-plugin-manager` matches `/src/plugins/models/<Folder>/`
 * against the resolved model name, so no `models[]` array is declared here —
 * that field is deprecated since plan-718 and matching through it logs a
 * deprecation warning.
 *
 * The pack adds the two things the scene cannot express as data — the booth
 * reciprocator's stroke reversal and the workpiece colour change — plus the
 * narrated Kiosk tour. Everything else (the circulating chain, the drive, the
 * layout) is authored in the assets themselves.
 */

import type { RVViewer } from '../../../core/rv-viewer';
import type { ModelPluginModule } from '../../../core/rv-model-plugin-manager';
import type { KioskPlugin } from '../../kiosk-plugin';

import { PaintLineKpiPlugin } from './paintline-kpi';
import { PaintLineSprayMotionPlugin } from './spray-motion';
import { PaintLineWorkpieceCoatingPlugin } from './workpiece-coating';
import { paintLineKioskTour } from './paintline-kiosk-tour';

/**
 * Olive-green ground and a soft sky — the look industrial process animations
 * conventionally use for a plant overview, and the closest shipped preset to
 * the reference material this demo was modelled on.
 */
export const defaultEnvironmentPreset = 'Outdoor' as const;

/** Model names this pack registers its Kiosk tour under. */
const TOUR_MODELS = ['DemoPaintLine', 'demopaintline'];

const registeredIds: string[] = [];

export function registerModelPlugins(viewer: RVViewer): void {
  const instances = [
    new PaintLineKpiPlugin(),
    new PaintLineSprayMotionPlugin(),
    new PaintLineWorkpieceCoatingPlugin(),
  ];
  for (const p of instances) {
    viewer.use(p);
    registeredIds.push(p.id);
  }

  // The tour is keyed by model name inside the kiosk plugin, which is a core
  // plugin and may legitimately be absent in a trimmed deployment.
  const kiosk = viewer.getPlugin<KioskPlugin>('kiosk');
  if (kiosk) {
    for (const modelName of TOUR_MODELS) kiosk.registerTour(modelName, paintLineKioskTour);
  }
}

export function unregisterModelPlugins(viewer: RVViewer): void {
  const kiosk = viewer.getPlugin<KioskPlugin>('kiosk');
  if (kiosk) {
    for (const modelName of TOUR_MODELS) kiosk.unregisterTour(modelName);
  }
  for (const id of registeredIds) viewer.removePlugin(id);
  registeredIds.length = 0;
}

export default {
  defaultEnvironmentPreset,
  registerModelPlugins,
  unregisterModelPlugins,
} satisfies ModelPluginModule;
