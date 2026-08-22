// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Measures the paint line's real cycle time, throughput and buffer WIP
 * (EP-DEMO-002, M1).
 *
 * A COUNTING PLANE sits on the return sweep at the unload station: a hanger is
 * counted the tick its X drops past that station while it is below the line
 * (z < RETURN_SWEEP_Z). Everything else follows from the timestamps of those
 * crossings — cycle time is the interval between them, throughput is the rate
 * they arrive at.
 *
 * Positions are READ, never cached as a second source of truth: since ADR-0002
 * a carrier's arc length belongs to its `PathTraveler` inside the component,
 * and the long-term constraint there is that nothing else may hold a competing
 * position. Reading `.position` each tick keeps this plugin a pure observer.
 *
 * Sampling runs in `onLateFixedUpdate`, not `onFrame`: the component writes the
 * carrier poses during the fixed update, and a KPI measured in SIMULATION time
 * stays correct on a host that cannot render at real time — which this one
 * cannot (see EP-CONV-001, where wall-clock speed readings were off by 2.5x
 * under software rendering).
 */

import type { Object3D } from 'three';
import { RVBehavior } from '../../../core/rv-behavior';
import type { UISlotEntry } from '../../../core/rv-ui-plugin';
import { EMPTY_KPI, paintLineKpiStore } from './paintline-kpi-store';
import {
  PaintLineBufferKpi,
  PaintLineCycleKpi,
  PaintLineThroughputKpi,
} from './PaintLineKpiBar';
import {
  bufferPieces,
  crossedDown,
  piecesPerHour,
  rollingCycleSeconds,
} from './paintline-kpi-math';

/** X of the unload station on the return sweep — the counting plane. */
const COUNTING_PLANE_X = 7;

/** Z below which a carrier is on the return sweep, running -X. */
const RETURN_SWEEP_Z = -1;

/** X beyond which a carrier is in the serpentine buffer. */
const BUFFER_SIDE_X = 4;

/** Two workpieces hang from every carrier (see the library generator). */
const PIECES_PER_CARRIER = 2;

/** Timestamps are kept only long enough to average over. */
const MAX_STAMPS = 32;

function baseName(name: string): string {
  return name.replace(/_\d+$/, '');
}

export class PaintLineKpiPlugin extends RVBehavior {
  readonly id = 'paintline-kpi';

  /** The line's own tiles — never the shared demo cards, which are dummy data. */
  readonly slots: UISlotEntry[] = [
    { slot: 'kpi-bar', component: PaintLineCycleKpi, order: 10 },
    { slot: 'kpi-bar', component: PaintLineThroughputKpi, order: 20 },
    { slot: 'kpi-bar', component: PaintLineBufferKpi, order: 30 },
  ];

  private carriers: Object3D[] = [];
  /** Previous-tick X per carrier, index-aligned with `carriers`. */
  private prevX: number[] = [];
  private stamps: number[] = [];
  private totalPieces = 0;
  /** Throttle: recomputing the snapshot every tick would churn React at 60 Hz. */
  private sincePublishS = 0;

  protected onStart(): void {
    const scene = this.scene;
    if (!scene) return;
    scene.traverse((node) => {
      if (/^Carrier-\d\d$/.test(baseName(node.name))) this.carriers.push(node);
    });
    if (!this.carriers.length) {
      console.warn(`[${this.id}] no carriers found — no KPI will be measured`);
      return;
    }
    this.prevX = this.carriers.map((c) => c.position.x);
    paintLineKpiStore.set(EMPTY_KPI);
  }

  protected onLateFixedUpdate(dt: number): void {
    if (!this.carriers.length) return;

    let crossings = 0;
    let inBuffer = 0;
    for (let i = 0; i < this.carriers.length; i++) {
      const { x, z } = this.carriers[i].position;
      if (z < RETURN_SWEEP_Z && crossedDown(this.prevX[i], x, COUNTING_PLANE_X)) crossings++;
      if (x >= BUFFER_SIDE_X && z >= RETURN_SWEEP_Z) inBuffer++;
      this.prevX[i] = x;
    }

    if (crossings > 0) {
      for (let n = 0; n < crossings; n++) this.stamps.push(this.elapsed);
      if (this.stamps.length > MAX_STAMPS) this.stamps.splice(0, this.stamps.length - MAX_STAMPS);
      this.totalPieces += crossings * PIECES_PER_CARRIER;
    }

    // Publish at 4 Hz — often enough to look live, rarely enough not to thrash
    // the React tree. A crossing publishes immediately so the counter never
    // appears to lag behind a hanger the user just watched go past.
    this.sincePublishS += dt;
    if (crossings === 0 && this.sincePublishS < 0.25) return;
    this.sincePublishS = 0;

    const cycleSeconds = rollingCycleSeconds(this.stamps, this.elapsed);
    paintLineKpiStore.set({
      cycleSeconds,
      piecesPerHour: piecesPerHour(cycleSeconds, PIECES_PER_CARRIER),
      bufferPieces: bufferPieces(inBuffer, PIECES_PER_CARRIER),
      totalPieces: this.totalPieces,
    });
  }

  protected onDestroy(): void {
    this.carriers = [];
    this.prevX = [];
    this.stamps = [];
    this.totalPieces = 0;
    this.sincePublishS = 0;
    paintLineKpiStore.set(EMPTY_KPI);
  }
}
