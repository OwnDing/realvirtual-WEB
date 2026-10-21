// SPDX-License-Identifier: AGPL-3.0-only
// An in-page timer cannot stop a synchronous VM hang. Own and bound the entire
// test process tree; never target unrelated browser/node processes.
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
const files = ['tests/script-security.test.ts', 'tests/sdk-resource-limits.test.ts', 'tests/plc-sandbox-limits.test.ts', 'tests/script-host.test.ts', 'tests/rv-project-code-consent.test.ts', 'tests/rv-script-runtime-loader.test.ts', 'tests/web-component-security.test.ts'];
await Promise.all(files.map(file => access(file)));
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files], { stdio: 'inherit', detached: process.platform !== 'win32' });
let timedOut = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'inherit' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
}, 120000);
const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); }).finally(() => clearTimeout(watchdog));
await mkdir('test-results/security', { recursive: true });
await writeFile('test-results/security/script-tests.json', JSON.stringify({ generatedAt: new Date().toISOString(), files, timedOut, ...result }, null, 2));
process.exitCode = timedOut || result.code !== 0 ? 1 : 0;
