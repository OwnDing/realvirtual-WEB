// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from 'vitest';
import { Object3D } from 'three';
import { RVScriptHost } from '../src/core/engine/rv-script-host';
import { createSdkComponent, SdkBridge, RVEventHeap, createHeapScheduler, RVScriptComponentAdapter } from '../src/core/sdk/rv-component-sdk';

describe('SDK host resource budgets', () => {
  it('runs the first SDK setup at the default deadline without leaking initialization capabilities', async () => {
    const host = await RVScriptHost.create(); const adapter = new RVScriptComponentAdapter();
    const logs: unknown[][] = [];
    const component = createSdkComponent(host, { name: 'cold', path: 'cold', node: new Object3D(), scheduler: adapter.scheduler, log: (...args) => logs.push(args) }, `function setup(self){self.log("ready", {value:1}); return {};}`);
    try {
      expect(component.ok, component.error?.message).toBe(true);
      expect(logs).toEqual([['ready', {value:1}]]);
      expect(component.ctx.evaluate('typeof __rv_warm_bridge')).toMatchObject({ ok: true, value: 'undefined' });
    } finally { component.dispose(); adapter.dispose(); host.dispose(); }
  });

  it('bounds pending timers including cancelled storage, and subscriptions before allocation', () => {
    const heap = new RVEventHeap(); let subscriptions = 0; let released = 0;
    const bridge = new SdkBridge({ name: 'budget', path: 'budget', node: new Object3D(), scheduler: createHeapScheduler(heap, () => 0), signals: { get: () => undefined, set: () => {}, subscribe: () => { subscriptions++; return () => { released++; }; } } });
    try {
      for (let i = 0; i < 1024; i++) bridge.hostCall('sig.on', 'signal', i);
      expect(() => bridge.hostCall('sig.on', 'signal', 1024)).toThrow(/budget/);
      expect(subscriptions).toBe(1024);
      for (let i = 0; i < 8192; i++) { const id = bridge.hostCall('timer.in', 1000, 'later'); bridge.hostCall('timer.cancel', id); }
      expect(() => bridge.hostCall('timer.in', 1000, 'later')).toThrow(/budget/);
      expect(heap.storageSize).toBe(8192);
    } finally { bridge.dispose(); }
    expect(released).toBe(1024);
    expect(() => bridge.hostCall('sig.set', 'signal', 1)).toThrow(/disposed/);
  });
  it('stops same-tick timer recursion and releases callbacks when disabled', async () => {
    const host = await RVScriptHost.create(); const adapter = new RVScriptComponentAdapter({ onHandlerError: () => {} });
    let writes = 0;
    const component = createSdkComponent(host, { name: 'storm', path: 'storm', node: new Object3D(), scheduler: adapter.scheduler, signals: { get: () => undefined, set: () => { writes++; } }, log: () => {} }, `function setup(self){self.in(0,'again');return {des:{on(){self.setSignals({x:1});self.in(0,'again');}}}}`, { callDeadlineMs: 100 });
    adapter.attach(component);
    try {
      expect(component.ok).toBe(true);
      adapter.tick(1/60);
      expect(component.ctx.isDisabled).toBe(true);
      expect(writes).toBe(1024);
      expect(adapter.heap.size).toBe(0);
      expect(component.bridge.pendingTimerCount).toBe(0);
      adapter.tick(1/60); expect(writes).toBe(1024);
    } finally { component.dispose(); adapter.dispose(); host.dispose(); }
  });
  it('acknowledges fired timers so ordinary recurring timers do not leak registrations', async () => {
    const host = await RVScriptHost.create(); const adapter = new RVScriptComponentAdapter();
    const component = createSdkComponent(host, { name: 'normal', path: 'normal', node: new Object3D(), scheduler: adapter.scheduler }, `function setup(self){self.in(1,'next');return {des:{on(){self.in(1,'next');}}}}`, { callDeadlineMs: 100 });
    adapter.attach(component);
    try {
      expect(component.ok).toBe(true);
      for (let i = 0; i < 100; i++) adapter.tick(1);
      expect(component.bridge.pendingTimerCount).toBe(1);
      expect(component.ctx.isDisabled).toBe(false);
      adapter.reset(); expect(component.bridge.pendingTimerCount).toBe(0);
    } finally { component.dispose(); adapter.dispose(); host.dispose(); }
  });
});
