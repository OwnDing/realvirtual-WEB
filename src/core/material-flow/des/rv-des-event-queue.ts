// SPDX-License-Identifier: AGPL-3.0-only

import type { DESEvent } from './rv-des-event';

function before(a: DESEvent, b: DESEvent): boolean {
  return a.time < b.time
    || (a.time === b.time && (a.priority > b.priority
      || (a.priority === b.priority && a.id < b.id)));
}

function orderEvents(a: DESEvent, b: DESEvent): number {
  return before(a, b) ? -1 : before(b, a) ? 1 : 0;
}

/** Allocation-conscious four-ary min heap ordered by time, priority and stable id. */
export class DESEventQueue {
  private heap: DESEvent[] = [];
  private cancelled = new Set<number>();
  /**
   * Every event currently on the heap, keyed by id.
   *
   * Without it `cancel()` had to scan the heap and `DESManager.cancelEvent()`
   * had to clone-and-sort the WHOLE queue just to read one event's muId — so a
   * component failure, which cancels its events one by one, cost O(k·n log n).
   */
  private byId = new Map<number, DESEvent>();
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
    return this.insert(this.nextId++, time, actionIndex, entityId, muId, priority, data);
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
    return this.insert(this.nextSystemId--, time, actionIndex, entityId, muId, priority, data);
  }

  cancel(id: number): boolean {
    if (this.cancelled.has(id) || !this.byId.has(id)) return false;
    this.cancelled.add(id);
    return true;
  }

  /** The scheduled event with this id, cancelled or not. */
  find(id: number): DESEvent | undefined { return this.byId.get(id); }

  dequeue(): DESEvent | null {
    while (this.heap.length > 0) {
      const event = this.popRoot();
      this.byId.delete(event.id);
      if (this.cancelled.delete(event.id)) continue;
      return event;
    }
    this.cancelled.clear();
    return null;
  }

  clear(): void {
    this.heap.length = 0;
    this.cancelled.clear();
    this.byId.clear();
    this.nextId = 0;
    this.nextSystemId = -1;
  }

  snapshot(): DESEvent[] {
    return this.snapshotWhere(() => true);
  }

  /**
   * Ordered copy of the live events matching `predicate`.
   *
   * Callers that only want one component's events (failure freeze) would
   * otherwise clone and sort the entire heap to throw almost all of it away.
   */
  snapshotWhere(predicate: (event: DESEvent) => boolean): DESEvent[] {
    const matches: DESEvent[] = [];
    for (const event of this.heap) {
      if (this.cancelled.has(event.id) || !predicate(event)) continue;
      matches.push({ ...event });
    }
    return matches.sort(orderEvents);
  }

  /**
   * Earliest time among live events whose action is NOT `excludedActionIndex`.
   *
   * O(log n) per excluded event parked, versus a full clone-and-sort of the
   * heap — and this runs on the per-frame completion check, where at 50k
   * pending events the old form cost about 2.4 ms EVERY frame.
   */
  peekTimeExcludingAction(excludedActionIndex: number): number {
    const parked: DESEvent[] = [];
    let time = Number.POSITIVE_INFINITY;
    for (;;) {
      const root = this.peekLive();
      if (!root) break;
      if (root.actionIndex !== excludedActionIndex) { time = root.time; break; }
      parked.push(this.popRoot());
    }
    // The parked events are still scheduled; only their ordering was borrowed.
    for (const event of parked) {
      this.heap.push(event);
      this.siftUp(this.heap.length - 1);
    }
    return time;
  }

  restore(events: readonly DESEvent[]): void {
    this.clear();
    for (const raw of events) {
      if (!Number.isFinite(raw.time) || raw.time < 0) throw new Error(`invalid DES event time: ${raw.time}`);
      const event = { ...raw };
      this.heap.push(event);
      this.byId.set(event.id, event);
      this.nextId = Math.max(this.nextId, event.id + 1);
      if (event.id < 0) this.nextSystemId = Math.min(this.nextSystemId, event.id - 1);
    }
    for (let i = Math.floor((this.heap.length - 2) / 4); i >= 0; i--) this.siftDown(i);
  }

  private insert(
    id: number,
    time: number,
    actionIndex: number,
    entityId: number,
    muId: number,
    priority: number,
    data?: unknown,
  ): number {
    if (!Number.isFinite(time) || time < 0) throw new Error(`invalid DES event time: ${time}`);
    if (!Number.isFinite(priority)) throw new Error(`invalid DES event priority: ${priority}`);
    const event: DESEvent = {
      id, time, actionIndex, entityId, muId, priority,
      ...(data === undefined ? {} : { data }),
    };
    this.heap.push(event);
    this.byId.set(id, event);
    this.siftUp(this.heap.length - 1);
    return id;
  }

  private peekLive(): DESEvent | null {
    while (this.heap.length > 0 && this.cancelled.has(this.heap[0].id)) {
      const discarded = this.popRoot();
      this.cancelled.delete(discarded.id);
      this.byId.delete(discarded.id);
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
    const item = this.heap[index];
    while (index > 0) {
      const parent = Math.floor((index - 1) / 4);
      if (!before(item, this.heap[parent])) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = item;
  }

  private siftDown(start: number): void {
    let index = start;
    const item = this.heap[index];
    for (;;) {
      const first = index * 4 + 1;
      if (first >= this.heap.length) break;
      let best = first;
      const last = Math.min(first + 4, this.heap.length);
      for (let child = first + 1; child < last; child++) {
        if (before(this.heap[child], this.heap[best])) best = child;
      }
      if (!before(this.heap[best], item)) break;
      this.heap[index] = this.heap[best];
      index = best;
    }
    this.heap[index] = item;
  }
}
