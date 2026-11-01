// SPDX-License-Identifier: AGPL-3.0-only

/**
 * rv-public-stub — the explicit capability contract for `src/private-stubs/*`.
 *
 * A public build resolves `@rv-private/*` to inert no-op modules so the core
 * type-checks, builds and runs without the private sibling (AR-5). An inert
 * module is not a capability: calling `pivotToBottom()` on a stub does nothing,
 * and a caller that then reports `{ ok: true }` claims a write it did not make
 * (AGENTS.md P0, GOV-DOD §1).
 *
 * Every no-op stub therefore exports `RV_PUBLIC_STUB = true`. A real
 * implementation — private, or a public replacement of the stub file — does not
 * export the marker, so the check flips on its own when the capability arrives.
 * Callers MUST test the module they are about to use, never a global flag: the
 * stubs are replaced one module at a time.
 */

/** The marker a no-op stub module exports. */
export const RV_PUBLIC_STUB_MARKER = 'RV_PUBLIC_STUB' as const;

/** True when `mod` is a public no-op stub rather than a working implementation. */
export function isPublicStub(mod: unknown): boolean {
  return typeof mod === 'object' && mod !== null
    && (mod as Record<string, unknown>)[RV_PUBLIC_STUB_MARKER] === true;
}

/** The structured refusal a tool returns instead of running a no-op stub. */
export interface CapabilityUnavailable {
  error: string;
  unavailable: true;
  capability: string;
}

/**
 * Build the refusal for `capability`. `alternative`, when given, must name a
 * route that is itself available — a refusal that points at another stub sends
 * an agent round in circles.
 */
export function capabilityUnavailable(capability: string, alternative?: string): CapabilityUnavailable {
  return {
    error: `${capability} is not available in this build: the module is a public no-op stub (private bundle missing).`
      + (alternative ? ` ${alternative}` : ''),
    unavailable: true,
    capability,
  };
}

/** The first stub among `mods`, or null when all of them are real. */
export function firstPublicStub(mods: readonly unknown[]): unknown {
  return mods.find(isPublicStub) ?? null;
}
