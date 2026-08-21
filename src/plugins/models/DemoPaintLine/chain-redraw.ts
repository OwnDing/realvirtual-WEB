// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Makes the moving paint-line chain actually appear on screen
 * (EP-DEMO-001, M3 follow-up). Two separate things stop it, and BOTH have to
 * be undone or the line simulates perfectly while the picture never changes.
 *
 * ── 1. Frozen matrices ──────────────────────────────────────────────────
 * `rv-freeze-static.ts` turns off `matrixWorldAutoUpdate` on every node it can
 * prove static, gating the whole subtree out of `scene.updateMatrixWorld()`.
 * "Dynamic" is decided by an rv_extras key matching
 * `^(Drive|Kinematic|Grip|TransportSurface|Source|Sink|MU|Cam|SceneButtonMoveable)`
 * — and `OverheadConveyor` is not on that list. Its carriers carry no component
 * at all, so the entire conveyor subtree gets frozen and the carrier poses the
 * behavior writes never reach the GPU. Measured: `Carrier-01.position.z` ran
 * 2.34 → 4.73 m while `matrixWorld` stayed pinned at its baked z = 0.
 * That same file records the identical symptom from a past case: "the signal
 * toggles and the light switches, but the lever never visibly moves."
 *
 * Only the carriers are thawed here, not the whole object: the track beams and
 * support posts really are static and should keep their frozen-matrix saving.
 *
 * ── 2. Render-on-demand ─────────────────────────────────────────────────
 *
 * The viewer renders ON DEMAND: `rv-viewer` skips the GPU render entirely
 * unless something set `_renderDirty` that frame. During a simulation tick the
 * only thing that raises that flag is a RUNNING `RVDrive`
 * (`rv-core-subsystems.ts` → `drives()`), plus camera / highlight / outline
 * activity.
 *
 * `OverheadConveyor` has no drive. It advances one chain-phase scalar and
 * writes the carrier transforms itself, so a moving chain raises no flag at
 * all. Measured: with the chain running, the simulation advanced 315 ticks and
 * `Carrier-01` travelled 5.05 m → 7.68 m while the canvas pixels stayed
 * BYTE-IDENTICAL. The line runs; the picture is frozen.
 *
 * The full demo scene hid this because the booth reciprocator is a real drive
 * and jogs every frame, which incidentally dirtied the whole scene. Anything
 * that stops the reciprocator — or using the conveyor library object on its
 * own — brings the freeze straight back.
 *
 * The trigger here is the carrier pose itself rather than the `Moving` signal:
 * "a carrier changed position, so the picture is stale" is true by
 * construction, needs no signal-name lookup (the store has no enumeration API,
 * and the name is derived from the placement), and cannot disagree with what
 * is on screen. A stopped chain marks nothing, so the render-on-demand saving
 * survives.
 *
 * This is a DEMO-LAYER patch. The underlying gap belongs to the component:
 * `OverheadConveyor` should raise the flag itself when its phase advances, the
 * way the drive loop does. `src/behaviors/` is a Forbidden Path for
 * EP-DEMO-001, so that fix is recorded as a follow-up rather than made here —
 * see the plan's Surprises & Discoveries.
 */

import type { Object3D } from 'three';
import { RVBehavior } from '../../../core/rv-behavior';

/** Carrier nodes; the GLB exporter may append a `_N` duplicate suffix. */
const CARRIER = /^Carrier-\d\d$/;

export class PaintLineChainRedrawPlugin extends RVBehavior {
  readonly id = 'paintline-chain-redraw';

  private carrier: Object3D | null = null;
  private lastZ = Number.NaN;
  private lastX = Number.NaN;

  protected onStart(): void {
    const scene = this.scene;
    if (!scene) return;

    const carriers: Object3D[] = [];
    scene.traverse((node) => {
      if (CARRIER.test(node.name.replace(/_\d+$/, ''))) carriers.push(node);
    });
    if (!carriers.length) {
      console.warn(`[${this.id}] no carriers found — the chain will not animate`);
      return;
    }
    this.carrier = carriers[0];

    // Thaw each carrier's own subtree, plus every ancestor up to the first node
    // the freeze left dynamic — `matrixWorldAutoUpdate` gates the RECURSION, so
    // a frozen ancestor hides a thawed child.
    for (const carrier of carriers) {
      carrier.traverse((n) => { n.matrixWorldAutoUpdate = true; });
      for (let a = carrier.parent; a && !a.matrixWorldAutoUpdate; a = a.parent) {
        a.matrixWorldAutoUpdate = true;
      }
    }
  }

  protected onFrame(): void {
    const c = this.carrier;
    if (!c) return;
    const { x, z } = c.position;
    if (x !== this.lastX || z !== this.lastZ) {
      this.lastX = x;
      this.lastZ = z;
      this.viewer?.markRenderDirty();
    }
  }

  protected onDestroy(): void {
    this.carrier = null;
    this.lastZ = Number.NaN;
    this.lastX = Number.NaN;
  }
}
