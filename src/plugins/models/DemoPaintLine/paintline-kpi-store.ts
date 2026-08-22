// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The live paint-line KPI readings (EP-DEMO-002, M1).
 *
 * Its own module so the measuring plugin can declare the UI slots that render
 * it without importing the components that read the store — the plugin, the
 * tiles and the store would otherwise form an import cycle.
 *
 * `null` is a first-class value here: a stopped line has NO current cycle time,
 * and the UI must show that rather than the last one it happened to have.
 */

import { createStore, type Store } from '../../../core/hmi/create-store';

export interface PaintLineKpiSnapshot {
  /** Seconds between hangers passing the unload station; null = no reading. */
  cycleSeconds: number | null;
  /** Pieces per hour implied by the cycle time; null = no reading. */
  piecesPerHour: number | null;
  /** Pieces currently held in the serpentine buffer. */
  bufferPieces: number;
  /** Pieces counted through the unload station since the model loaded. */
  totalPieces: number;
}

export const EMPTY_KPI: PaintLineKpiSnapshot = {
  cycleSeconds: null,
  piecesPerHour: null,
  bufferPieces: 0,
  totalPieces: 0,
};

export const paintLineKpiStore: Store<PaintLineKpiSnapshot> =
  createStore<PaintLineKpiSnapshot>(EMPTY_KPI);
