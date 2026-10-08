// SPDX-License-Identifier: AGPL-3.0-only
import type { PerformanceAssets } from './rv-performance-assets';
/** Per-viewer load ownership. No global state, UI imports or fabricated progress. */
export type LoadPhase =
  | 'idle'
  | 'download'
  | 'verify'
  | 'decode'
  | 'compose'
  | 'construct'
  | 'batch'
  | 'render'
  | 'ready'
  | 'error'
  | 'cancelled';
export interface LoadSnapshot {
  id: number;
  phase: LoadPhase;
  loaded: number;
  total: number | null;
  preview: boolean;
  warning: boolean;
  startedAt: number;
  elapsedMs: number;
  previewMs: number | null;
  timings: Partial<Record<LoadPhase, number>>;
}
const terminal = (p: LoadPhase) => ['idle', 'ready', 'error', 'cancelled'].includes(p);
export class ModelLoadState {
  private listeners = new Set<() => void>();
  private disposal = new Set<() => void>();
  private snapshot: LoadSnapshot = {
    id: 0,
    phase: 'idle',
    loaded: 0,
    total: null,
    preview: false,
    warning: false,
    startedAt: 0,
    elapsedMs: 0,
    previewMs: null,
    timings: {},
  };
  current: ModelLoadSession | null = null;
  getSnapshot = (): LoadSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  begin(): ModelLoadSession {
    this.cancel();
    const session = new ModelLoadSession(this, this.snapshot.id + 1);
    this.current = session;
    this.publish({
      id: session.id,
      phase: 'download',
      loaded: 0,
      total: null,
      preview: false,
      warning: false,
      startedAt: performance.now(),
      elapsedMs: 0,
      previewMs: null,
      timings: {},
    });
    return session;
  }
  cancel(): void {
    this.current?.cancel();
  }
  onDispose(fn: () => void): () => void {
    this.disposal.add(fn);
    return () => this.disposal.delete(fn);
  }
  dispose(): void {
    this.cancel();
    for (const fn of this.disposal) fn();
    this.disposal.clear();
    this.listeners.clear();
  }

  publish(snapshot: LoadSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
export class ModelLoadSession {
  visualAssets: PerformanceAssets | null = null;
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private phaseStarted = performance.now();
  constructor(
    private owner: ModelLoadState,
    readonly id: number,
  ) {}
  get active(): boolean {
    return (
      this.owner.current === this &&
      !this.signal.aborted &&
      !terminal(this.owner.getSnapshot().phase)
    );
  }
  assertCurrent(): void {
    if (this.owner.current !== this || this.signal.aborted)
      throw new DOMException('Model load cancelled', 'AbortError');
  }
  /** Stop waiting for plugin/shader work without letting a stale waiter drain the next load. */
  async waitFor<T>(work: Promise<T>): Promise<T> {
    this.assertCurrent();
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new DOMException('Model load cancelled', 'AbortError'));
      this.signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([work, cancelled]);
      this.assertCurrent();
      return result;
    } finally {
      this.signal.removeEventListener('abort', abort);
    }
  }
  private update(patch: Partial<LoadSnapshot>): void {
    if (!this.active) return;
    const previous = this.owner.getSnapshot();
    const now = performance.now();
    this.owner.publish({ ...previous, ...patch, elapsedMs: now - previous.startedAt });
  }
  phase(phase: LoadPhase): void {
    if (!this.active || phase === this.owner.getSnapshot().phase) return;
    const previous = this.owner.getSnapshot();
    const now = performance.now();
    this.update({
      phase,
      timings: {
        ...previous.timings,
        [previous.phase]: (previous.timings[previous.phase] ?? 0) + now - this.phaseStarted,
      },
    });
    this.phaseStarted = now;
  }
  bytes(loaded: number, total: number | null): void {
    this.update({ loaded, total });
  }
  assetsReady(): void {
    this.update({});
  }
  hidePreview(): void {
    this.update({ preview: false });
  }
  showPreview(): void {
    this.update({
      preview: true,
      previewMs: performance.now() - this.owner.getSnapshot().startedAt,
    });
  }
  warn(): void {
    this.update({ warning: true });
  }
  fail(): void {
    this.phase('error');
  }
  cancel(): void {
    this.phase('cancelled');
    this.controller.abort();
  }
}
