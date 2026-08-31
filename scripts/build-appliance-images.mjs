// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { sha256File } from '../appliance/runtime/lib/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function arg(args, name, fallback = null) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
}

function requiredArg(args, name) {
  const value = arg(args, name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function validateBaseLock(raw, target) {
  if (!raw || raw.schemaVersion !== 1 || raw.target !== target) throw new Error(`Base image lock must target ${target}.`);
  if (raw.testFixture === true) throw new Error('A test-fixture base image lock cannot produce formal appliance images.');
  for (const id of ['edge', 'control', 'connect', 'forgejo', 'influxdb']) {
    const image = raw.images?.[id];
    if (typeof image !== 'string' || !/@sha256:[0-9a-f]{64}$/.test(image)) throw new Error(`Base image ${id} must be pinned by sha256 digest.`);
  }
  return raw;
}

function assertLocalImages(lock, platform) {
  for (const [id, image] of Object.entries(lock.images)) {
    const result = spawnSync('docker', ['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', image], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`Pinned base image is not loaded locally (${id}): ${image}`);
    if (result.stdout.trim() !== platform) throw new Error(`Pinned base image ${id} is ${result.stdout.trim()}, expected ${platform}.`);
  }
}

function assertLinuxConnectArchitecture(path, target) {
  const header = readFileSync(path).subarray(0, 20);
  if (header.length < 20 || header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) {
    throw new Error('CONNECT container input must be a real Linux ELF executable.');
  }
  const machine = header.readUInt16LE(18);
  const expected = target === 'linux-x64' ? 62 : 183;
  if (machine !== expected) throw new Error(`CONNECT ELF architecture ${machine} does not match ${target}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const target = requiredArg(args, 'target');
  if (!['linux-x64', 'linux-arm64'].includes(target)) throw new Error('Container images target linux-x64 or linux-arm64.');
  const platform = target === 'linux-x64' ? 'linux/amd64' : 'linux/arm64';
  const lock = validateBaseLock(JSON.parse(readFileSync(resolve(requiredArg(args, 'base-lock')), 'utf8')), target);
  assertLocalImages(lock, platform);
  const connect = resolve(requiredArg(args, 'connect'));
  const expectedConnectSha = requiredArg(args, 'connect-sha256').toLowerCase();
  if (!existsSync(connect) || !/^[0-9a-f]{64}$/.test(expectedConnectSha) || await sha256File(connect) !== expectedConnectSha) {
    throw new Error('Linux CONNECT binary is missing or does not match --connect-sha256.');
  }
  assertLinuxConnectArchitecture(connect, target);
  const output = resolve(arg(args, 'output', join(root, 'artifacts', target, 'appliance-images.tar')));
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
  mkdirSync(dirname(output), { recursive: true });
  const contextRoot = mkdtempSync(join(tmpdir(), 'rv-appliance-image-context-'));
  mkdirSync(join(contextRoot, 'appliance-image-input'), { recursive: true });
  cpSync(connect, join(contextRoot, 'appliance-image-input', 'realvirtual-Connect'));
  cpSync(join(root, 'appliance'), join(contextRoot, 'appliance'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  try {
    for (const id of ['edge', 'control', 'connect']) {
      run('docker', [
        'build', '--pull=false', '--network=none', '--platform', platform,
        '--build-arg', `BASE_IMAGE=${lock.images[id]}`,
        '-f', join(contextRoot, 'appliance', 'container', `${id}.Dockerfile`),
        '-t', `xyvirtual-appliance/${id}:${version}`, contextRoot,
      ]);
    }
    run('docker', ['tag', lock.images.forgejo, `xyvirtual-appliance/forgejo:${version}`]);
    run('docker', ['tag', lock.images.influxdb, `xyvirtual-appliance/influxdb:${version}`]);
    run('docker', [
      'save', '--output', output,
      `xyvirtual-appliance/edge:${version}`, `xyvirtual-appliance/control:${version}`,
      `xyvirtual-appliance/connect:${version}`, `xyvirtual-appliance/forgejo:${version}`,
      `xyvirtual-appliance/influxdb:${version}`,
    ]);
    console.log(JSON.stringify({ output, sha256: await sha256File(output), target, platform }, null, 2));
  } finally {
    // contextRoot is an exact mkdtemp result owned by this invocation.
    rmSync(contextRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[appliance-images] ${error.message}`); process.exitCode = 1; });
}
