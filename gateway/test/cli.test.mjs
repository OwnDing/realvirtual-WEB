// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const main = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.mjs');

function run(args, env = {}) {
  const child = spawn(process.execPath, [main, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, exited, output: () => output };
}

test('an unconfigured gateway process starts, reports health and stops on SIGTERM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gw-cli-'));
  try {
    const config = join(dir, 'gateway.json');
    writeFileSync(config, JSON.stringify({ schemaVersion: 1, listen: { host: '127.0.0.1', port: 0 }, audit: { path: join(dir, 'audit.jsonl') }, signals: [] }));
    const proc = run(['--config', config]);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no listen line: ${proc.output()}`)), 10_000);
      const check = setInterval(() => {
        const match = /listening on [^:]+:(\d+)/.exec(proc.output());
        if (match) { clearInterval(check); clearTimeout(timer); resolve(Number(match[1])); }
      }, 20);
    });
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.source.state, 'unconfigured');
    assert.equal(health.signals, 0);
    proc.child.kill('SIGTERM');
    assert.equal(await proc.exited, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configuration errors exit with code 2 and name the field', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gw-cli-'));
  try {
    const config = join(dir, 'gateway.json');
    writeFileSync(config, JSON.stringify({ schemaVersion: 1, audit: { path: join(dir, 'a.jsonl') }, signals: [], readonly: true }));
    const proc = run(['--config', config]);
    assert.equal(await proc.exited, 2);
    assert.match(proc.output(), /config\.readonly: unknown key/);
    const missingSecret = join(dir, 'secret.json');
    writeFileSync(missingSecret, JSON.stringify({ schemaVersion: 1, audit: { path: join(dir, 'a.jsonl') }, signals: [], apiKeyEnv: 'GW_CLI_TEST_KEY_UNSET' }));
    const second = run(['--config', missingSecret], { GW_CLI_TEST_KEY_UNSET: '' });
    assert.equal(await second.exited, 2);
    assert.match(second.output(), /GW_CLI_TEST_KEY_UNSET is not set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
