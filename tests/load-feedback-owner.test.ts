// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-E2E-001: while the CONNECT embedded demo's gate is on screen it owns load
 * feedback. The full-screen layer must stay hidden then — it used to draw a
 * second error with a second Retry over the gate's own error card — and must
 * behave exactly as before for every other load.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { bindLoadFeedback } from '../src/core/hmi/load-feedback';
import { ModelLoadState } from '../src/core/engine/rv-load-session';

function feedback(): HTMLElement {
  const root = document.querySelector<HTMLElement>('[data-testid="model-load-feedback"]');
  if (!root) throw new Error('load feedback not mounted');
  return root;
}

let unbind: (() => void) | null = null;
afterEach(() => {
  unbind?.();
  unbind = null;
});

describe('load feedback ownership', () => {
  it('shows an error with Retry when no other surface owns the load', () => {
    const state = new ModelLoadState();
    unbind = bindLoadFeedback(state, () => {});
    state.begin().fail();
    expect(feedback().style.display).toBe('block');
    expect(feedback().dataset.phase).toBe('error');
  });

  it('stays hidden for loading AND error while the owner suppresses it', () => {
    const state = new ModelLoadState();
    unbind = bindLoadFeedback(state, () => {}, { suppressed: () => true, subscribe: () => () => {} });
    const session = state.begin();
    expect(feedback().style.display).toBe('none');
    session.fail();
    expect(feedback().style.display).toBe('none');
  });

  it('re-evaluates when the owner releases the load (demo starts running)', () => {
    const state = new ModelLoadState();
    let suppressed = true;
    const listeners = new Set<() => void>();
    unbind = bindLoadFeedback(state, () => {}, {
      suppressed: () => suppressed,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    });
    state.begin().fail();
    expect(feedback().style.display).toBe('none');

    suppressed = false;
    for (const listener of listeners) listener();
    expect(feedback().style.display).toBe('block');

    unbind();
    unbind = null;
    expect(listeners.size).toBe(0);
  });
});
