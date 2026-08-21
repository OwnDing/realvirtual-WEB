// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Kiosk Mode tour for the paint-line demo scene (EP-DEMO-001, M3).
 *
 * Walks the four process stages in flow order, the way the reference process
 * animation does: a wide isometric establishing shot, then one push-in per
 * stage, then back out. Loops until aborted.
 *
 * Captions go through `rvT` so the tour narrates in whatever language the UI
 * is set to; nothing here is a bare string.
 *
 * Highlights resolve node paths at RUN time. The Planner's placement nodes are
 * not addressable by bare name in the node registry, so a name lookup in the
 * scene is converted to a registry path via `getPathForNode`. When a node or
 * its path cannot be resolved the step simply runs without a highlight rather
 * than throwing — a tour is presentation, and half a tour beats a crash.
 */

import type { Object3D } from 'three';
import type { TourFn, TourApi } from '../../kiosk-tour-types';
import { rvT } from '../../../core/i18n';

/** Camera + caption for one stage. Positions are in scene metres. */
interface Stage {
  node: string | null;
  captionKey: 'paintline.tourPretreat' | 'paintline.tourOven' | 'paintline.tourBooth'
  | 'paintline.tourCooling' | 'paintline.tourLoadUnload';
  position: [number, number, number];
  target: [number, number, number];
  dwell: number;
  /** Outline the stage. Suppressed where the camera sits INSIDE the shell —
   *  the outline overlay would then wrap the whole frame instead of marking
   *  anything. Defaults to true. */
  outline?: boolean;
}

/**
 * The line runs +Z along x = 0 and returns along x = 6, so every stage is
 * viewed from the open −X side. See `scripts/build-paintline-scene.mjs`.
 *
 * The process sections are CLOSED shells (side walls plus a roof, open only at
 * the ends), so a level side-on shot frames a blank wall. Each stage therefore
 * uses an elevated three-quarter view that shows the section together with the
 * hangers running into and out of it — except the booth, which is framed
 * looking in through its open entry end so the reciprocator is actually
 * visible.
 */
const STAGES: Stage[] = [
  { node: 'PretreatTunnel-8m', captionKey: 'paintline.tourPretreat', position: [-11, 7, -1], target: [0, 1.8, 6], dwell: 5 },
  { node: 'DryOven-6m', captionKey: 'paintline.tourOven', position: [-11, 7.5, 7], target: [0, 2, 14], dwell: 5 },
  // Inside the booth, just past the entry: the shells are opaque, so this is
  // the only angle from which the reciprocator and the passing hangers are
  // actually visible — the same cut the reference process animation makes.
  { node: 'SprayBooth', captionKey: 'paintline.tourBooth', position: [1.6, 1.8, 18.4], target: [-0.3, 1.9, 23.8], dwell: 9, outline: false },
  { node: 'CoolingZone-4m', captionKey: 'paintline.tourCooling', position: [-11, 7, 20], target: [0, 1.8, 27], dwell: 5 },
  { node: 'LoadUnloadStation', captionKey: 'paintline.tourLoadUnload', position: [15, 7, 5], target: [6, 1.8, 12], dwell: 5 },
];

const OVERVIEW = { position: [26, 20, -10] as [number, number, number], target: [3, 1, 15] as [number, number, number] };

/**
 * One stable id for every caption. `showInstruction` replaces by id, so a fixed
 * id makes each step's caption supersede the previous one; the auto-generated
 * default would stack all seven on screen at once.
 */
const CAPTION_ID = 'paintline-tour-caption';

/** Registry path of the placement node called `name`, or null. */
function pathOf(t: TourApi, name: string): string | null {
  const scene = t.viewer.scene;
  if (!scene) return null;
  const matches: Object3D[] = [];
  scene.traverse((node) => {
    const base = node.name.replace(/_\d+$/, '');
    const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
    if (base === name && rv?.LayoutObject) matches.push(node);
  });
  const node = matches[0];
  return node ? (t.viewer.registry?.getPathForNode?.(node) ?? null) : null;
}

export const paintLineKioskTour: TourFn = async (t, signal) => {
  while (!signal.aborted) {
    // ───── Establishing shot ─────
    t.clearHighlights();
    t.instruction(rvT('demo', 'paintline.tourOverview'), { id: CAPTION_ID, style: 'banner' });
    await t.camera({ ...OVERVIEW, duration: 3 });
    await t.dwell(5);
    if (signal.aborted) return;

    // ───── One push-in per process stage, in flow order ─────
    for (const stage of STAGES) {
      t.instruction(rvT('demo', stage.captionKey), { id: CAPTION_ID, style: 'banner' });
      const path = stage.outline === false || !stage.node ? null : pathOf(t, stage.node);
      if (path) t.highlight([path], true); else t.clearHighlights();
      await t.camera({ position: stage.position, target: stage.target, duration: 2.5 });
      await t.dwell(stage.dwell);
      if (signal.aborted) return;
    }

    // ───── Back out, with the honest note about the demo chain speed ─────
    t.clearHighlights();
    t.instruction(rvT('demo', 'paintline.tourSpeedNote'), { id: CAPTION_ID, style: 'banner' });
    await t.camera({ ...OVERVIEW, duration: 3 });
    await t.dwell(6);
  }
};
