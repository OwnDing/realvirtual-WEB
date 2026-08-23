// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-GOV-004 M3 — guards against a spec that cannot run.
 *
 * The failure class this catches is "the test looked fine and never executed":
 *
 *  - `e2e/camera-startpos.spec.ts` imported `@playwright/test`, a package this
 *    repo does not depend on (the other 29 specs import `playwright/test`).
 *    Playwright fails at COLLECTION, so that one line made `npx playwright test`
 *    abort before running anything. Every plan in this repo ran named specs
 *    instead, which is why nobody noticed the whole suite was unrunnable.
 *  - `e2e/smart-asset-editor.spec.ts` timed out waiting for `locator('canvas')`
 *    because headless Chromium had no GPU, so every assertion after line 22 had
 *    never executed while the spec reported only a timeout.
 *
 * Both are cheap to assert statically and expensive to notice otherwise.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E_DIR = resolve(process.cwd(), 'e2e');
const PKG = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function specs(): string[] {
  return readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));
}

describe('EP-GOV-004 M3 — the e2e suite stays collectable', () => {
  it('has specs to check', () => {
    expect(specs().length).toBeGreaterThan(20);
  });

  it('every spec imports Playwright from a package this repo actually depends on', () => {
    const declared = new Set([
      ...Object.keys(PKG.dependencies ?? {}),
      ...Object.keys(PKG.devDependencies ?? {}),
    ]);
    const offenders = specs().flatMap((name) => {
      const text = readFileSync(resolve(E2E_DIR, name), 'utf8');
      return [...text.matchAll(/from\s+'([^']+)'/g)]
        .map((match) => match[1])
        // Bare specifiers only; relative imports are the spec's own helpers.
        .filter((spec) => !spec.startsWith('.'))
        .filter((spec) => /playwright/i.test(spec))
        .filter((spec) => {
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          return !declared.has(pkg);
        })
        .map((spec) => `${name}: ${spec}`);
    });
    // A single undeclared import aborts collection for the ENTIRE suite.
    expect(offenders).toEqual([]);
  });

  it('every spec imports Playwright from the same entry point', () => {
    const byEntry = new Map<string, string[]>();
    for (const name of specs()) {
      const text = readFileSync(resolve(E2E_DIR, name), 'utf8');
      for (const match of text.matchAll(/from\s+'((?:@?playwright)[^']*)'/g)) {
        byEntry.set(match[1], [...(byEntry.get(match[1]) ?? []), name]);
      }
    }
    // Mixing `playwright/test` and `@playwright/test` loads two different test
    // runners into one run; keep the suite on exactly one.
    expect([...byEntry.keys()].sort()).toEqual(['playwright/test']);
  });
});
