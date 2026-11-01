// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Guard for the public stub contract (src/core/rv-public-stub.ts).
 *
 * Every file under src/private-stubs is either an inert no-op — and then MUST
 * export `RV_PUBLIC_STUB = true` so callers can refuse instead of reporting a
 * write that never happened — or a deliberate re-export / registration of a
 * real public implementation, listed here with the reason. A new stub file that
 * is neither fails this test.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src/private-stubs';
const MARKER = /export const RV_PUBLIC_STUB = true;/;

/** Files that are NOT no-op stubs, with the reason they carry no marker. */
const REAL_PUBLIC_MODULES: Record<string, string> = {
  'private-plugins.ts': 'registration hook; registering no private plugins is the complete public behavior',
  'des-runner-stub.ts': 're-exports the public DES runner (EP-DES-001)',
  'plugins/des/register-des-runner.ts': 're-exports the public DES runner',
  'plugins/asset-editor/save-flow.ts': 're-exports the public smart-asset-editor save flow',
  'plugins/asset-editor/pending-open-store.ts': 're-exports core/editor/pending-asset-open',
  'custom/hmi-entry.tsx': 'mounts the public HMI App',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('public stub contract', () => {
  const files = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => relative(ROOT, f).replace(/\\/g, '/'));

  it('marks every no-op stub and only no-op stubs', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      if (file in REAL_PUBLIC_MODULES) {
        expect(MARKER.test(source), `${file} re-exports real code and must not claim to be a stub`).toBe(false);
      } else {
        expect(MARKER.test(source), `${file} is a no-op stub without the RV_PUBLIC_STUB marker`).toBe(true);
      }
    }
  });

  it('keeps the allowlist free of files that no longer exist', () => {
    for (const file of Object.keys(REAL_PUBLIC_MODULES)) expect(files).toContain(file);
  });
});
