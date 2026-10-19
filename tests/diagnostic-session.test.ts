// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticSession } from '../src/core/diagnostics/session';
import { observeConsole } from '../src/core/diagnostics/console-observer';
import { clearLogBuffer, getLogBufferStats, logWarn, debug } from '../src/core/engine/rv-debug';
const sessions: DiagnosticSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.stop()); vi.restoreAllMocks(); clearLogBuffer(); });
function setup() {
  const session = new DiagnosticSession(); sessions.push(session);
  const target = Object.assign(new EventTarget(), { location: { origin: location.origin } }) as unknown as Window;
  const stop = session.start(target); return { session, target, stop };
}
describe('local diagnostic capture lifecycle', () => {
  it('observes errors/rejections and forwards console calls without retaining raw data', () => {
    const original = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session, target, stop } = setup();
    const originalError = new Error('fixture-sensitive-value');
    target.dispatchEvent(new ErrorEvent('error', { error: originalError }));
    target.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: originalError }));
    console.warn('fixture-sensitive-value', { token: 'fixture-sensitive-value' });
    expect(original).toHaveBeenCalledOnce();
    expect(session.snapshot().events.map(e => e.code)).toEqual(['WINDOW_ERROR', 'UNHANDLED_REJECTION', 'CONSOLE_WARN']);
    expect(JSON.stringify(session.snapshot())).not.toContain('fixture-sensitive-value');
    stop(); expect(console.warn).toBe(original); expect(session.snapshot().events).toEqual([]);
  });
  it('coexists with DEV observers, preserving either uninstall order', () => {
    for (const productionFirst of [true, false]) {
      const original = vi.spyOn(console, 'error').mockImplementation(() => {});
      const session = new DiagnosticSession(); sessions.push(session);
      const target = Object.assign(new EventTarget(), { location: { origin: location.origin } }) as unknown as Window;
      const dev = vi.fn();
      let stopDev: () => void;
      if (productionFirst) { session.start(target); stopDev = observeConsole(dev); }
      else { stopDev = observeConsole(dev); session.start(target); }
      console.error('test'); expect(dev).toHaveBeenCalledOnce(); expect(session.snapshot().events).toHaveLength(1);
      if (productionFirst) { session.stop(); console.error('second'); expect(dev).toHaveBeenCalledTimes(2); stopDev(); }
      else { stopDev(); console.error('second'); expect(session.snapshot().events).toHaveLength(2); session.stop(); }
      expect(console.error).toBe(original); original.mockRestore();
    }
  });
  it('never swallows original console output when a listener throws or recurses', () => {
    const original = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const off = observeConsole(() => { console.warn('nested'); throw new Error('capture failed'); });
    try { expect(() => console.warn('outer')).not.toThrow(); expect(original).toHaveBeenCalledTimes(2); }
    finally { off(); }
  });
  it('preserves later console wrappers without duplicating capture on remount', () => {
    const original = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const offFirst = observeConsole(() => {}), wrapped = console.warn;
    console.warn = (...args) => wrapped(...args);
    offFirst();
    const listener = vi.fn(), offSecond = observeConsole(listener);
    try { console.warn('fixture'); expect(listener).toHaveBeenCalledOnce(); expect(original).toHaveBeenCalledOnce(); }
    finally {
      offSecond(); console.warn = wrapped;
      // Restore the observer hub once the later wrapper has relinquished it.
      observeConsole(() => {})();
    }
    expect(console.warn).toBe(original);
  });
  it('does not duplicate structured logs and reports bounded history loss', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session } = setup(); logWarn('fixture'); expect(session.snapshot().events).toHaveLength(0);
    for (let i = 0; i < 205; i++) session.record('LOAD_FAILED');
    expect(session.snapshot().events).toHaveLength(200); expect(session.snapshot().overflow).toBe(5);
    clearLogBuffer(); for (let i = 0; i < 503; i++) debug('signal', 'fixture');
    expect(getLogBufferStats().overwritten).toBe(3);
  });
  it('retains capture until the final owner releases it and ignores stale release handles', () => {
    const session = new DiagnosticSession(); sessions.push(session);
    const target = Object.assign(new EventTarget(), { location: { origin: location.origin } }) as unknown as Window;
    const first = session.start(target), second = session.start(target);
    first(); target.dispatchEvent(new ErrorEvent('error'));
    expect(session.snapshot().events).toHaveLength(1);
    second(); expect(session.snapshot().events).toHaveLength(0);
    const third = session.start(target); first(); second();
    target.dispatchEvent(new ErrorEvent('error')); expect(session.snapshot().events).toHaveLength(1);
    third();
  });
  it('allows only one operation and releases ownership after cancellation', () => {
    const { session } = setup(); const first = session.begin(); expect(() => session.begin()).toThrow('DIAGNOSTIC_BUSY');
    session.cancel(); expect(first.aborted).toBe(true); session.finish(first);
    expect(session.begin().aborted).toBe(false);
  });
});
