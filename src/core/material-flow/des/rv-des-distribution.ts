// SPDX-License-Identifier: AGPL-3.0-only

export type SFC32State = readonly [number, number, number, number];

function splitmix32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export class SFC32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const next = splitmix32(Number.isFinite(seed) ? seed : 0);
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
  }

  next(): number {
    const t = (this.a + this.b + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = (this.b ^ (this.b >>> 9)) >>> 0;
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t / 0x1_0000_0000;
  }

  getState(): SFC32State { return [this.a, this.b, this.c, this.d]; }
  setState(state: readonly number[]): void {
    if (state.length !== 4 || state.some((value) => !Number.isFinite(value))) throw new Error('invalid SFC32 state');
    [this.a, this.b, this.c, this.d] = state.map((value) => value >>> 0) as [number, number, number, number];
  }
}

/**
 * Every distribution here samples a DURATION, so results are guaranteed to be
 * at least this many seconds — a zero-length activity would let a component
 * re-enter itself at the same simulated instant.
 */
export const MIN_DURATION_SECONDS = 0.001;

/** Max resample attempts before a truncated draw gives up on the floor. */
const MAX_TRUNCATION_ATTEMPTS = 32;

const floor = (value: number): number => Math.max(
  MIN_DURATION_SECONDS,
  Number.isFinite(value) ? value : MIN_DURATION_SECONDS,
);
const open01 = (rng: SFC32): number => Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, rng.next()));

export function exponential(rng: SFC32, mean: number): number {
  return floor(-Math.log(open01(rng)) * Math.max(0, mean));
}

/**
 * Normal duration, TRUNCATED (resampled) below `MIN_DURATION_SECONDS` rather
 * than clamped to it.
 *
 * Clamping looks harmless but it is not a normal distribution any more: it
 * collapses the whole negative tail onto a single value, so e.g. mean 5 with
 * sigma 10 produced a ~31% point mass at exactly 0.001 s and a mean far above
 * the one that was asked for. Resampling keeps the shape of the surviving
 * (positive) part of the distribution.
 *
 * Draws that cannot succeed — a distribution lying entirely below the floor —
 * fall back to the floor after a bounded number of attempts, so a mis-configured
 * model degrades instead of hanging.
 */
export function normal(rng: SFC32, mean: number, sigma: number): number {
  const spread = Math.abs(sigma);
  for (let attempt = 0; attempt < MAX_TRUNCATION_ATTEMPTS; attempt++) {
    const u1 = open01(rng);
    const u2 = open01(rng);
    const sample = mean + spread * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    if (Number.isFinite(sample) && sample >= MIN_DURATION_SECONDS) return sample;
  }
  return MIN_DURATION_SECONDS;
}

export function uniform(rng: SFC32, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return floor(lo + (hi - lo) * rng.next());
}

export function erlang(rng: SFC32, shape: number, rate: number): number {
  const k = Math.max(1, Math.floor(shape));
  const lambda = Math.max(Number.EPSILON, rate);
  let sum = 0;
  for (let i = 0; i < k; i++) sum += -Math.log(open01(rng)) / lambda;
  return floor(sum);
}

export function weibull(rng: SFC32, shape: number, scale: number): number {
  const k = Math.max(Number.EPSILON, shape);
  return floor(Math.max(0, scale) * Math.pow(-Math.log(open01(rng)), 1 / k));
}
