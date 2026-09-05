// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile, statfs } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { createServer } from 'node:net';
import { dirname, parse, resolve } from 'node:path';
import { targetForPlatform, verifyBundle } from './bundle.mjs';
import { validateApplianceConfig, validateCustomerCertificate } from './config.mjs';
import { assessDataFormatReadability, assessReleaseUpgrade } from './compatibility.mjs';

const NATIVE_ENTRYPOINTS = {
  'linux-x64': ['runtime/node/bin/node', 'runtime/caddy/caddy', 'runtime/connect/realvirtual-Connect', 'runtime/forgejo/forgejo', 'runtime/influxdb/influxd', 'runtime/influx-cli/influx'],
  'linux-arm64': ['runtime/node/bin/node', 'runtime/caddy/caddy', 'runtime/connect/realvirtual-Connect', 'runtime/forgejo/forgejo', 'runtime/influxdb/influxd', 'runtime/influx-cli/influx'],
  'windows-x64': ['runtime/node/node.exe', 'runtime/caddy/caddy.exe', 'runtime/connect/realvirtual-Connect.exe', 'runtime/forgejo/forgejo.exe', 'runtime/influxdb/influxd.exe', 'runtime/influx-cli/influx.exe', 'runtime/winsw/winsw.exe'],
};

function finding(id, level, status, code, detail, data = null) {
  return { id, level, status, code, detail, data };
}

async function canBind(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => resolvePromise({ ok: false, code: error.code ?? 'PORT_UNAVAILABLE' }));
    server.listen({ host: '0.0.0.0', port, exclusive: true }, () => server.close(() => resolvePromise({ ok: true })));
  });
}

function commandWorks(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return !result.error && result.status !== null;
}

function hasAdministrativePrivileges() {
  if (process.platform !== 'win32') return typeof process.getuid === 'function' && process.getuid() === 0;
  return commandWorks('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'if ((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }',
  ]);
}

async function nearestExistingPath(value) {
  let current = resolve(value);
  const filesystemRoot = parse(current).root;
  while (true) {
    try {
      await access(current, constants.F_OK);
      return current;
    } catch {
      if (current === filesystemRoot) throw new Error(`Cannot resolve filesystem for ${value}`);
      current = dirname(current);
    }
  }
}

async function executableFindings(bundleRoot, target) {
  const findings = [];
  for (const rel of NATIVE_ENTRYPOINTS[target] ?? []) {
    try {
      await access(resolve(bundleRoot, rel), target.startsWith('linux-') ? constants.X_OK : constants.F_OK);
      findings.push(finding(`runtime:${rel}`, 'required', 'pass', 'RUNTIME_PRESENT', rel));
    } catch {
      findings.push(finding(`runtime:${rel}`, 'required', 'fail', 'RUNTIME_MISSING', rel));
    }
  }
  return findings;
}

export async function runPreflight(options, dependencies = {}) {
  const findings = [];
  const verify = dependencies.verifyBundleImpl ?? verifyBundle;
  let manifest;
  try {
    manifest = await verify(options.bundleRoot, { expectedTarget: options.expectedTarget, verifyPlatform: options.verifyPlatform !== false });
    findings.push(finding('bundle', 'required', 'pass', 'BUNDLE_VERIFIED', `${manifest.version} ${manifest.target}`));
  } catch (error) {
    findings.push(finding('bundle', 'required', 'fail', 'BUNDLE_INVALID', error.message));
    return { ok: false, findings, manifest: null, config: null };
  }

  const upgrade = assessReleaseUpgrade(options.installedVersion ?? null, manifest.version, manifest.compatibility);
  findings.push(finding(
    'upgrade-compatibility',
    'required',
    upgrade.ok ? 'pass' : 'fail',
    upgrade.code,
    upgrade.detail,
    upgrade,
  ));
  const formats = options.installedVersion
    ? assessDataFormatReadability(options.installedCompatibility, manifest.compatibility, { allowUndeclaredWriter: true })
    : { ok: true, code: 'FRESH_INSTALL_DATA_FORMATS', detail: 'Fresh install has no existing persisted formats.' };
  findings.push(finding(
    'upgrade-data-formats',
    'required',
    formats.ok ? 'pass' : 'fail',
    formats.code,
    formats.detail,
    formats,
  ));

  let config;
  try {
    config = validateApplianceConfig(JSON.parse(await readFile(options.configPath, 'utf8')), { baseDir: resolve(options.configPath, '..') });
    findings.push(finding('config', 'required', 'pass', 'CONFIG_VALID', config.hostname));
  } catch (error) {
    findings.push(finding('config', 'required', 'fail', 'CONFIG_INVALID', error.message));
    return { ok: false, findings, manifest, config: null };
  }

  if (new Date().getUTCFullYear() < 2024) findings.push(finding('clock', 'required', 'fail', 'SYSTEM_CLOCK_INVALID', new Date().toISOString()));
  else findings.push(finding('clock', 'required', 'pass', 'SYSTEM_CLOCK_PLAUSIBLE', new Date().toISOString()));

  const elevated = dependencies.isAdministratorImpl ? await dependencies.isAdministratorImpl() : hasAdministrativePrivileges();
  findings.push(finding('privileges', 'required', elevated ? 'pass' : 'fail', elevated ? 'ADMINISTRATOR_OK' : 'ADMINISTRATOR_REQUIRED', elevated ? 'Installer can manage service and protected application paths.' : 'Run preflight and lifecycle commands from an elevated shell.'));

  if (options.mode === 'native' && manifest.target.startsWith('linux-')) {
    for (const command of ['systemctl', 'useradd', 'runuser', 'id', 'chown']) {
      const available = commandExists(command);
      findings.push(finding(`host-tool:${command}`, 'required', available ? 'pass' : 'fail', available ? 'HOST_TOOL_PRESENT' : 'HOST_TOOL_MISSING', command));
    }
  }
  if (manifest.target.startsWith('windows-')) {
    const available = commandExists('icacls.exe');
    findings.push(finding('host-tool:icacls', 'required', available ? 'pass' : 'fail', available ? 'HOST_TOOL_PRESENT' : 'HOST_TOOL_MISSING', 'icacls.exe'));
  }

  try {
    const certificate = await validateCustomerCertificate(config);
    findings.push(finding('certificate', 'required', certificate.status, certificate.code, certificate.remainingDays === undefined ? config.tls.mode : `${certificate.remainingDays} days remaining`, certificate));
  } catch (error) {
    findings.push(finding('certificate', 'required', 'fail', error.code ?? 'CERTIFICATE_INVALID', error.message));
  }

  if (config.license.file) {
    try {
      await access(config.license.file, constants.R_OK);
      findings.push(finding('license', 'required', 'pass', 'LICENSE_INPUT_PRESENT', 'Offline license input is readable.'));
    } catch {
      findings.push(finding('license', 'required', 'fail', 'LICENSE_INPUT_MISSING', 'Configured offline license input is not readable.'));
    }
  } else findings.push(finding('license', 'advisory', 'warn', 'LICENSE_INPUT_NOT_CONFIGURED', 'No offline license file was configured.'));

  const dnsLookup = dependencies.lookupImpl ?? lookup;
  for (const name of [config.hostname, config.influxHostname]) {
    try {
      const addresses = await dnsLookup(name, { all: true });
      findings.push(finding(`dns:${name}`, 'required', addresses.length ? 'pass' : 'fail', addresses.length ? 'DNS_RESOLVED' : 'DNS_EMPTY', addresses.map((item) => item.address).join(', ')));
    } catch (error) {
      findings.push(finding(`dns:${name}`, 'required', 'fail', 'DNS_UNRESOLVED', error.code ?? 'lookup failed'));
    }
  }

  if (!options.skipPortChecks) {
    for (const [name, port] of Object.entries({ http: config.httpPort, https: config.httpsPort, control: config.controlPort, connect: config.connectPort, forgejo: config.forgejoPort, influxdb: config.influxPort })) {
      const available = await (dependencies.canBindImpl ?? canBind)(port);
      findings.push(finding(`port:${name}`, 'required', available.ok ? 'pass' : 'fail', available.ok ? 'PORT_AVAILABLE' : available.code, String(port)));
    }
  }

  try {
    const diskPath = await nearestExistingPath(options.diskPath ?? options.bundleRoot);
    const fs = await statfs(diskPath);
    const free = Number(fs.bavail) * Number(fs.bsize);
    const minimum = options.minimumFreeBytes ?? 10 * 1024 ** 3;
    findings.push(finding('disk', 'required', free >= minimum ? 'pass' : 'fail', free >= minimum ? 'DISK_SPACE_OK' : 'DISK_SPACE_LOW', `${free} bytes free`, { free, minimum }));
  } catch (error) {
    findings.push(finding('disk', 'required', 'fail', 'DISK_CHECK_FAILED', error.code ?? 'unknown'));
  }

  findings.push(...await executableFindings(options.bundleRoot, manifest.target));
  if (options.mode === 'container') {
    const requested = options.containerRuntime;
    const runtime = requested
      ? ['docker', 'podman'].includes(requested) && commandWorks(requested, ['version']) && commandWorks(requested, ['compose', 'version']) ? requested : null
      : commandWorks('docker', ['version']) && commandWorks('docker', ['compose', 'version']) ? 'docker'
        : commandWorks('podman', ['version']) && commandWorks('podman', ['compose', 'version']) ? 'podman' : null;
    findings.push(finding('container-runtime', 'required', runtime ? 'pass' : 'fail', runtime ? 'CONTAINER_RUNTIME_OK' : 'CONTAINER_RUNTIME_MISSING', runtime ?? `${requested ?? 'Docker or Podman'} with Compose is required for container mode.`));
    try {
      await access(resolve(options.bundleRoot, 'images/appliance-images.tar'), constants.R_OK);
      findings.push(finding('container-images', 'required', 'pass', 'OCI_ARCHIVE_PRESENT', 'images/appliance-images.tar'));
    } catch {
      findings.push(finding('container-images', 'required', 'fail', 'OCI_ARCHIVE_MISSING', 'images/appliance-images.tar'));
    }
  }
  const actualTarget = targetForPlatform();
  const verifyPlatform = options.verifyPlatform !== false;
  findings.push(finding('platform', verifyPlatform ? 'required' : 'advisory', actualTarget === manifest.target ? 'pass' : verifyPlatform ? 'fail' : 'warn', actualTarget === manifest.target ? 'PLATFORM_MATCH' : verifyPlatform ? 'PLATFORM_MISMATCH' : 'PLATFORM_CHECK_SKIPPED', `${process.platform}/${process.arch} -> ${actualTarget ?? 'unsupported'}`));
  return { ok: !findings.some((item) => item.level === 'required' && item.status === 'fail'), findings, manifest, config };
}
