// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_PROCESS_ENV,
  BROWSER_SHARDS,
  PERFORMANCE_TEST,
  buildBrowserGateCommands,
} from '../scripts/run-browser-gate.mjs';

describe('required browser gate process boundaries', () => {
  it('covers every shard exactly once before the isolated performance test', () => {
    expect(BROWSER_SHARDS).toEqual([
      '1/8',
      '2/8',
      '3/8',
      '4/8',
      '5/8',
      '6/8',
      '7/8',
      '8/8',
    ]);

    const commands = buildBrowserGateCommands();
    expect(commands).toHaveLength(9);
    expect(commands.slice(0, 8).map(({ args }) => args)).toEqual([
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=1/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=2/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=3/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=4/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=5/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=6/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=7/8'],
      ['test', '--', '--exclude', PERFORMANCE_TEST, '--shard=8/8'],
    ]);
    expect(commands[8].args).toEqual(['test', '--', PERFORMANCE_TEST]);
  });

  it('does not turn an infrastructure failure into a retry or false green', () => {
    const serialized = JSON.stringify(buildBrowserGateCommands());
    expect(serialized).not.toMatch(/retry|passWithNoTests|changed|related/i);
    expect(buildBrowserGateCommands().every(({ command }) => command === 'npm')).toBe(true);
  });

  it('forces the official Vitest Chromium per-file GC backport in every browser process', () => {
    const packageJson = JSON.parse(readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    )) as { devDependencies: Record<string, string> };
    const implementation = readFileSync(
      new URL('../scripts/run-browser-gate.mjs', import.meta.url),
      'utf8',
    );

    expect(BROWSER_PROCESS_ENV).toEqual({
      VITEST_CHROMIUM_GC_FORCE: '1',
      VITEST_CHROMIUM_GC_DISK_THRESHOLD_GB: '1024',
    });
    expect(implementation).toContain('env: { ...process.env, ...BROWSER_PROCESS_ENV }');
    expect(packageJson.devDependencies.vitest).toBe('^4.1.11');
    expect(packageJson.devDependencies['@vitest/browser']).toBe('^4.1.11');
    expect(packageJson.devDependencies['@vitest/browser-playwright']).toBe('^4.1.11');
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
