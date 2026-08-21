// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Workpiece colour change across the paint-line booth (EP-DEMO-001, M3).
 *
 * Parts ride the loop raw, leave the booth painted, and go back to raw when
 * they reach the unload point — which is what makes the demo read as a PROCESS
 * rather than a moving model.
 *
 * Two things about the asset drive the implementation:
 *
 *  - All 80 workpieces share ONE material (the library generator emits one
 *    material per palette key), so the colour has to be per-instance: each
 *    mesh gets its own clone on start, and every clone is disposed on destroy.
 *  - The GLB exporter appends `_N` to duplicate node names, so the 40 hangers'
 *    children are `Workpiece-A_3`, `Workpiece-B_17`, … — matching on the bare
 *    name would find exactly one of each.
 *
 * The painted/raw decision is positional rather than phase-based: a carrier is
 * painted from the booth exit, round the far turn and down the return side
 * until the unload point. Both legs are covered by one rule because the far
 * turn satisfies either branch and the near turn satisfies neither.
 */

import { Color, type Mesh, type Object3D } from 'three';
import { RVBehavior } from '../../../core/rv-behavior';

/** Booth length in metres, mirroring `scripts/build-paintline-library.mjs`. */
const BOOTH_LENGTH = 6;

/** Return-side X of the loop; carriers beyond this are heading back. */
const RETURN_SIDE_X = 3;

/**
 * Two finishes, alternating per hanger, echoing a mixed-colour batch line.
 *
 * There is deliberately no RAW constant beside them. The viewer does not keep
 * the GLB's own materials: by the time a mesh is in the scene it carries a
 * shared `__rvUberMaterial`, whose `.color` is WHITE — the asset's
 * `baseColorFactor` reaches the surface through another channel. So "bare
 * steel" is not (0.34, 0.35, 0.39) at this layer, and hardcoding that value
 * repainted every part that completed one lap a dark grey it never had.
 * Each mesh's own colour is captured before the first repaint and restored
 * instead, which is correct whatever the material layer does underneath.
 */
const FINISHES = [new Color(0.78, 0.16, 0.16), new Color(0.16, 0.34, 0.72)];

function baseName(name: string): string {
  return name.replace(/_\d+$/, '');
}

interface CoatedPart {
  mesh: Mesh;
  carrier: Object3D;
  finish: Color;
  /** The asset's own colour, captured before the first repaint. */
  raw: Color;
  painted: boolean;
}

export class PaintLineWorkpieceCoatingPlugin extends RVBehavior {
  readonly id = 'paintline-workpiece-coating';

  private parts: CoatedPart[] = [];
  private boothExitZ = Number.POSITIVE_INFINITY;
  private unloadZ = Number.POSITIVE_INFINITY;

  protected onStart(): void {
    const scene = this.scene;
    if (!scene) return;

    scene.traverse((node) => {
      const base = baseName(node.name);
      const rv = node.userData?.realvirtual as Record<string, unknown> | undefined;
      if (base === 'SprayBooth' && rv?.LayoutObject) {
        this.boothExitZ = node.position.z + BOOTH_LENGTH / 2;
      }
      // Parts are stripped at the unload room's midpoint.
      if (base === 'LoadUnloadStation' && rv?.LayoutObject) {
        this.unloadZ = node.position.z;
      }
    });

    const carriers: Object3D[] = [];
    scene.traverse((node) => {
      if (/^Carrier-\d\d$/.test(baseName(node.name))) carriers.push(node);
    });

    for (const carrier of carriers) {
      const index = Number(baseName(carrier.name).slice('Carrier-'.length));
      const finish = FINISHES[index % FINISHES.length];
      carrier.traverse((child) => {
        if (!/^Workpiece-[AB]$/.test(baseName(child.name))) return;
        const mesh = child as Mesh;
        if (!mesh.material || Array.isArray(mesh.material)) return;
        // Per-instance clone: the shared material would recolour every part.
        mesh.material = mesh.material.clone();
        const raw = ((mesh.material as { color?: Color }).color ?? new Color(1, 1, 1)).clone();
        this.parts.push({ mesh, carrier, finish, raw, painted: false });
      });
    }

    if (!this.parts.length) {
      console.warn(`[${this.id}] no workpieces found — coating disabled`);
    }
  }

  protected onFrame(): void {
    if (!this.parts.length || !Number.isFinite(this.boothExitZ)) return;

    let changed = false;
    for (const part of this.parts) {
      const { x, z } = part.carrier.position;
      // Process side: painted only past the booth exit. Return side (and the
      // far turn, which lands here too): painted until the unload point.
      const painted = x < RETURN_SIDE_X ? z >= this.boothExitZ : z >= this.unloadZ;
      if (painted === part.painted) continue;
      part.painted = painted;
      const mat = part.mesh.material as { color?: Color };
      mat.color?.copy(painted ? part.finish : part.raw);
      changed = true;
    }
    if (changed) this.viewer?.markRenderDirty();
  }

  protected onDestroy(): void {
    // The clones are ours; the shared original stays with the loaded model.
    for (const part of this.parts) {
      (part.mesh.material as { dispose?: () => void }).dispose?.();
    }
    this.parts = [];
    this.boothExitZ = Number.POSITIVE_INFINITY;
    this.unloadZ = Number.POSITIVE_INFINITY;
  }
}
