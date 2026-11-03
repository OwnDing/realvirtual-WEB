// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-E2E-001 — the E2E Gate gates.
 *
 * The e2e suite ran nowhere but on a maintainer's machine, and "green" there
 * meant little: 19 of 87 cases had failed for months, several of them because
 * an assertion never ran. This guard pins the properties that make the CI job
 * mean something — the WHOLE suite, no retries, no continue-on-error — and
 * ratchets the number of skip/fixme calls so a failing case cannot quietly be
 * switched off to turn the gate green.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The `e2e:` job block of the quality-gates workflow (up to the next job). */
function e2eJob(): string {
  const workflow = read('.github/workflows/quality-gates.yml');
  const start = workflow.indexOf('\n  e2e:\n');
  expect(start, 'quality-gates.yml has an e2e job').toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  const block = next === -1 ? rest : rest.slice(0, next + 1);
  // Comments may name the forbidden settings; only the YAML itself counts.
  return block.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

/** skip/fixme calls across e2e/ on 2026-11-03, after EP-E2E-001 removed three. */
const SKIP_BASELINE = 16;

describe('E2E Gate (EP-E2E-001)', () => {
  it('is a CI job named "E2E Gate" that runs the full suite through verify.sh', () => {
    const job = e2eJob();
    expect(job).toContain('name: E2E Gate');
    expect(job).toContain('run: ./scripts/verify.sh e2e');
    expect(job).toContain('lfs: true');
    // Self-hosted GPU runner, opt-in by repository variable, never for forks
    // (public repository: a fork PR would run arbitrary code on the runner).
    expect(job).toContain('runs-on: [self-hosted, gpu]');
    expect(job).toContain("vars.E2E_GPU_RUNNER == 'true'");
    expect(job).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(job).not.toMatch(/continue-on-error/);
    // KD-003: the formal embed artifact is guarded where it is built.
    expect(job).toMatch(/RV_REQUIRE_EMBED_DIST: '1'[\s\S]*tests\/embed-spike\.node\.test\.ts/);
    expect(job).not.toMatch(/--(grep|shard|last-failed|only-changed|retries)/);
  });

  it('verify.sh e2e and npm run e2e run every spec with no filter', () => {
    expect(read('scripts/verify.sh')).toMatch(/run_e2e\(\) \{[\s\S]*?npm run e2e\n/);
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts.e2e).toBe('npx playwright test');
  });

  it('playwright.config.ts never retries and forbids .only on CI', () => {
    const config = read('playwright.config.ts');
    expect(config).toMatch(/\n {2}retries: 0,\n/);
    expect(config).toMatch(/\n {2}forbidOnly: CI,\n/);
  });

  it('the number of skip/fixme calls in e2e/ does not grow', () => {
    const pattern = /\b(?:test|describe)\.(?:skip|fixme)\(/g;
    let count = 0;
    for (const name of readdirSync(join(ROOT, 'e2e'))) {
      if (!name.endsWith('.ts')) continue;
      count += (read(`e2e/${name}`).match(pattern) ?? []).length;
    }
    expect(count, 'a new skip/fixme needs a recorded decision and a baseline update').toBeLessThanOrEqual(SKIP_BASELINE);
  });
});
