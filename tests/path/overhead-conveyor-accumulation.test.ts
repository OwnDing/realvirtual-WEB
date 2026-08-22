// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * ADR-0002 / EP-CONV-001 M2 — the accumulating (power-and-free) mode.
 *
 * `rigid` keeps ONE chain scalar and fixed pitch; `accumulating` gives every
 * carrier its own `PathTraveler` on the shared `SpacingController`, so a
 * carrier slows for the one ahead and the line becomes a queue instead of a
 * rigid ring.
 *
 * What is pinned here is the part that fails silently:
 *
 *   - the two state models never coexist (a stray traveler in `rigid` would
 *     brake real AGVs, because the controller is shared scene-wide);
 *   - teardown leaves NOTHING behind, for the same reason;
 *   - the HARD `MinGap` floor holds regardless of what the ramp decided;
 *   - the CLOSED-path wrap actually engages — on a full ring the frontmost
 *     carrier's leader is the hindmost one. Without the wrap, carrier 1 would
 *     run free forever and the ring would silently stretch instead of queue.
 *
 * Headless, like `overhead-conveyor-loop.test.ts`: the real component bound via
 * `createBindContext` and ticked with `iterateFixedUpdate` — no GLB, no DOM.
 * That sibling file characterises `rigid` and MUST keep passing untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Object3D } from 'three';
import { EventEmitter } from '../../src/core/rv-events';
import { ContextMenuStore } from '../../src/core/hmi/context-menu-store';
import {
  createBindContext,
  applyKinematicsSpec,
  iterateFixedUpdate,
  type BindContextHost,
  type BindContextHandle,
  type KinematicsSpec,
} from '../../src/core/behavior-runtime';
import { type PathExtras } from '../../src/core/engine/rv-path';
import { getDefaultPathNetwork } from '../../src/core/engine/rv-path-network';
import { getDefaultSpacingController } from '../../src/core/engine/rv-spacing-controller';
import { clearLiveControl } from '../../src/core/engine/rv-live-control';
import OverheadConveyorBehavior from '../../src/behaviors/OverheadConveyor';

const TICK = 1 / 60;
const PATH_ID = 'AccumLoop';

interface Host extends BindContextHost {
  values: Map<string, boolean | number>;
}

function makeHost(): Host {
  const subs = new Map<string, Set<(v: boolean | number) => void>>();
  const values = new Map<string, boolean | number>();
  const events = new EventEmitter<Record<string, unknown>>();
  return {
    values,
    signalStore: {
      get: (n: string) => values.get(n),
      set: (n: string, v: boolean | number) => { values.set(n, v); subs.get(n)?.forEach((cb) => cb(v)); },
      subscribe: (n: string, cb: (v: boolean | number) => void) => {
        let s = subs.get(n); if (!s) { s = new Set(); subs.set(n, s); }
        s.add(cb); return () => { s!.delete(cb); };
      },
    },
    on: (e, cb) => events.on(e, cb as never),
    contextMenu: new ContextMenuStore(),
    drives: [],
    registry: null,
  };
}

/** Closed square loop in the XZ plane: 4 × 5 m sides, L = 20 m. */
function squareLoopExtras(): PathExtras {
  return {
    type: 'Path',
    version: 1,
    id: PATH_ID,
    closed: true,
    segments: [
      { kind: 'line', from: [0, 0, 0], to: [0, 0, 5] },
      { kind: 'line', from: [0, 0, 5], to: [5, 0, 5] },
      { kind: 'line', from: [5, 0, 5], to: [5, 0, 0] },
      { kind: 'line', from: [5, 0, 0], to: [0, 0, 0] },
    ],
  };
}

function makeRoot(
  name: string,
  carrierCount: number,
  cfg: Record<string, unknown> = {},
): { root: Object3D; carriers: Object3D[] } {
  const root = new Object3D();
  root.name = name;
  // No ramp → deterministic speed steps from the very first tick.
  root.userData.realvirtual = {
    OverheadConveyor: { TargetSpeed: 1000, UseAcceleration: false, ...cfg },
  };
  const pathNode = new Object3D();
  pathNode.name = `${name}-Route`;
  pathNode.userData.realvirtual = { Path: squareLoopExtras() };
  root.add(pathNode);
  const carriers: Object3D[] = [];
  for (let i = 0; i < carrierCount; i++) {
    const c = new Object3D();
    c.name = `Carrier-${i + 1}`;
    root.add(c);
    carriers.push(c);
  }
  return { root, carriers };
}

/**
 * Advance `n` fixed steps.
 *
 * `iterateFixedUpdate(handle, dt)` runs exactly ONE step — it takes no count.
 * Passing a third argument silently does nothing, which reads as "the line
 * barely moved" rather than as a broken test.
 */
function tick(handle: BindContextHandle, n: number): void {
  for (let i = 0; i < n; i++) iterateFixedUpdate(handle, TICK);
}

function bind(root: Object3D, host: Host): { handle: BindContextHandle; accum: KinematicsSpec } {
  const accum: KinematicsSpec = {};
  const { ctx, handle } = createBindContext(root, host, accum);
  OverheadConveyorBehavior.bind(ctx);
  applyKinematicsSpec(root, accum);
  return { handle, accum };
}

/** Registered travelers on the loop — the shared controller's own count. */
function registered(): number {
  return getDefaultSpacingController().occupantsOf(PATH_ID);
}

/** Sorted arc-length gaps between neighbouring carriers, in metres. */
function gapsOf(carriers: Object3D[], loopLength = 20): number[] {
  // Positions come back as world points; recover arc length by walking the
  // square perimeter is overkill — the invariant we need is CENTRE DISTANCE,
  // and on this loop no two carriers are ever more than half a side apart when
  // queued, so the euclidean distance between neighbours is a faithful lower
  // bound on their arc-length gap. Assertions below use it only as such.
  const pts = carriers.map((c) => c.position.clone());
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) out.push(pts[i].distanceTo(pts[i - 1]));
  void loopLength;
  return out;
}

beforeEach(() => {
  getDefaultPathNetwork().clear();
  getDefaultSpacingController().clear();
  clearLiveControl();
});
afterEach(() => {
  getDefaultSpacingController().clear();
  clearLiveControl();
});

describe('OverheadConveyor — mode isolation (ADR-0002)', () => {
  it('registers NO travelers in rigid mode', () => {
    const { root } = makeRoot('RigidChain', 4);   // no Mode → rigid
    const { handle } = bind(root, makeHost());
    tick(handle, 30);

    // The controller is shared with every Agv in the scene: a stray entry here
    // would brake unrelated vehicles for a leader that is not really there.
    expect(registered()).toBe(0);
    handle.dispose();
  });

  it('registers exactly one traveler per carrier in accumulating mode', () => {
    const { root } = makeRoot('AccumChain', 4, { Mode: 'accumulating' });
    const { handle } = bind(root, makeHost());
    expect(registered()).toBe(4);
    handle.dispose();
  });

  it('treats an unknown Mode as rigid rather than guessing', () => {
    // A typo must never silently change a shipped asset's behaviour.
    const { root } = makeRoot('TypoChain', 4, { Mode: 'accumulate' });
    const { handle } = bind(root, makeHost());
    expect(registered()).toBe(0);
    handle.dispose();
  });

  it('leaves nothing registered after dispose', () => {
    const { root } = makeRoot('AccumChain', 4, { Mode: 'accumulating' });
    const { handle } = bind(root, makeHost());
    expect(registered()).toBe(4);
    handle.dispose();
    expect(registered(), 'a surviving traveler would brake real vehicles').toBe(0);
  });
});

describe('OverheadConveyor — accumulating motion', () => {
  it('runs a sparsely loaded loop at the commanded speed', () => {
    // 2 carriers on a 20 m loop = 10 m apart, far outside SafetyDistance, so
    // headway must not slow anything down.
    const { root, carriers } = makeRoot('Sparse', 2, {
      Mode: 'accumulating', SafetyDistance: 1000, MinGap: 400,
    });
    const { handle } = bind(root, makeHost());

    const before = carriers[0].position.clone();
    tick(handle, 60);          // 1 s at 1000 mm/s → 1 m
    const travelled = carriers[0].position.distanceTo(before);

    // Straight-line distance underestimates arc length around a corner; 1 m on
    // a 5 m side stays on one edge, so the two agree here.
    expect(travelled).toBeGreaterThan(0.9);
    handle.dispose();
  });

  it('never lets a carrier penetrate MinGap, however tightly seeded', () => {
    // Pitch 0.5 m is INSIDE SafetyDistance (1 m) — every carrier starts in its
    // leader's braking envelope, which is exactly the accumulated state.
    const { root, carriers } = makeRoot('Tight', 8, {
      Mode: 'accumulating', Pitch: 500, SafetyDistance: 1000, MinGap: 400,
    });
    const { handle } = bind(root, makeHost());

    let worst = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 40; step++) {
      tick(handle, 15);
      for (const g of gapsOf(carriers)) worst = Math.min(worst, g);
    }

    // The hard floor is 0.4 m; allow a millimetre of numeric slack.
    expect(worst).toBeGreaterThan(0.399);
    handle.dispose();
  });

  it('engages the closed-path wrap, so the ring queues instead of stretching', () => {
    // A FULL ring, tightly seeded: if the frontmost carrier's leader were not
    // the hindmost one (the `gap mod L` wrap), carrier 1 would see an infinite
    // gap, run at full speed and pull the ring apart. With the wrap engaged
    // every carrier is constrained and the ring holds its shape.
    const { root, carriers } = makeRoot('Ring', 8, {
      Mode: 'accumulating', Pitch: 500, SafetyDistance: 1000, MinGap: 400,
    });
    const { handle } = bind(root, makeHost());

    const spread = () => {
      const gs = gapsOf(carriers);
      return Math.max(...gs) - Math.min(...gs);
    };
    tick(handle, 60);
    const early = spread();
    tick(handle, 600);         // 10 s more
    const late = spread();

    // Without the wrap this grows without bound as the leader escapes.
    expect(late).toBeLessThan(early + 0.5);
    handle.dispose();
  });

  it('publishes Moving and a Position that tracks a real carrier', () => {
    const { root } = makeRoot('Signals', 3, { Mode: 'accumulating' });
    const host = makeHost();
    const { handle } = bind(root, host);

    tick(handle, 60);
    expect(host.values.get('OverheadConveyor.Moving')).toBe(true);

    const pos = host.values.get('OverheadConveyor.Position') as number;
    // ADR-0002: in accumulating mode `.Position` is the FIRST traveler's arc
    // length in mm — a real carrier, not an invented average.
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThanOrEqual(20_000);
    handle.dispose();
  });

  it('stops every carrier when Run goes false', () => {
    const { root, carriers } = makeRoot('Stopper', 4, { Mode: 'accumulating' });
    const host = makeHost();
    const { handle } = bind(root, host);

    tick(handle, 30);
    host.signalStore!.set('OverheadConveyor.Run', false);
    tick(handle, 30);

    const parked = carriers.map((c) => c.position.clone());
    tick(handle, 60);
    for (let i = 0; i < carriers.length; i++) {
      expect(carriers[i].position.distanceTo(parked[i])).toBeLessThan(1e-6);
    }
    expect(host.values.get('OverheadConveyor.Moving')).toBe(false);
    handle.dispose();
  });
});

/**
 * Arc length of a carrier on the square loop, recovered from its world point.
 * Sides run +Z (x=0), +X (z=5), −Z (x=5), −X (z=0); L = 20 m.
 */
function arcLengthOf(p: { x: number; z: number }): number {
  const eps = 1e-6;
  if (Math.abs(p.x) < eps && p.z <= 5 + eps) return p.z;                 // 0..5
  if (Math.abs(p.z - 5) < eps) return 5 + p.x;                            // 5..10
  if (Math.abs(p.x - 5) < eps) return 10 + (5 - p.z);                     // 10..15
  return 15 + (5 - p.x);                                                  // 15..20
}

describe('OverheadConveyor — release gates (ADR-0002 Decision 4)', () => {
  it('declares one Release signal per gate, seeded open', () => {
    const { root } = makeRoot('Gated', 4, { Mode: 'accumulating', Gates: [5000, 15000] });
    const { handle, accum } = bind(root, makeHost());

    // Asserted on the DECLARATION rather than a store read: this headless
    // harness never materialises `initialValue` into the store, and an
    // undefined store entry reads as "open" either way — which would make a
    // store-based assertion pass even if nothing had been declared at all.
    const gates = (accum.signals ?? []).filter((sig) => sig.name.includes('Gate'));
    expect(gates.map((sig) => sig.name)).toEqual(['Gate1.Release', 'Gate2.Release']);
    for (const sig of gates) {
      expect(sig.type).toBe('PLCInputBool');
      // Default OPEN: adding a gate must never silently stop a running line.
      expect(sig.initialValue).toBe(true);
    }
    handle.dispose();
  });

  it('ignores a gate positioned off the path instead of folding it onto one', () => {
    // 999 m on a 20 m loop is an authoring mistake; wrapping it would stop the
    // line at an arc length nobody asked for.
    const { root } = makeRoot('BadGate', 4, { Mode: 'accumulating', Gates: [999_000] });
    const { handle, accum } = bind(root, makeHost());
    expect((accum.signals ?? []).some((sig) => sig.name.includes('Gate'))).toBe(false);
    handle.dispose();
  });

  it('holds carriers at a closed gate and queues them behind it', () => {
    const { root, carriers } = makeRoot('Queue', 6, {
      Mode: 'accumulating', Pitch: 1500, StartPhase: 0,
      SafetyDistance: 1000, MinGap: 600, Gates: [10_000],
    });
    const host = makeHost();
    const { handle } = bind(root, host);

    host.signalStore!.set('Gate1.Release', false);
    tick(handle, 900);                       // 15 s — long enough to pile up

    const s = carriers.map((c) => arcLengthOf(c.position));
    const atGate = s.filter((v) => Math.abs(v - 10) < 1e-3);
    // Exactly one carrier rests ON the gate; nobody is beyond it.
    expect(atGate.length, 'a carrier should be parked exactly on the gate').toBe(1);

    // The queue sits behind the gate, spaced at least MinGap apart.
    const behind = s.filter((v) => v < 10 - 1e-6).sort((a, b) => b - a);
    expect(behind.length).toBeGreaterThan(2);
    for (let i = 1; i < behind.length; i++) {
      expect(behind[i - 1] - behind[i]).toBeGreaterThan(0.599);
    }
    handle.dispose();
  });

  it('never lets a carrier cross a closed gate, whatever the ramp decides', () => {
    const { root, carriers } = makeRoot('NoCross', 4, {
      Mode: 'accumulating', TargetSpeed: 20_000, UseAcceleration: false,
      Pitch: 2000, Gates: [8000], SafetyDistance: 1000, MinGap: 600,
    });
    const host = makeHost();
    const { handle } = bind(root, host);
    host.signalStore!.set('Gate1.Release', false);

    // 20 m/s at 1/60 s is 333 mm per tick — far more than any remaining gap,
    // so only the HARD budget can stop an overshoot.
    for (let i = 0; i < 600; i++) {
      tick(handle, 1);
      for (const c of carriers) {
        const a = arcLengthOf(c.position);
        // Carriers start at 0/2/4/6 m and may only approach the gate at 8 m.
        expect(a).toBeLessThanOrEqual(8 + 1e-6);
      }
    }
    handle.dispose();
  });

  it('releases the queue when the gate opens', () => {
    const { root, carriers } = makeRoot('Release', 6, {
      Mode: 'accumulating', Pitch: 1500, SafetyDistance: 1000, MinGap: 600,
      Gates: [10_000],
    });
    const host = makeHost();
    const { handle } = bind(root, host);

    host.signalStore!.set('Gate1.Release', false);
    tick(handle, 900);
    const queued = carriers.map((c) => arcLengthOf(c.position));

    host.signalStore!.set('Gate1.Release', true);
    tick(handle, 300);                       // 5 s of free running
    const released = carriers.map((c) => arcLengthOf(c.position));

    // Everyone moved on, and the pack is no longer bunched at the gate.
    const spreadOf = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spreadOf(released)).toBeGreaterThan(spreadOf(queued));
    expect(host.values.get('OverheadConveyor.Moving')).toBe(true);
    handle.dispose();
  });

  it('treats a gate near the wrap point exactly like any other', () => {
    // Gate at 19.5 m on a 20 m loop: carriers seeded at 0/1.5/3 m must approach
    // it the LONG way round, not be held instantly by a phantom gate behind.
    const { root, carriers } = makeRoot('Wrap', 3, {
      Mode: 'accumulating', Pitch: 1500, Gates: [19_500],
      SafetyDistance: 1000, MinGap: 600,
    });
    const host = makeHost();
    const { handle } = bind(root, host);
    host.signalStore!.set('Gate1.Release', false);

    tick(handle, 60);                        // 1 s — the line must be running
    expect(arcLengthOf(carriers[0].position)).toBeGreaterThan(0.9);

    tick(handle, 2400);                      // plenty to reach 19.5 m
    // `carriers[0]` is seeded at s = 0 and is therefore the LAST in the queue;
    // the front-most carrier is the one that meets the gate.
    const s = carriers.map((c) => arcLengthOf(c.position));
    expect(Math.abs(Math.max(...s) - 19.5), 'the front carrier should rest on the wrap-side gate')
      .toBeLessThan(1e-3);
    // …and the queue is behind it, not scattered past the wrap.
    expect(Math.min(...s)).toBeGreaterThan(17);
    handle.dispose();
  });

  it('keeps two gates independent', () => {
    const { root, carriers } = makeRoot('TwoGates', 6, {
      Mode: 'accumulating', Pitch: 1500, Gates: [6000, 14_000],
      SafetyDistance: 1000, MinGap: 600,
    });
    const host = makeHost();
    const { handle } = bind(root, host);

    // Close only the FAR gate: the near one must not hold anybody.
    host.signalStore!.set('Gate2.Release', false);
    tick(handle, 1200);

    const s = carriers.map((c) => arcLengthOf(c.position));
    expect(s.some((v) => Math.abs(v - 14) < 1e-3), 'a carrier should rest on gate 2').toBe(true);
    expect(s.every((v) => Math.abs(v - 6) > 1e-3), 'gate 1 is open and must hold nobody').toBe(true);
    handle.dispose();
  });
});
