// SPDX-License-Identifier: AGPL-3.0-only
export type QualityMode = 'auto' | 'high' | 'balanced' | 'fast' | 'manual';
export interface QualitySnapshot {
  mode: QualityMode;
  tier: 0 | 1 | 2;
}
/** Wall-time hysteresis, sampled only across consecutive active rendered frames. */
export class AdaptiveQuality {
  private snapshot: QualitySnapshot = { mode: 'manual', tier: 2 };
  private listeners = new Set<() => void>();
  private last = 0;
  private elapsed = 0;
  private frames = 0;
  private cooldownUntil = 0;
  constructor(private apply: (tier: 0 | 1 | 2 | null) => void) {}
  getSnapshot = (): QualitySnapshot => this.snapshot;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private reset(): void {
    this.last = 0;
    this.elapsed = 0;
    this.frames = 0;
  }
  setMode(mode: QualityMode, initialTier: 0 | 1 | 2 = 2, now = performance.now()): void {
    const tier = mode === 'auto' ? initialTier : mode === 'fast' ? 0 : mode === 'balanced' ? 1 : 2;
    this.reset();
    this.cooldownUntil = now + 3000;
    this.snapshot = { mode, tier };
    this.apply(mode === 'manual' ? null : tier);
    for (const fn of this.listeners) fn();
  }
  sample(now: number, active: boolean): void {
    if (this.snapshot.mode !== 'auto' || !active) {
      this.reset();
      return;
    }
    if (!this.last) {
      this.last = now;
      return;
    }
    const delta = now - this.last;
    this.last = now;
    if (delta <= 0 || delta > 1000 || now < this.cooldownUntil) {
      this.elapsed = 0;
      this.frames = 0;
      return;
    }
    this.elapsed += delta;
    this.frames++;
    const window = this.snapshot.tier === 2 ? 3000 : 6000;
    if (this.elapsed < window || this.frames < 30) return;
    const average = this.elapsed / this.frames,
      previous = this.snapshot.tier;
    const tier =
      average > 36 && previous > 0
        ? previous - 1
        : average < 19 && previous < 2
          ? previous + 1
          : previous;
    this.elapsed = 0;
    this.frames = 0;
    if (tier === previous) return;
    this.snapshot = { mode: 'auto', tier: tier as 0 | 1 | 2 };
    this.cooldownUntil = now + 10_000;
    this.apply(this.snapshot.tier);
    for (const fn of this.listeners) fn();
  }
  dispose(): void {
    this.reset();
    this.apply(null);
    this.listeners.clear();
  }
}
export interface QualityBaseline {
  dpr: number;
  shadows: boolean;
  ao: 'off' | 'gtao' | 'n8ao';
  bloom: boolean;
}
/** Clamp the user's intended settings; never enable an effect the user disabled. */
export function qualityOverrides(base: QualityBaseline, tier: 0 | 1 | 2): QualityBaseline {
  return {
    dpr: Math.min(base.dpr, tier === 0 ? 1 : tier === 1 ? 1.5 : Infinity),
    shadows: tier === 0 ? false : base.shadows,
    ao: tier < 2 ? 'off' : base.ao,
    bloom: tier < 2 ? false : base.bloom,
  };
}
