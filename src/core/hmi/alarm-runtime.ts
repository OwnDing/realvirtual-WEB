// SPDX-License-Identifier: AGPL-3.0-only

/**
 * alarm-runtime — one AlarmStore per viewer, fed from that viewer's ErrorStore,
 * plus the reported actions (ADR-0025). React-free.
 */

import type { ErrorStore } from '../engine/rv-error-store';
import { AlarmStore, parseAlarmConfig } from './alarm-store';
import { hmiSessionStore, reportHmiEvent } from './hmi-session-store';
import { ALARM_CONFIG_PATH, loadHmiConfig } from './hmi-project-config';

interface ViewerLike { errorStore: ErrorStore }

const stores = new WeakMap<object, AlarmStore>();
const feeds = new WeakMap<object, { count: number; dispose: () => void }>();

export function alarmStoreFor(viewer: object): AlarmStore {
  let store = stores.get(viewer);
  if (!store) { store = new AlarmStore(); stores.set(viewer, store); }
  return store;
}

/**
 * Keep the viewer's AlarmStore in step with its ErrorStore and expire shelving.
 * Reference-counted: the plugin and the panel may both connect; the feed ends
 * when the last one disconnects.
 */
export function connectAlarmFeed(viewer: ViewerLike): () => void {
  const existing = feeds.get(viewer);
  if (existing) {
    existing.count++;
  } else {
    const store = alarmStoreFor(viewer);
    const sync = () => store.sync(viewer.errorStore.getActive());
    const unsubscribe = viewer.errorStore.subscribe(sync);
    sync();
    const timer = setInterval(() => store.tick(), 1000);
    feeds.set(viewer, { count: 1, dispose: () => { unsubscribe(); clearInterval(timer); } });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const feed = feeds.get(viewer);
    if (!feed) return;
    feed.count--;
    if (feed.count === 0) { feed.dispose(); feeds.delete(viewer); }
  };
}

/** Load the project's alarm configuration and switch the history scope. */
export async function loadAlarmConfiguration(viewer: object, scope: string): Promise<void> {
  const store = alarmStoreFor(viewer);
  store.setScope(scope);
  const { value } = await loadHmiConfig(ALARM_CONFIG_PATH);
  store.configure(parseAlarmConfig(value));
}

function currentUser(): string | null {
  return hmiSessionStore.getSnapshot().username;
}

export function acknowledgeAlarm(viewer: object, id: string): boolean {
  const ok = alarmStoreFor(viewer).ack(id, currentUser());
  if (ok) void reportHmiEvent('alarm.ack', id);
  return ok;
}

export function acknowledgeAllAlarms(viewer: object): string[] {
  const ids = alarmStoreFor(viewer).ackAll(currentUser());
  for (const id of ids) void reportHmiEvent('alarm.ack', id);
  return ids;
}

export function shelveAlarm(viewer: object, id: string, minutes: number): boolean {
  const ok = alarmStoreFor(viewer).shelve(id, minutes, currentUser());
  if (ok) void reportHmiEvent('alarm.shelve', id, { minutes });
  return ok;
}

export function unshelveAlarm(viewer: object, id: string): boolean {
  const ok = alarmStoreFor(viewer).unshelve(id, currentUser());
  if (ok) void reportHmiEvent('alarm.unshelve', id);
  return ok;
}
