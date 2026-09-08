// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'linux') throw new Error('The offline network gate requires Linux network namespaces; run it in the Linux CI runner.');
const env = { ...process.env, RV_OFFLINE_CHROMIUM: chromium.executablePath() };
// Drop shell-exported functions. They are unrelated to the gate and can produce
// shell startup failures inside the isolated child environment.
for (const key of Object.keys(env)) if (key.startsWith('BASH_FUNC_')) delete env[key];
const probe = spawnSync('unshare', ['--user', '--map-root-user', '--net', 'true'], { env, encoding: 'utf8' });
const args = ['--user', '--map-root-user', '--net', 'sh', '-eu', '-c', 'ip link set lo up\nexec "$1" "$2"', 'offline-gate', process.execPath, resolve(root, 'scripts/offline-production-journey.mjs')];
let command = 'unshare';
if (probe.status !== 0) {
  // Some hosted Linux runners disable unprivileged namespaces. sudo changes
  // only a new child network namespace, never the host firewall or routes.
  command = 'sudo';
  args.splice(0, args.length, '-n', '--preserve-env=RV_OFFLINE_CHROMIUM', 'unshare', '--net', 'sh', '-eu', '-c', 'ip link set lo up\nexec "$1" "$2"', 'offline-gate', process.execPath, resolve(root, 'scripts/offline-production-journey.mjs'));
}
const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
