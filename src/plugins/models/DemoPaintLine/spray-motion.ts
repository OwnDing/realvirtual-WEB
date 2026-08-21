// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Reciprocator motion for the paint-line demo booth (EP-DEMO-001, M3).
 *
 * The booth carries ONE `Drive-Lin-Y` carriage with both gun arms mounted on
 * it — the drive-name parser is anchored (`^Drive-(Lin|Rot)-([XYZ])$`), so a
 * second identically named node could not exist, and a real reciprocator
 * gantry works the same way.
 *
 * This plugin does not animate transforms by hand: it flips the drive's jog
 * direction at the authored limits and lets the platform's own ramp move the
 * carriage. The stroke, speed and limits all live in the asset's `Drive`
 * extras, so retuning the booth needs no code change.
 *
 * The spray fans are only shown while a hanger is actually inside the booth —
 * an empty booth that keeps spraying reads as broken.
 */

import type { Object3D } from 'three';
import type { RVDrive } from '../../../core/engine/rv-drive';
import { RVBehavior } from '../../../core/rv-behavior';

/** Exact node name — the drive-name parser tolerates no suffix. */
const RECIPROCATOR = 'Drive-Lin-Y';

/** Booth length in metres, mirroring `scripts/build-paintline-library.mjs`. */
const BOOTH_LENGTH = 6;

/** Stop short of the hard limit so the ramp reverses instead of stalling on it. */
const LIMIT_MARGIN_MM = 5;

/** GLB export appends `_N` to duplicate names; compare against the base. */
function baseName(name: string): string {
  return name.replace(/_\d+$/, '');
}

export class PaintLineSprayMotionPlugin extends RVBehavior {
  readonly id = 'paintline-spray-motion';

  private carriage: RVDrive | null = null;
  private fans: Object3D[] = [];
  private carriers: Object3D[] = [];
  private boothMinZ = 0;
  private boothMaxZ = 0;
  private spraying = false;

  protected onStart(): void {
    const scene = this.scene;
    if (!scene) return;

    this.carriage = this.drives.find((d) => baseName(d.name) === RECIPROCATOR) ?? null;
    if (!this.carriage) {
      // The booth asset changed shape. Stay inert rather than animate something
      // arbitrary — a silently wrong demo is worse than a still one.
      console.warn(`[${this.id}] no "${RECIPROCATOR}" drive found — reciprocator disabled`);
      return;
    }

    scene.traverse((node) => {
      const base = baseName(node.name);
      if (base.startsWith('Spray-Fan-')) this.fans.push(node);
      if (/^Carrier-\d\d$/.test(base)) this.carriers.push(node);
      // The booth PLACEMENT (not the grafted asset root) carries the transform
      // that decides where the booth actually sits.
      if (base === 'SprayBooth' && node.userData?.realvirtual?.LayoutObject) {
        this.boothMinZ = node.position.z - BOOTH_LENGTH / 2;
        this.boothMaxZ = node.position.z + BOOTH_LENGTH / 2;
      }
    });

    for (const fan of this.fans) fan.visible = false;
    this.carriage.jogForward = true;
  }

  protected onFrame(): void {
    const drive = this.carriage;
    if (!drive) return;

    // Reverse the stroke at the authored limits. `UseLimits` already clamps the
    // travel; this is what turns a clamp into a reciprocation.
    const rv = drive.node.userData?.realvirtual as Record<string, unknown> | undefined;
    const cfg = (rv?.Drive ?? {}) as { LowerLimit?: number; UpperLimit?: number };
    const lower = Number(cfg.LowerLimit ?? 0);
    const upper = Number(cfg.UpperLimit ?? 0);
    if (upper > lower) {
      if (drive.jogForward && drive.currentPosition >= upper - LIMIT_MARGIN_MM) {
        drive.jogForward = false;
        drive.jogBackward = true;
      } else if (drive.jogBackward && drive.currentPosition <= lower + LIMIT_MARGIN_MM) {
        drive.jogBackward = false;
        drive.jogForward = true;
      }
    }

    // Spray only while a hanger is between the booth walls. Positions are read
    // in the scene-root frame, which is the world frame here: the conveyor is
    // placed untransformed at the origin (see build-paintline-scene.mjs).
    const occupied = this.boothMaxZ > this.boothMinZ && this.carriers.some(
      (c) => Math.abs(c.position.x) < 1 && c.position.z >= this.boothMinZ && c.position.z <= this.boothMaxZ,
    );
    if (occupied !== this.spraying) {
      this.spraying = occupied;
      for (const fan of this.fans) fan.visible = occupied;
      this.viewer?.markRenderDirty();
    }
  }

  protected onDestroy(): void {
    for (const fan of this.fans) fan.visible = true;
    if (this.carriage) {
      this.carriage.jogForward = false;
      this.carriage.jogBackward = false;
    }
    this.carriage = null;
    this.fans = [];
    this.carriers = [];
    this.spraying = false;
  }
}
