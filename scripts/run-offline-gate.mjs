// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'linux') throw new Error('The offline network gate requires Linux network namespaces; run it in the Linux CI runner.');
const env = { ...process.env, RV_OFFLINE_CHROMIUM: chromium.executablePath(), DEBUG: 'pw:browser' };
// Drop shell-exported functions. They are unrelated to the gate and can produce
// shell startup failures inside the isolated child environment.
for (const key of Object.keys(env)) if (key.startsWith('BASH_FUNC_')) delete env[key];
// Prefer a network namespace with the caller's original user identity. A
// remapped user namespace can prevent Chrome for Testing's GPU subprocess
// from loading its bundled GLES libraries on hosted Ubuntu runners.
const probe = spawnSync('sudo', ['-n', 'unshare', '--net', 'true'], { env, encoding: 'utf8' });
const args = ['--user', '--map-root-user', '--net', 'sh', '-eu', '-c', 'ip link set lo up\nexec "$1" "$2"', 'offline-gate', process.execPath, resolve(root, 'scripts/offline-production-journey.mjs')];
let command = 'unshare';
env.RV_OFFLINE_NAMESPACE_MODE = 'user-and-network';
env.RV_OFFLINE_EXPECTED_IDENTITY = JSON.stringify({ uid: 0, gid: 0 });
if (probe.status === 0) {
  // Elevate only namespace setup. setpriv drops back to the caller before
  // Node/Chromium runs; no host firewall, permissions or security settings change.
  command = 'sudo';
  env.RV_OFFLINE_NAMESPACE_MODE = 'network-with-caller-identity';
  const groups = [...new Set([...process.getgroups(), process.getgid()])].sort((a, b) => a - b);
  env.RV_OFFLINE_EXPECTED_IDENTITY = JSON.stringify({ uid: process.getuid(), gid: process.getgid(), groups, home: process.env.HOME });
  args.splice(0, args.length, '-n', '--preserve-env=RV_OFFLINE_CHROMIUM,DEBUG,RV_OFFLINE_NAMESPACE_MODE,RV_OFFLINE_EXPECTED_IDENTITY', 'unshare', '--net', 'sh', '-eu', '-c', 'ip link set lo up\nexec setpriv --reuid "$1" --regid "$2" --groups "$3" --no-new-privs --inh-caps=-all --ambient-caps=-all --bounding-set=-all env "HOME=$4" "$5" "$6"', 'offline-gate', String(process.getuid()), String(process.getgid()), groups.join(','), process.env.HOME, process.execPath, resolve(root, 'scripts/offline-production-journey.mjs'));
}
console.log(`[offline] namespace: ${env.RV_OFFLINE_NAMESPACE_MODE}; identity: ${env.RV_OFFLINE_EXPECTED_IDENTITY}`);
const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
