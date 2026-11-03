// SPDX-License-Identifier: AGPL-3.0-only
/** ADR-0025: alarm state machine, configuration, shelving, history and export. */
import { describe, expect, it } from 'vitest';
import { AlarmStore, parseAlarmConfig, DEFAULT_ALARM_CONFIG, HISTORY_LIMIT, type AlarmStorage } from '../src/core/hmi/alarm-store';

function memory(): AlarmStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
function harness(config = DEFAULT_ALARM_CONFIG) {
  let now = 1_000_000;
  const storage = memory();
  const store = new AlarmStore({ now: () => now, storage });
  store.configure(config);
  store.setScope('model-a');
  return { store, storage, advance: (ms: number) => { now += ms; }, state: (id: string) => store.getSnapshot().alarms.find((a) => a.id === id)?.state ?? 'gone' };
}
const motor = { path: 'Line/Motor', text: 'Motor overload' };
const door = { path: 'Line/Door', text: 'Door open' };

describe('alarm state machine (ISA-18.2, reduced)', () => {
  it('raise → ack → clear leaves no alarm; history records every step', () => {
    const h = harness();
    h.store.sync([motor]);
    expect(h.state(motor.path)).toBe('active-unack');
    expect(h.store.getSnapshot().unacknowledged).toBe(1);
    expect(h.store.ack(motor.path, 'otto')).toBe(true);
    expect(h.state(motor.path)).toBe('active-ack');
    h.store.sync([]);
    expect(h.state(motor.path)).toBe('gone');
    expect(h.store.getSnapshot().history.map((e) => [e.kind, e.user])).toEqual([['raise', null], ['ack', 'otto'], ['clear', null]]);
  });

  it('a latching alarm that returns unacknowledged stays until acknowledged', () => {
    const h = harness();
    h.store.sync([motor]);
    h.store.sync([]);
    expect(h.state(motor.path)).toBe('rtn-unack');
    h.store.sync([motor]);
    expect(h.state(motor.path)).toBe('active-unack');
    expect(h.store.getSnapshot().alarms[0].occurrences).toBe(2);
    h.store.sync([]);
    expect(h.store.ack(motor.path, 'otto')).toBe(true);
    expect(h.state(motor.path)).toBe('gone');
  });

  it('a non-latching alarm disappears on return to normal, recorded in history', () => {
    const h = harness(parseAlarmConfig({ schemaVersion: 1, latch: true, alarms: { [door.path]: { latch: false } } }));
    h.store.sync([door]);
    h.store.sync([]);
    expect(h.state(door.path)).toBe('gone');
    expect(h.store.getSnapshot().history.at(-1)?.kind).toBe('clear');
  });

  it('orders by configured priority, then newest first', () => {
    const h = harness(parseAlarmConfig({ schemaVersion: 1, defaultPriority: 'low', alarms: { [door.path]: { priority: 'critical' } } }));
    h.store.sync([motor]);
    h.advance(1000);
    h.store.sync([motor, door]);
    expect(h.store.getSnapshot().alarms.map((a) => [a.id, a.priority])).toEqual([[door.path, 'critical'], [motor.path, 'low']]);
  });

  it('shelving hides an alarm for a bounded time and re-presents it unacknowledged if still active', () => {
    const h = harness();
    h.store.sync([motor]);
    h.store.ack(motor.path, 'otto');
    expect(h.store.shelve(motor.path, 0, 'eng')).toBe(false);
    expect(h.store.shelve(motor.path, 9 * 60, 'eng')).toBe(false);
    expect(h.store.shelve(motor.path, 10, 'eng')).toBe(true);
    expect(h.state(motor.path)).toBe('shelved');
    expect(h.store.getSnapshot().unacknowledged).toBe(0);
    h.advance(9 * 60_000); h.store.tick();
    expect(h.state(motor.path)).toBe('shelved');
    h.advance(60_000); h.store.tick();
    expect(h.state(motor.path)).toBe('active-unack');
    // Shelved and returned to normal meanwhile: it ends when the shelf expires.
    h.store.shelve(motor.path, 5, 'eng');
    h.store.sync([]);
    expect(h.state(motor.path)).toBe('shelved');
    expect(h.store.unshelve(motor.path, 'eng')).toBe(true);
    expect(h.state(motor.path)).toBe('gone');
  });

  it('acknowledges all, refuses double acknowledgement and keeps a text change from being a new occurrence', () => {
    const h = harness();
    h.store.sync([motor, door]);
    expect(h.store.ackAll('otto').sort()).toEqual([door.path, motor.path]);
    expect(h.store.ack(motor.path, 'otto')).toBe(false);
    h.store.sync([{ ...motor, text: 'Motor overload (phase L2)' }, door]);
    const record = h.store.getSnapshot().alarms.find((a) => a.id === motor.path)!;
    expect(record).toMatchObject({ state: 'active-ack', occurrences: 1, text: 'Motor overload (phase L2)' });
  });

  it('persists a bounded history per scope and resets live alarms on model switch', () => {
    const h = harness();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) { h.store.sync([motor]); h.store.sync([]); h.store.ack(motor.path, null); }
    expect(h.store.getSnapshot().history).toHaveLength(HISTORY_LIMIT);
    const again = new AlarmStore({ storage: h.storage });
    again.setScope('model-a');
    expect(again.getSnapshot().history).toHaveLength(HISTORY_LIMIT);
    again.setScope('model-b');
    expect(again.getSnapshot().history).toHaveLength(0);
    h.store.sync([motor]);
    h.store.reset();
    expect(h.store.getSnapshot().alarms).toHaveLength(0);
  });

  it('exports CSV with quoting and spreadsheet-formula neutralisation', () => {
    const h = harness();
    h.store.sync([{ path: 'Line/X', text: '=HYPERLINK("evil"),"x"' }]);
    const csv = h.store.historyCsv();
    expect(csv.split('\r\n')[0]).toBe('time,alarm,text,priority,event,user');
    expect(csv).toContain(`"'=HYPERLINK(""evil""),""x"""`);
  });

  it('parses untrusted configuration conservatively', () => {
    expect(parseAlarmConfig(null)).toEqual(DEFAULT_ALARM_CONFIG);
    expect(parseAlarmConfig({ schemaVersion: 2, latch: false })).toEqual(DEFAULT_ALARM_CONFIG);
    expect(parseAlarmConfig({ schemaVersion: 1, defaultPriority: 'urgent', latch: 'yes', alarms: { a: { priority: 'medium', latch: false }, b: { priority: 'x' }, c: 5 } }))
      .toEqual({ schemaVersion: 1, defaultPriority: 'high', latch: true, alarms: { a: { priority: 'medium', latch: false } } });
  });
});
