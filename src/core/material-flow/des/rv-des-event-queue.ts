// SPDX-License-Identifier: AGPL-3.0-only

import type { DESEvent } from './rv-des-event';

function before(a: DESEvent, b: DESEvent): boolean {
  return a.time < b.time
    || (a.time === b.time && (a.priority > b.priority
      || (a.priority === b.priority && a.id < b.id)));
}

/** Allocation-conscious four-ary min heap ordered by time, priority and stable id. */
export class DESEventQueue {
  private heap: DESEvent[] = [];
  private cancelled = new Set<number>();
  private nextId = 0;
  private nextSystemId = -1;

  constructor(_initialCapacity = 256) {}

  get count(): number { return this.heap.length - this.cancelled.size; }
  get isEmpty(): boolean { return this.peekLive() === null; }
  get peekTime(): number { return this.peekLive()?.time ?? Number.POSITIVE_INFINITY; }

  enqueue(
    time: number,
    actionIndex: number,
    entityId: number,
    muId: number,
    priority = 0,
    data?: unknown,
  ): number {
    if (!Number.isFinite(time) || time < 0) throw new Error(`invalid DES event time: ${time}`);
    if (!Number.isFinite(priority)) throw new Error(`invalid DES event priority: ${priority}`);
    const event: DESEvent = {
      id: this.nextId++, time, actionIndex, entityId, muId, priority,
      ...(data === undefined ? {} : { data }),
    };
    this.heap.push(event);
    this.siftUp(this.heap.length - 1);
    return event.id;
  }

  /**
   * Enqueue a runtime-only system event without consuming the deterministic
   * model-event id sequence. System ids are negative and never serialized.
   */
  enqueueSystem(
    time: number,
    actionIndex: number,
    entityId: number,
    muId: number,
    priority = 0,
    data?: unknown,
  ): number {
    if (!Number.isFinite(time) || time < 0) throw new Error(`invalid DES event time: ${time}`);
    if (!Number.isFinite(priority)) throw new Error(`invalid DES event priority: ${priority}`);
    const event: DESEvent = {
      id: this.nextSystemId--, time, actionIndex, entityId, muId, priority,
      ...(data === undefined ? {} : { data }),
    };
    this.heap.push(event);
    this.siftUp(this.heap.length - 1);
    return event.id;
  }

  cancel(id: number): boolean {
    if (this.cancelled.has(id)) return false;
    if (!this.heap.some((event) => event.id === id)) return false;
    this.cancelled.add(id);
    return true;
  }

  dequeue(): DESEvent | null {
    while (this.heap.length > 0) {
      const event = this.popRoot();
      if (this.cancelled.delete(event.id)) continue;
      return event;
    }
    this.cancelled.clear();
    return null;
  }

  clear(): void {
    this.heap.length = 0;
    this.cancelled.clear();
    this.nextId = 0;
    this.nextSystemId = -1;
  }

  snapshot(): DESEvent[] {
    return this.heap
      .filter((event) => !this.cancelled.has(event.id))
      .map((event) => ({ ...event }))
      .sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0);
  }

  restore(events: readonly DESEvent[]): void {
    this.clear();
    for (const raw of events) {
      if (!Number.isFinite(raw.time) || raw.time < 0) throw new Error(`invalid DES event time: ${raw.time}`);
      const event = { ...raw };
      this.heap.push(event);
      this.nextId = Math.max(this.nextId, event.id + 1);
      if (event.id < 0) this.nextSystemId = Math.min(this.nextSystemId, event.id - 1);
    }
    for (let i = Math.floor((this.heap.length - 2) / 4); i >= 0; i--) this.siftDown(i);
  }

  private peekLive(): DESEvent | null {
    while (this.heap.length > 0 && this.cancelled.has(this.heap[0].id)) {
      this.cancelled.delete(this.popRoot().id);
    }
    return this.heap[0] ?? null;
  }

  private popRoot(): DESEvent {
    const root = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return root;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 4);
      if (!before(this.heap[index], this.heap[parent])) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    while (true) {
      let best = index;
      const first = index * 4 + 1;
      for (let child = first; child < Math.min(first + 4, this.heap.length); child++) {
        if (before(this.heap[child], this.heap[best])) best = child;
      }
      if (best === index) return;
      [this.heap[index], this.heap[best]] = [this.heap[best], this.heap[index]];
      index = best;
    }
  }
}
