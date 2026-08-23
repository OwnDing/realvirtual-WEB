// SPDX-License-Identifier: AGPL-3.0-only

import type { DESManager } from './rv-des-manager';

/** JSON-safe record stored by the deterministic DES heap. */
export interface DESEvent {
  id: number;
  time: number;
  actionIndex: number;
  entityId: number;
  muId: number;
  priority: number;
  data?: unknown;
}

export interface ActionContext {
  simTime: number;
  componentPath: string;
  muId: number;
  data: unknown;
  manager: DESManager;
  entityId?: number;
  /**
   * Heap id of the event being dispatched. Lets a handler retire per-event
   * bookkeeping without threading the id through the event payload — which
   * only exists when the event carries data or an unregistered MU.
   */
  eventId?: number;
}

export type NamedAction = (ctx: ActionContext) => void;

/** Reserved manager action used by the checkpoint controller. */
export const CHECKPOINT_ACTION = 'DES.Checkpoint';
