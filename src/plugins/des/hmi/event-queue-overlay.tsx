// SPDX-License-Identifier: AGPL-3.0-only

import { useSyncExternalStore } from 'react';
import type { UISlotProps } from '../../../core/rv-ui-plugin';
import {
  isEventQueueWindowOpen,
  subscribeEventQueueWindow,
} from '../../sim-controller/event-queue-window-store';
import { DESEventQueuePanel } from '../../sim-controller/DESEventQueuePanel';

export function EventQueueOverlay({ viewer }: UISlotProps) {
  const open = useSyncExternalStore(subscribeEventQueueWindow, isEventQueueWindowOpen);
  return <DESEventQueuePanel viewer={viewer} open={open} />;
}
