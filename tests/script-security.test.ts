// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, vi } from 'vitest';
import { RVScriptSandbox } from '../src/core/engine/rv-script-sandbox';
import { RVScriptHost } from '../src/core/engine/rv-script-host';

describe('script security — run with an external process watchdog', () => {
  it('refuses invalid resource budgets before creating a runtime', async () => {
    for (const evalDeadlineMs of [NaN, Infinity, 0, -1]) await expect(RVScriptSandbox.create({ evalDeadlineMs })).rejects.toThrow();
  });
  it('copies bounded data without invoking guest accessors or toJSON', async () => {
    const vm = await RVScriptSandbox.create({ evalDeadlineMs: 100 });
    try {
      let calls = 0;
      vm.exposeFunction('sink', () => { calls++; });
      expect(vm.evaluate('sink({ get value() { while(true){} } })').ok).toBe(false);
      expect(calls).toBe(0);
      expect(vm.evaluate('({ a: 42, toJSON() { while(true){} } })').value).toEqual({ a: 42 });
      expect(vm.evaluate('"x".repeat(65537)').ok).toBe(false);
      expect(vm.evaluate('Array(4097).fill(1)').ok).toBe(false);
      expect(vm.evaluate('const cycle = {}; cycle.self = cycle; cycle').ok).toBe(false);
      expect(vm.evaluate('40+2').value).toBe(42);
    } finally { vm.dispose(); }
  });
  it('interrupts error accessors and poisons the sandbox', async () => {
    const vm = await RVScriptSandbox.create({ evalDeadlineMs: 20 });
    try {
      expect(vm.evaluate('throw {get message() { while(true){} }}').ok).toBe(false);
      expect(vm.isPoisoned).toBe(true);
      expect(vm.evaluate('1').ok).toBe(false);
    } finally { vm.dispose(); }
  });
  it('bounds bridge side effects even when the guest catches resource errors', async () => {
    const vm = await RVScriptSandbox.create({ evalDeadlineMs: 1000 });
    try {
      let calls = 0;
      vm.exposeFunction('write', () => { calls++; });
      expect(vm.evaluate('for(let i=0;i<2000;i++){ try{ write(); }catch{} }').ok).toBe(false);
      expect(calls).toBeLessThanOrEqual(1024);
      expect(vm.isPoisoned).toBe(true);
    } finally { vm.dispose(); }
  });
  it('does not write after argument conversion spends the remaining deadline', async () => {
    const vm = await RVScriptSandbox.create({ evalDeadlineMs: 100 });
    let now = 0, writes = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      vm.exposeFunction('expire', () => { now = 101; });
      vm.exposeFunction('write', () => { writes++; });
      const result = vm.evaluate('write(new Proxy({value:1},{ownKeys(){expire(); return ["value"];}}))');
      expect(result.ok).toBe(false);
      expect(writes).toBe(0);
      expect(vm.isPoisoned).toBe(true);
    } finally { clock.mockRestore(); vm.dispose(); }
  });
  it('interrupts setup and handler property getters; sibling contexts still run', async () => {
    const host = await RVScriptHost.create();
    try {
      const setup = host.createContext({ callDeadlineMs: 20 });
      expect(setup.evaluate('Object.defineProperty(globalThis,"setup",{get(){while(true){}}}); 0').ok).toBe(true);
      expect(setup.runSetup().ok).toBe(false);
      expect(setup.isDisabled).toBe(true);
      const handler = host.createContext({ callDeadlineMs: 20 });
      handler.loadScript('function setup(){return {get continuous(){while(true){}}}}');
      expect(handler.runSetup().ok).toBe(true);
      expect(handler.hasHandler('continuous.fixedUpdate')).toBe(false);
      expect(handler.isDisabled).toBe(true);
      expect(host.createContext({ callDeadlineMs: 100 }).evaluate('6*7').value).toBe(42);
    } finally { host.dispose(); }
  });
  it('nested host calls do not clear or extend the outer interrupt deadline', async () => {
    const host = await RVScriptHost.create();
    try {
      const outer = host.createContext({ callDeadlineMs: 20 });
      const inner = host.createContext({ callDeadlineMs: 1000 });
      outer.exposeFunction('nested', () => inner.evaluate('1+1').value);
      expect(outer.evaluate('nested(); while(true){}').ok).toBe(false);
      expect(outer.isPoisoned).toBe(true);
    } finally { host.dispose(); }
  });
});
