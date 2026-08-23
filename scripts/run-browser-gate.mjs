// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * Run the required browser gate in bounded Chromium lifetimes.
 *
 * Vitest 4.0.x + Playwright/Chromium can retain deleted temporary files during
 * very large Browser Mode runs. Once the runner runs short of disk, an
 * otherwise healthy test file can fail to import. Keeping every test while
 * splitting the suite across fresh Chromium processes releases those files at
 * the process boundary. See https://github.com/vitest-dev/vitest/issues/9437.
 */
import { spawn } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { freemem, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const GIB = 1024 ** 3;

export const BROWSER_SHARDS = Object.freeze(['1/4', '2/4', '3/4', '4/4']);
export const PERFORMANCE_TEST = 'tests/drop-target-overlay.test.ts';

export function buildBrowserGateCommands() {
  return [
    ...BROWSER_SHARDS.map((shard) => ({
      label: `browser shard ${shard}`,
      command: 'npm',
      args: ['test', '--', '--exclude', PERFORMANCE_TEST, `--shard=${shard}`],
    })),
    {
      label: 'isolated browser performance suite',
      command: 'npm',
      args: ['test', '--', PERFORMANCE_TEST],
    },
  ];
}

function bytesAvailable(path) {
  const stats = statfsSync(path);
  return stats.bavail * stats.bsize;
}

function formatGiB(bytes) {
  return `${(bytes / GIB).toFixed(2)} GiB`;
}

function diagnosticIntervalMs() {
  const seconds = Number(process.env.RV_BROWSER_DIAGNOSTIC_INTERVAL_SECONDS ?? 15);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 15_000;
}

function logHost() {
  process.stdout.write(
    `[browser-gate] host=${platform()} ${release()} node=${process.version} `
      + `tmp=${tmpdir()} memory=${formatGiB(totalmem())}\n`,
  );
}

async function runCommand(step) {
  let minimumDisk = Number.POSITIVE_INFINITY;
  let minimumMemory = Number.POSITIVE_INFINITY;
  let diagnosticError = null;

  const sample = (phase) => {
    try {
      const disk = bytesAvailable(tmpdir());
      const memory = freemem();
      minimumDisk = Math.min(minimumDisk, disk);
      minimumMemory = Math.min(minimumMemory, memory);
      process.stdout.write(
        `[browser-gate] ${step.label} ${phase}: `
          + `tmp-free=${formatGiB(disk)} memory-free=${formatGiB(memory)}\n`,
      );
    } catch (error) {
      diagnosticError = error;
    }
  };

  process.stdout.write(`\n==> ${step.label}\n`);
  sample('start');

  const child = spawn(step.command, step.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const interval = setInterval(() => sample('running'), diagnosticIntervalMs());
  interval.unref();

  const result = await new Promise((resolveResult, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveResult({ code, signal }));
  }).finally(() => clearInterval(interval));

  sample('end');
  if (Number.isFinite(minimumDisk) && Number.isFinite(minimumMemory)) {
    process.stdout.write(
      `[browser-gate] ${step.label} minimums: `
        + `tmp-free=${formatGiB(minimumDisk)} memory-free=${formatGiB(minimumMemory)}\n`,
    );
  }
  if (diagnosticError) {
    process.stderr.write(
      `[browser-gate] resource diagnostics unavailable: ${String(diagnosticError)}\n`,
    );
  }

  if (result.signal) {
    throw new Error(`${step.label} terminated by signal ${result.signal}`);
  }
  if (result.code !== 0) {
    throw new Error(`${step.label} failed with exit code ${result.code ?? 'unknown'}`);
  }
}

export async function runBrowserGate() {
  logHost();
  for (const step of buildBrowserGateCommands()) {
    await runCommand(step);
  }
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runBrowserGate().catch((error) => {
    process.stderr.write(`[browser-gate] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
