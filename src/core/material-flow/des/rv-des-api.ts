// SPDX-License-Identifier: AGPL-3.0-only

import type { DESManager } from './rv-des-manager';

export class DES {
  private static current: DESManager | null = null;
  static setManager(manager: DESManager | null): void { this.current = manager; }
  static get manager(): DESManager {
    if (!this.current) throw new Error('DESManager is not configured');
    return this.current;
  }
  static get now(): number { return this.manager.currentTime; }
  static scheduleIn(delay: number, action: string, entityId: number, muId = -1, priority = 0, data?: unknown): number {
    return this.manager.scheduleIn(delay, action, entityId, muId, priority, data);
  }
  static cancel(id: number): boolean { return this.manager.cancelEvent(id); }
}
