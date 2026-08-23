// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_SHARDS,
  PERFORMANCE_TEST,
  buildBrowserGateCommands,
} from '../scripts/run-browser-gate.mjs';

describe('required browser gate process boundaries', () => {
  it('covers every shard exactly once before the isolated performance test', () => {
    expect(BROWSER_SHARDS).toEqual(['1/2', '2/2']);

    const commands = buildBrowserGateCommands();
    expect(commands).toHaveLength(3);
    expect(commands.slice(0, 2).map(({ args }) => args)).toEqual([
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=1/2'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=2/2'],
    ]);
    expect(commands[2].args).toEqual(['test', '--', PERFORMANCE_TEST]);
  });

  it('does not turn an infrastructure failure into a retry or false green', () => {
    const serialized = JSON.stringify(buildBrowserGateCommands());
    expect(serialized).not.toMatch(/retry|passWithNoTests|changed|related/i);
    expect(buildBrowserGateCommands().every(({ command }) => command === 'npm')).toBe(true);
  });

  it('keeps the Browser Gate required entrypoint fail-closed', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/quality-gates.yml', import.meta.url),
      'utf8',
    );
    const verifyScript = readFileSync(new URL('../scripts/verify.sh', import.meta.url), 'utf8');

    expect(workflow).toContain('name: Browser Gate');
    expect(workflow).toContain('run: ./scripts/verify.sh browser');
    expect(workflow).toContain("RV_BROWSER_DIAGNOSTIC_INTERVAL_SECONDS: '15'");
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(verifyScript).toContain('node scripts/run-browser-gate.mjs');
  });

  it('keeps the hand-written TypeScript declaration aligned with the runner', () => {
    const exportedNames = (source: string): string[] => [
      ...source.matchAll(/^export (?:const|(?:async )?function|interface) (\w+)/gm),
    ].map((match) => match[1]).filter((name) => name !== 'BrowserGateCommand').sort();
    const implementation = readFileSync(
      new URL('../scripts/run-browser-gate.mjs', import.meta.url),
      'utf8',
    );
    const declaration = readFileSync(
      new URL('../scripts/run-browser-gate.d.mts', import.meta.url),
      'utf8',
    );

    expect(exportedNames(declaration)).toEqual(exportedNames(implementation));
  });
});
