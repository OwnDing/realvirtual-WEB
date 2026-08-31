// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { cp, readFile, rename } from 'node:fs/promises';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreflight } from './lib/preflight.mjs';
import { httpsPortSuffix, renderTemplate, validateApplianceConfig } from './lib/config.mjs';
import { createFileInventory, listBundleFiles, normalizeBundlePath, sha256File, targetForPlatform, verifyBundle } from './lib/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const bundleFromRuntime = resolve(here, '..');
const ACTIONS = new Set(['preflight', 'install', 'upgrade', 'rollback', 'backup', 'restore', 'uninstall', 'status']);

function arg(args, name, fallback = null) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback;
}

function has(args, name) {
  return args.includes(`--${name}`);
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function safeManagedRoot(value, label) {
  const path = resolve(value);
  const root = parse(path).root;
  if (/[\0\r\n]/.test(path) || path === root || path.length < root.length + 8) throw new Error(`${label} is unsafe or too broad: ${path}`);
  return path;
}

function defaultRoots(platform = process.platform) {
  if (platform === 'win32') {
    return {
      installRoot: resolve(process.env.ProgramFiles ?? 'C:\\Program Files', 'XYvirtual Appliance'),
      configRoot: resolve(process.env.ProgramData ?? 'C:\\ProgramData', 'XYvirtual Appliance', 'config'),
      stateRoot: resolve(process.env.ProgramData ?? 'C:\\ProgramData', 'XYvirtual Appliance', 'state'),
    };
  }
  return { installRoot: '/opt/xyvirtual-appliance', configRoot: '/etc/xyvirtual-appliance', stateRoot: '/var/lib/xyvirtual-appliance' };
}

function resolveRoots(options) {
  const defaults = defaultRoots(options.platform);
  return {
    installRoot: safeManagedRoot(options.installRoot ?? defaults.installRoot, 'installRoot'),
    configRoot: safeManagedRoot(options.configRoot ?? defaults.configRoot, 'configRoot'),
    stateRoot: safeManagedRoot(options.stateRoot ?? defaults.stateRoot, 'stateRoot'),
  };
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function readJsonOrNull(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function copyFileAtomicallyIfChanged(source, destination, mode) {
  const bytes = readFileSync(source);
  if (existsSync(destination) && readFileSync(destination).equals(bytes)) return;
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(temporary, bytes, { mode });
  renameSync(temporary, destination);
}

function portablePath(path, windows = process.platform === 'win32') {
  return windows ? String(path).replaceAll('\\', '/') : String(path);
}

function caddyQuote(path, windows = process.platform === 'win32') {
  if (/[\r\n]/.test(path)) throw new Error('Caddy paths cannot contain line breaks.');
  return `"${portablePath(path, windows).replaceAll('"', '\\"')}"`;
}

function installStatePath(roots) {
  return join(roots.stateRoot, 'install-state.json');
}

function currentState(roots) {
  return readJsonOrNull(installStatePath(roots));
}

function assertStableOrigin(existing, config) {
  if (!existing?.origin) return;
  const desired = `https://${config.hostname}${httpsPortSuffix(config.httpsPort)}`;
  if (existing.origin !== desired) {
    throw new Error(`Refusing to change appliance origin from ${existing.origin} to ${desired}; browser OPFS/IndexedDB/localStorage need a migration.`);
  }
}

function writeSecret(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, `${value}\n`, { mode: 0o600 });
  return readFileSync(path, 'utf8').trim();
}

function caddyBinary(releaseRoot, target) {
  return join(releaseRoot, 'runtime', 'caddy', target.startsWith('windows-') ? 'caddy.exe' : 'caddy');
}

function nodeBinary(releaseRoot, target) {
  return target.startsWith('windows-') ? join(releaseRoot, 'runtime', 'node', 'node.exe') : join(releaseRoot, 'runtime', 'node', 'bin', 'node');
}

function serviceBinary(releaseRoot, target, service) {
  const extension = target.startsWith('windows-') ? '.exe' : '';
  const names = { connect: `realvirtual-Connect${extension}`, forgejo: `forgejo${extension}`, influxdb: `influxd${extension}`, 'influx-cli': `influx${extension}` };
  return join(releaseRoot, 'runtime', service, names[service]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}${options.capture && result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  return options.capture ? result.stdout.trim() : '';
}

function caddyPasswordHash(releaseRoot, target, password, runImpl = run) {
  const output = runImpl(caddyBinary(releaseRoot, target), ['hash-password', '--algorithm', 'argon2id'], { input: `${password}\n`, capture: true });
  const hash = output.split(/\r?\n/).find((line) => /^\$2[aby]\$|^\$argon2/.test(line.trim()))?.trim();
  if (!hash) throw new Error('Caddy did not return a supported operator password hash.');
  return hash;
}

async function stageRelease(bundleRoot, roots, manifest) {
  const releases = join(roots.installRoot, 'releases');
  const finalPath = join(releases, manifest.version);
  if (existsSync(finalPath)) {
    await verifyBundle(finalPath, { expectedTarget: manifest.target });
    const [installedDigest, candidateDigest] = [
      readFileSync(join(finalPath, 'manifest.sha256'), 'utf8').trim(),
      readFileSync(join(bundleRoot, 'manifest.sha256'), 'utf8').trim(),
    ];
    if (installedDigest !== candidateDigest) throw new Error(`Release version collision for ${manifest.version}; immutable releases cannot be replaced.`);
    return finalPath;
  }
  mkdirSync(releases, { recursive: true });
  const temporary = join(releases, `.staging-${manifest.version}-${randomBytes(4).toString('hex')}`);
  await cp(bundleRoot, temporary, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  await verifyBundle(temporary, { expectedTarget: manifest.target });
  await rename(temporary, finalPath);
  return finalPath;
}

function backupConfiguration(roots, version) {
  if (!existsSync(roots.configRoot)) return null;
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const destination = join(roots.stateRoot, 'backups', `${stamp}-${randomBytes(3).toString('hex')}-before-${version}`, 'config');
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(roots.configRoot, destination, { recursive: true, errorOnExist: true, force: false });
  return destination;
}

function restoreConfigurationSnapshot(roots, snapshot) {
  if (!snapshot || !existsSync(snapshot)) return;
  if (existsSync(roots.configRoot)) rmSync(roots.configRoot, { recursive: true, force: false });
  cpSync(snapshot, roots.configRoot, { recursive: true, errorOnExist: true, force: false });
}

function dataRuntimeChanged(currentManifest, candidateManifest) {
  const versions = (manifest) => new Map((manifest.components ?? []).map((component) => [component.id, component.version]));
  const current = versions(currentManifest);
  const candidate = versions(candidateManifest);
  return ['connect', 'forgejo', 'influxdb'].some((id) => current.get(id) !== candidate.get(id));
}

function initializeSecrets(roots, config, releaseRoot, target, runImpl) {
  const secrets = join(roots.stateRoot, 'secrets');
  mkdirSync(secrets, { recursive: true, mode: 0o700 });
  const operatorPassword = existsSync(join(secrets, 'operator-password')) ? null : randomSecret(18);
  const operator = writeSecret(join(secrets, 'operator-password'), operatorPassword ?? randomSecret(18));
  const passwordHashPath = join(secrets, 'operator-password.hash');
  if (!existsSync(passwordHashPath)) writeSecret(passwordHashPath, caddyPasswordHash(releaseRoot, target, operator, runImpl));
  const values = {
    installId: writeSecret(join(secrets, 'install-id'), randomUUID()),
    operatorPassword: operator,
    operatorPasswordHash: readFileSync(passwordHashPath, 'utf8').trim(),
    influxPassword: writeSecret(join(secrets, 'influx-password'), randomSecret(24)),
    influxToken: writeSecret(join(secrets, 'influx-token'), randomSecret(36)),
    forgejoSecret: writeSecret(join(secrets, 'forgejo-secret'), randomSecret(32)),
    forgejoInternalToken: writeSecret(join(secrets, 'forgejo-internal-token'), randomSecret(48)),
  };
  return { values, generatedOperatorPassword: operatorPassword };
}

function tlsDirective(config, roots, container, windows) {
  if (config.tls.mode === 'internal-ca') return 'tls internal';
  const pki = join(roots.stateRoot, 'pki', 'customer');
  mkdirSync(pki, { recursive: true, mode: 0o700 });
  const certificate = join(pki, 'server.crt');
  const key = join(pki, 'server.key');
  copyFileAtomicallyIfChanged(config.tls.certificate, certificate, 0o644);
  copyFileAtomicallyIfChanged(config.tls.privateKey, key, 0o600);
  if (config.tls.trustBundle) copyFileAtomicallyIfChanged(config.tls.trustBundle, join(pki, 'ca.crt'), 0o644);
  if (container) return 'tls "/var/lib/xyvirtual-appliance/pki/customer/server.crt" "/var/lib/xyvirtual-appliance/pki/customer/server.key"';
  return `tls ${caddyQuote(certificate, windows)} ${caddyQuote(key, windows)}`;
}

function renderRuntimeConfiguration({ config, roots, releaseRoot, manifest, mode, secrets }) {
  mkdirSync(roots.configRoot, { recursive: true, mode: 0o700 });
  mkdirSync(join(roots.configRoot, 'connect'), { recursive: true, mode: 0o750 });
  const persistedLicense = join(roots.stateRoot, 'license', 'license.rvlic');
  if (config.license.file && existsSync(config.license.file)) copyFileAtomicallyIfChanged(config.license.file, persistedLicense, 0o640);
  else if (config.license.file && !existsSync(persistedLicense)) throw new Error('Configured offline license is unavailable and no persisted license exists.');
  const container = mode === 'container';
  const windows = manifest.target.startsWith('windows-');
  const upstream = {
    control: container ? 'control:8081' : `127.0.0.1:${config.controlPort}`,
    connect: container && !windows ? 'connect:5100' : container ? `host.docker.internal:${config.connectPort}` : `127.0.0.1:${config.connectPort}`,
    forgejo: container ? 'forgejo:3000' : `127.0.0.1:${config.forgejoPort}`,
    influxdb: container ? 'influxdb:8086' : `127.0.0.1:${config.influxPort}`,
  };
  const template = readFileSync(join(releaseRoot, 'config', 'Caddyfile.template'), 'utf8');
  const caddyfile = renderTemplate(template, {
    HOSTNAME: config.hostname,
    INFLUX_HOSTNAME: config.influxHostname,
    LISTEN_HTTP_PORT: container ? 80 : config.httpPort,
    LISTEN_HTTPS_PORT: container ? 443 : config.httpsPort,
    HTTPS_PORT: config.httpsPort,
    HTTPS_PORT_SUFFIX: httpsPortSuffix(config.httpsPort),
    TLS_DIRECTIVE: tlsDirective(config, roots, container, windows),
    OPERATOR_USER: config.authentication.operatorUser,
    OPERATOR_PASSWORD_HASH: secrets.operatorPasswordHash,
    CONTROL_UPSTREAM: upstream.control,
    CONNECT_UPSTREAM: upstream.connect,
    FORGEJO_UPSTREAM: upstream.forgejo,
    INFLUX_UPSTREAM: upstream.influxdb,
    WEB_ROOT: caddyQuote(container ? '/srv/xyvirtual/web' : join(releaseRoot, 'web'), windows && !container),
    LICENSE_ROOT: caddyQuote(container ? '/var/lib/xyvirtual-appliance/license' : join(roots.stateRoot, 'license'), windows && !container),
  });
  writeFileSync(join(roots.configRoot, 'Caddyfile'), caddyfile, { mode: 0o600 });

  const control = {
    schemaVersion: 1,
    version: manifest.version,
    target: manifest.target,
    installId: secrets.installId,
    bundleRoot: container ? '/release' : releaseRoot,
    host: container ? '0.0.0.0' : '127.0.0.1',
    port: container ? 8081 : config.controlPort,
    staticRoot: container ? '/app/static' : join(releaseRoot, 'runtime', 'static'),
    websocketPath: '/connect/webviewer',
    integrityTtlMs: 86_400_000,
    certificate: {
      mode: config.tls.mode,
      path: container
        ? config.tls.mode === 'customer'
          ? '/state-pki/customer/server.crt'
          : '/state-pki/caddy-data/caddy/pki/authorities/local/root.crt'
        : config.tls.mode === 'customer'
          ? join(roots.stateRoot, 'pki', 'customer', 'server.crt')
          : join(roots.stateRoot, 'pki', 'caddy-data', 'caddy', 'pki', 'authorities', 'local', 'root.crt'),
      hostnames: [config.hostname, config.influxHostname],
    },
    urls: {
      web: `https://${config.hostname}${httpsPortSuffix(config.httpsPort)}/`,
      git: `https://${config.hostname}${httpsPortSuffix(config.httpsPort)}/git/`,
      connectHealth: `https://${config.hostname}${httpsPortSuffix(config.httpsPort)}/connect/health`,
      influx: `https://${config.influxHostname}${httpsPortSuffix(config.httpsPort)}/`,
      diagnostics: `https://${config.hostname}${httpsPortSuffix(config.httpsPort)}/diagnostics/`,
    },
    services: [
      { id: 'connect', url: `http://${upstream.connect}/health`, required: true },
      { id: 'forgejo', url: `http://${upstream.forgejo}/api/healthz`, required: true },
      { id: 'influxdb', url: `http://${upstream.influxdb}/health`, required: true },
    ],
  };
  atomicJson(join(roots.configRoot, container ? 'control.container.json' : 'control.json'), control);
  const forgejoTemplate = readFileSync(join(releaseRoot, 'config', 'forgejo.app.ini.template'), 'utf8');
  writeFileSync(join(roots.configRoot, 'forgejo.app.ini'), renderTemplate(forgejoTemplate, {
    FORGEJO_DATA: portablePath(join(roots.stateRoot, 'data', 'forgejo'), windows), FORGEJO_PORT: config.forgejoPort,
    HOSTNAME: config.hostname, HTTPS_PORT_SUFFIX: httpsPortSuffix(config.httpsPort),
    FORGEJO_SECRET_FILE: portablePath(join(roots.stateRoot, 'secrets', 'forgejo-secret'), windows),
    FORGEJO_INTERNAL_TOKEN_FILE: portablePath(join(roots.stateRoot, 'secrets', 'forgejo-internal-token'), windows),
  }), { mode: 0o600 });
  const influxTemplate = readFileSync(join(releaseRoot, 'config', 'influxdb.toml.template'), 'utf8');
  writeFileSync(join(roots.configRoot, 'influxdb.toml'), renderTemplate(influxTemplate, {
    INFLUX_DATA: portablePath(join(roots.stateRoot, 'data', 'influxdb'), windows), INFLUX_PORT: config.influxPort,
  }), { mode: 0o600 });

  const secretEnv = join(roots.stateRoot, 'secrets', 'container.env');
  writeFileSync(secretEnv, [
    `DOCKER_INFLUXDB_INIT_PASSWORD=${secrets.influxPassword}`,
    `DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=${secrets.influxToken}`,
    `FORGEJO__security__SECRET_KEY=${secrets.forgejoSecret}`,
    `FORGEJO__security__INTERNAL_TOKEN=${secrets.forgejoInternalToken}`,
  ].join('\n') + '\n', { mode: 0o600 });
  const composeEnv = join(roots.configRoot, 'compose.env');
  writeFileSync(composeEnv, [
    `RV_APPLIANCE_VERSION=${manifest.version}`,
    `RV_HOSTNAME=${config.hostname}`,
    `RV_HTTP_PORT=${config.httpPort}`,
    `RV_HTTPS_PORT=${config.httpsPort}`,
    `RV_RELEASE_ROOT=${releaseRoot}`,
    `RV_CONFIG_ROOT=${roots.configRoot}`,
    `RV_STATE_ROOT=${roots.stateRoot}`,
    `RV_SECRET_ENV=${secretEnv}`,
  ].join('\n') + '\n', { mode: 0o600 });
  return { upstream, control, composeEnv, secretEnv };
}

function systemdQuote(value) {
  if (/[\r\n]/.test(value)) throw new Error('Systemd arguments cannot contain line breaks.');
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function linuxUnit(description, command, roots, { user = 'xyvirtual', environment = {} } = {}) {
  const environmentLines = Object.entries(environment).map(([key, value]) => `Environment=${systemdQuote(`${key}=${value}`)}`).join('\n');
  return `[Unit]\nDescription=${description}\nAfter=network.target\n\n[Service]\nType=simple\nUser=${user}\nWorkingDirectory=${systemdQuote(roots.stateRoot)}\nExecStart=${command}\nRestart=on-failure\nRestartSec=5\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nReadWritePaths=${systemdQuote(roots.stateRoot)}\n${environmentLines ? `${environmentLines}\n` : ''}\n[Install]\nWantedBy=multi-user.target\n`;
}

export function buildNativeServiceDefinitions({ roots, releaseRoot, manifest, config }) {
  const node = nodeBinary(releaseRoot, manifest.target);
  const caddy = caddyBinary(releaseRoot, manifest.target);
  if (manifest.target.startsWith('linux-')) {
    const data = join(roots.stateRoot, 'data');
    const controlCommand = `${systemdQuote(node)} ${systemdQuote(join(releaseRoot, 'runtime', 'control-plane.mjs'))} --config ${systemdQuote(join(roots.configRoot, 'control.json'))}`;
    return [
      { id: 'control', unit: linuxUnit('XYvirtual Appliance Control', controlCommand, roots) },
      { id: 'connect', unit: linuxUnit('XYvirtual CONNECT', `${systemdQuote(serviceBinary(releaseRoot, manifest.target, 'connect'))} --project-root ${systemdQuote(join(data, 'connect'))} --port ${config.connectPort}`, roots) },
      { id: 'forgejo', unit: linuxUnit('XYvirtual Project Git', `${systemdQuote(serviceBinary(releaseRoot, manifest.target, 'forgejo'))} --work-path ${systemdQuote(join(data, 'forgejo'))} --config ${systemdQuote(join(roots.configRoot, 'forgejo.app.ini'))} web`, roots) },
      { id: 'influxdb', unit: linuxUnit('XYvirtual Historian', `${systemdQuote(serviceBinary(releaseRoot, manifest.target, 'influxdb'))} --config ${systemdQuote(join(roots.configRoot, 'influxdb.toml'))}`, roots) },
      { id: 'edge', unit: linuxUnit('XYvirtual HTTPS Edge', `${systemdQuote(caddy)} run --config ${systemdQuote(join(roots.configRoot, 'Caddyfile'))} --adapter caddyfile`, roots, {
        user: 'root',
        environment: {
          XDG_DATA_HOME: join(roots.stateRoot, 'pki', 'caddy-data'),
          XDG_CONFIG_HOME: join(roots.stateRoot, 'pki', 'caddy-config'),
        },
      }) },
    ];
  }
  return ['control', 'connect', 'forgejo', 'influxdb', 'edge'].map((id) => ({ id, wrapper: join(roots.configRoot, 'windows-services', `xyvirtual-${id}.exe`), xml: join(roots.configRoot, 'windows-services', `xyvirtual-${id}.xml`) }));
}

function prepareLinuxNativePermissions(roots, runImpl) {
  try {
    runImpl('id', ['-u', 'xyvirtual'], { capture: true });
  } catch {
    runImpl('useradd', ['--system', '--no-create-home', '--home-dir', roots.stateRoot, '--shell', '/usr/sbin/nologin', 'xyvirtual']);
  }
  runImpl('chown', ['-R', 'xyvirtual:xyvirtual', roots.configRoot, join(roots.stateRoot, 'data'), join(roots.stateRoot, 'logs'), join(roots.stateRoot, 'secrets')]);
}

function windowsServiceXml(id, executable, argumentsValue, logPath) {
  const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  return `<service>\n  <id>xyvirtual-${xml(id)}</id>\n  <name>XYvirtual Appliance ${xml(id)}</name>\n  <description>XYvirtual Appliance managed service.</description>\n  <executable>${xml(executable)}</executable>\n  <arguments>${xml(argumentsValue.replaceAll('&quot;', '"'))}</arguments>\n  <logpath>${xml(logPath)}</logpath>\n  <log mode="roll-by-size"><sizeThreshold>10485760</sizeThreshold><keepFiles>5</keepFiles></log>\n  <onfailure action="restart" delay="5 sec"/>\n  <stoptimeout>30 sec</stoptimeout>\n</service>\n`;
}

function installNativeServices({ roots, releaseRoot, manifest, config, runImpl = run, unitRoot = '/etc/systemd/system' }) {
  const definitions = buildNativeServiceDefinitions({ roots, releaseRoot, manifest, config });
  if (manifest.target.startsWith('linux-')) {
    prepareLinuxNativePermissions(roots, runImpl);
    mkdirSync(unitRoot, { recursive: true });
    for (const definition of definitions) writeFileSync(join(unitRoot, `xyvirtual-${definition.id}.service`), definition.unit);
    runImpl('systemctl', ['daemon-reload']);
    for (const definition of definitions) runImpl('systemctl', ['enable', '--now', `xyvirtual-${definition.id}.service`]);
    return;
  }
  const serviceRoot = join(roots.configRoot, 'windows-services');
  const logRoot = join(roots.stateRoot, 'logs');
  mkdirSync(serviceRoot, { recursive: true }); mkdirSync(logRoot, { recursive: true });
  const winsw = join(releaseRoot, 'runtime', 'winsw', 'winsw.exe');
  const commands = {
    control: [nodeBinary(releaseRoot, manifest.target), `&quot;${join(releaseRoot, 'runtime', 'control-plane.mjs')}&quot; --config &quot;${join(roots.configRoot, 'control.json')}&quot;`],
    connect: [serviceBinary(releaseRoot, manifest.target, 'connect'), `--project-root &quot;${join(roots.stateRoot, 'data', 'connect')}&quot; --port ${config.connectPort}`],
    forgejo: [serviceBinary(releaseRoot, manifest.target, 'forgejo'), `web --config &quot;${join(roots.configRoot, 'forgejo.app.ini')}&quot;`],
    influxdb: [serviceBinary(releaseRoot, manifest.target, 'influxdb'), `--config &quot;${join(roots.configRoot, 'influxdb.toml')}&quot;`],
    edge: [caddyBinary(releaseRoot, manifest.target), `run --config &quot;${join(roots.configRoot, 'Caddyfile')}&quot; --adapter caddyfile`],
  };
  for (const definition of definitions) {
    cpSync(winsw, definition.wrapper, { force: true });
    const [executable, argumentsValue] = commands[definition.id];
    writeFileSync(definition.xml, windowsServiceXml(definition.id, executable, argumentsValue, logRoot));
    runImpl(definition.wrapper, ['install']);
    runImpl(definition.wrapper, ['start']);
  }
}

function installWindowsConnectService({ roots, releaseRoot, config, runImpl = run }) {
  const serviceRoot = join(roots.configRoot, 'windows-services');
  const logRoot = join(roots.stateRoot, 'logs');
  mkdirSync(serviceRoot, { recursive: true }); mkdirSync(logRoot, { recursive: true });
  const wrapper = join(serviceRoot, 'xyvirtual-connect.exe');
  const xml = join(serviceRoot, 'xyvirtual-connect.xml');
  cpSync(join(releaseRoot, 'runtime', 'winsw', 'winsw.exe'), wrapper, { force: true });
  writeFileSync(xml, windowsServiceXml(
    'connect',
    serviceBinary(releaseRoot, 'windows-x64', 'connect'),
    `--project-root &quot;${join(roots.stateRoot, 'data', 'connect')}&quot; --port ${config.connectPort}`,
    logRoot,
  ));
  runImpl(wrapper, ['install']);
  runImpl(wrapper, ['start']);
}

function containerCommand(runtime, composeArgs) {
  return runtime === 'podman' ? { command: 'podman', args: ['compose', ...composeArgs] } : { command: 'docker', args: ['compose', ...composeArgs] };
}

function composeProjectArgs(roots, releaseRoot) {
  return ['--env-file', join(roots.configRoot, 'compose.env'), '-f', join(releaseRoot, 'container', 'compose.yaml')];
}

function startContainer({ roots, releaseRoot, manifest, runtime = 'docker', runImpl = run }) {
  if (manifest.target.startsWith('linux-')) {
    runImpl('chown', ['-R', '10001:10001', join(roots.stateRoot, 'data', 'connect')]);
    runImpl('chown', ['-R', '1000:1000', join(roots.stateRoot, 'data', 'forgejo'), join(roots.stateRoot, 'data', 'influxdb'), join(roots.stateRoot, 'config', 'influxdb')]);
  }
  runImpl(runtime, ['load', '--input', join(releaseRoot, 'images', 'appliance-images.tar')]);
  const args = composeProjectArgs(roots, releaseRoot);
  if (manifest.target.startsWith('linux-')) args.push('--profile', 'linux-connect');
  args.push('up', '-d', '--pull', 'never');
  const command = containerCommand(runtime, args);
  runImpl(command.command, command.args);
}

function stopRuntime({ roots, releaseRoot, manifest, mode, runtime = 'docker', runImpl = run }) {
  if (mode === 'container') {
    const command = containerCommand(runtime, [...composeProjectArgs(roots, releaseRoot), 'down']);
    runImpl(command.command, command.args);
    if (manifest.target.startsWith('windows-')) {
      const wrapper = join(roots.configRoot, 'windows-services', 'xyvirtual-connect.exe');
      if (existsSync(wrapper)) { runImpl(wrapper, ['stop']); runImpl(wrapper, ['uninstall']); }
    }
    return;
  }
  if (manifest.target.startsWith('linux-')) {
    for (const id of ['edge', 'control', 'connect', 'forgejo', 'influxdb']) runImpl('systemctl', ['disable', '--now', `xyvirtual-${id}.service`]);
  } else {
    for (const id of ['edge', 'control', 'connect', 'forgejo', 'influxdb']) {
      const wrapper = join(roots.configRoot, 'windows-services', `xyvirtual-${id}.exe`);
      if (existsSync(wrapper)) { runImpl(wrapper, ['stop']); runImpl(wrapper, ['uninstall']); }
    }
  }
}

function startInstalledRuntime({ roots, state, config, runtime = 'docker', runImpl = run, systemdUnitRoot }) {
  const manifest = JSON.parse(readFileSync(join(state.releaseRoot, 'appliance-manifest.json'), 'utf8'));
  if (state.mode === 'container') {
    if (state.target.startsWith('windows-')) installWindowsConnectService({ roots, releaseRoot: state.releaseRoot, config, runImpl });
    startContainer({ roots, releaseRoot: state.releaseRoot, manifest, runtime, runImpl });
  } else installNativeServices({ roots, releaseRoot: state.releaseRoot, manifest, config, runImpl, unitRoot: systemdUnitRoot });
}

function forgejoBootstrapPath(roots) {
  return join(roots.stateRoot, 'secrets', 'forgejo-admin-bootstrap.txt');
}

function persistForgejoBootstrap(roots, output) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('Forgejo did not return the generated administrator credential.');
  writeFileSync(forgejoBootstrapPath(roots), `username: appliance\n${output.trim()}\n`, { mode: 0o600, flag: 'wx' });
}

function bootstrapNativeForgejo({ roots, releaseRoot, manifest, runImpl = run }) {
  const binary = serviceBinary(releaseRoot, manifest.target, 'forgejo');
  const globalArgs = ['--work-path', join(roots.stateRoot, 'data', 'forgejo'), '--config', join(roots.configRoot, 'forgejo.app.ini')];
  const invoke = (args, options = {}) => manifest.target.startsWith('linux-')
    ? runImpl('runuser', ['-u', 'xyvirtual', '--', binary, ...globalArgs, ...args], options)
    : runImpl(binary, [...globalArgs, ...args], options);
  invoke(['migrate'], { capture: true });
  if (existsSync(forgejoBootstrapPath(roots))) return;
  const output = invoke([
    'admin', 'user', 'create', '--username', 'appliance', '--email', 'appliance@localhost.invalid',
    '--admin', '--random-password', '--random-password-length', '24', '--must-change-password=false',
  ], { capture: true });
  persistForgejoBootstrap(roots, output);
}

async function bootstrapContainerForgejo({ roots, releaseRoot, runtime = 'docker', runImpl = run, waitImpl = null }) {
  if (existsSync(forgejoBootstrapPath(roots))) return;
  const delay = waitImpl ?? ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  const base = composeProjectArgs(roots, releaseRoot);
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const command = containerCommand(runtime, [
        ...base, 'exec', '-T', 'forgejo', 'forgejo', '--work-path', '/data/gitea', '--config', '/data/gitea/conf/app.ini',
        'admin', 'user', 'create', '--username', 'appliance', '--email', 'appliance@localhost.invalid',
        '--admin', '--random-password', '--random-password-length', '24', '--must-change-password=false',
      ]);
      persistForgejoBootstrap(roots, runImpl(command.command, command.args, { capture: true }));
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw new Error(`Forgejo administrator bootstrap failed: ${lastError?.message ?? 'timeout'}`);
}

async function bootstrapNativeInflux({ config, secrets, fetchImpl = fetch, waitImpl = null }) {
  const delay = waitImpl ?? ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  const endpoint = `http://127.0.0.1:${config.influxPort}/api/v2/setup`;
  let lastCode = 'UNREACHABLE';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const check = await fetchImpl(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (check.ok) {
        const state = await check.json();
        if (state.allowed === false) return;
        if (state.allowed === true) {
          const response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              username: 'appliance', password: secrets.influxPassword, token: secrets.influxToken,
              org: 'xyvirtual', bucket: 'signals', retentionPeriodSeconds: 0,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (response.status === 201) return;
          lastCode = `HTTP_${response.status}`;
        }
      } else lastCode = `HTTP_${check.status}`;
    } catch (error) {
      lastCode = error.code ?? error.name ?? 'UNREACHABLE';
    }
    await delay(1000);
  }
  throw new Error(`InfluxDB bootstrap failed: ${lastCode}`);
}

async function probeHttpsEdge(config, roots) {
  const certificate = config.tls.mode === 'internal-ca'
    ? join(roots.stateRoot, 'pki', 'caddy-data', 'caddy', 'pki', 'authorities', 'local', 'root.crt')
    : existsSync(join(roots.stateRoot, 'pki', 'customer', 'ca.crt'))
      ? join(roots.stateRoot, 'pki', 'customer', 'ca.crt')
      : join(roots.stateRoot, 'pki', 'customer', 'server.crt');
  if (!existsSync(certificate)) return { ok: false, code: 'TLS_EVIDENCE_PENDING' };
  const ca = readFileSync(certificate);
  return new Promise((resolvePromise) => {
    const request = httpsRequest({
      hostname: '127.0.0.1',
      port: config.httpsPort,
      path: '/health/ready',
      method: 'GET',
      ca,
      rejectUnauthorized: true,
      servername: config.hostname,
      headers: { host: `${config.hostname}${httpsPortSuffix(config.httpsPort)}` },
      timeout: 5000,
    }, (response) => {
      response.resume();
      response.once('end', () => resolvePromise({ ok: response.statusCode === 200, code: `HTTPS_${response.statusCode ?? 0}` }));
    });
    request.once('timeout', () => request.destroy(Object.assign(new Error('TLS probe timeout'), { code: 'TLS_TIMEOUT' })));
    request.once('error', (error) => resolvePromise({ ok: false, code: error.code ?? 'TLS_PROBE_FAILED' }));
    request.end();
  });
}

async function waitForReadiness(config, roots, timeoutMs = 300_000, fetchImpl = fetch, httpsProbeImpl = probeHttpsEdge) {
  const deadline = Date.now() + timeoutMs;
  let lastCode = 'UNREACHABLE';
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${config.controlPort}/health/ready`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const edge = await httpsProbeImpl(config, roots);
        if (edge.ok) return;
        lastCode = edge.code;
      } else lastCode = `HTTP_${response.status}`;
    } catch (error) {
      lastCode = error.code ?? error.name ?? 'UNREACHABLE';
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`Candidate release did not become ready: ${lastCode}`);
}

function ensureStateDirectories(roots) {
  for (const rel of ['data/connect', 'data/forgejo', 'data/influxdb', 'config/influxdb', 'pki', 'backups', 'logs', 'license', 'secrets']) {
    mkdirSync(join(roots.stateRoot, rel), { recursive: true, mode: rel === 'secrets' ? 0o700 : 0o750 });
  }
}

function hardenWindowsRoots(roots, runImpl) {
  for (const path of [roots.configRoot, roots.stateRoot]) {
    runImpl('icacls.exe', [
      path, '/inheritance:r', '/grant:r',
      '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
    ], { capture: true });
  }
}

export async function installOrUpgrade(options, dependencies = {}) {
  const bundleRoot = resolve(options.bundleRoot);
  const mode = options.mode ?? 'container';
  if (!['container', 'native'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  const roots = resolveRoots(options);
  const existing = currentState(roots);
  const preflight = await runPreflight({
    bundleRoot, configPath: resolve(options.configPath), expectedTarget: options.expectedTarget,
    mode, containerRuntime: options.containerRuntime, verifyPlatform: options.verifyPlatform,
    minimumFreeBytes: options.minimumFreeBytes, diskPath: roots.installRoot,
    skipPortChecks: Boolean(existing) || options.skipPortChecks,
  }, dependencies);
  if (!preflight.ok) {
    const codes = preflight.findings.filter((item) => item.status === 'fail').map((item) => item.code).join(', ');
    throw Object.assign(new Error(`Appliance preflight failed: ${codes}`), { preflight });
  }
  if (!preflight.manifest.modes.includes(mode)) throw new Error(`Bundle does not contain ${mode} mode.`);
  assertStableOrigin(existing, preflight.config);
  const existingManifest = existing ? await verifyBundle(existing.releaseRoot, { expectedTarget: existing.target }) : null;
  let safetyBackup = null;
  if (existing && existing.version !== preflight.manifest.version && dataRuntimeChanged(existingManifest, preflight.manifest) && !options.noStart) {
    safetyBackup = await backupAppliance({ ...options, noStop: false }, dependencies);
  }
  const configurationSnapshot = existing ? backupConfiguration(roots, preflight.manifest.version) : null;
  ensureStateDirectories(roots);
  const releaseRoot = await stageRelease(bundleRoot, roots, preflight.manifest);
  const runImpl = dependencies.runImpl ?? run;
  if (preflight.manifest.target.startsWith('windows-')) hardenWindowsRoots(roots, runImpl);
  const readinessImpl = dependencies.waitForReadinessImpl ?? waitForReadiness;
  const initialized = initializeSecrets(roots, preflight.config, releaseRoot, preflight.manifest.target, runImpl);
  const runtimeConfig = renderRuntimeConfiguration({ config: preflight.config, roots, releaseRoot, manifest: preflight.manifest, mode, secrets: initialized.values });
  cpSync(resolve(options.configPath), join(roots.configRoot, 'appliance.json'), { force: true });
  const next = {
    schemaVersion: 1,
    installId: initialized.values.installId,
    version: preflight.manifest.version,
    previousVersion: existing?.version && existing.version !== preflight.manifest.version ? existing.version : existing?.previousVersion ?? null,
    target: preflight.manifest.target,
    mode,
    origin: `https://${preflight.config.hostname}${httpsPortSuffix(preflight.config.httpsPort)}`,
    releaseRoot,
    safetyBackup,
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  atomicJson(join(roots.stateRoot, 'candidate.json'), next);
  if (!options.noStart) {
    let candidateAttempted = false;
    try {
      if (existing) stopRuntime({ roots, releaseRoot: existing.releaseRoot, manifest: { target: existing.target }, mode: existing.mode, runtime: options.containerRuntime, runImpl });
      if (mode === 'container') {
        candidateAttempted = true;
        if (preflight.manifest.target.startsWith('windows-')) {
          installWindowsConnectService({ roots, releaseRoot, config: preflight.config, runImpl });
        }
        startContainer({ roots, releaseRoot, manifest: preflight.manifest, runtime: options.containerRuntime, runImpl });
        await bootstrapContainerForgejo({ roots, releaseRoot, runtime: options.containerRuntime, runImpl, waitImpl: dependencies.waitImpl });
      } else {
        if (preflight.manifest.target.startsWith('linux-')) prepareLinuxNativePermissions(roots, runImpl);
        bootstrapNativeForgejo({ roots, releaseRoot, manifest: preflight.manifest, runImpl });
        candidateAttempted = true;
        installNativeServices({ roots, releaseRoot, manifest: preflight.manifest, config: preflight.config, runImpl, unitRoot: options.systemdUnitRoot ?? dependencies.systemdUnitRoot });
        await bootstrapNativeInflux({
          config: preflight.config, secrets: initialized.values,
          fetchImpl: dependencies.bootstrapFetchImpl ?? fetch, waitImpl: dependencies.waitImpl,
        });
      }
      await readinessImpl(preflight.config, roots, options.readinessTimeoutMs, dependencies.fetchImpl, dependencies.httpsProbeImpl);
    } catch (error) {
      try {
        if (candidateAttempted) stopRuntime({ roots, releaseRoot, manifest: preflight.manifest, mode, runtime: options.containerRuntime, runImpl });
        if (existing) {
          if (safetyBackup) {
            await restoreAppliance({
              ...options, backupPath: safetyBackup, confirmRestore: existing.installId,
              noStop: true, skipSafetyBackup: true,
            }, dependencies);
          } else restoreConfigurationSnapshot(roots, configurationSnapshot);
          const previousConfig = validateApplianceConfig(JSON.parse(readFileSync(join(roots.configRoot, 'appliance.json'), 'utf8')), { baseDir: roots.configRoot });
          startInstalledRuntime({ roots, state: existing, config: previousConfig, runtime: options.containerRuntime, runImpl, systemdUnitRoot: options.systemdUnitRoot ?? dependencies.systemdUnitRoot });
          await readinessImpl(previousConfig, roots, options.readinessTimeoutMs, dependencies.fetchImpl, dependencies.httpsProbeImpl);
        }
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], `Candidate failed and automatic recovery was not safe: ${recoveryError.message}`);
      }
      throw error;
    }
  }
  atomicJson(installStatePath(roots), next);
  atomicJson(join(roots.installRoot, 'current.json'), { schemaVersion: 1, version: next.version, releaseRoot: next.releaseRoot });
  const candidate = join(roots.stateRoot, 'candidate.json');
  if (existsSync(candidate)) rmSync(candidate);
  return { state: next, preflight, roots, runtimeConfig, generatedOperatorPassword: initialized.generatedOperatorPassword };
}

function readInstalledSecrets(roots) {
  const read = (name) => readFileSync(join(roots.stateRoot, 'secrets', name), 'utf8').trim();
  return {
    installId: read('install-id'),
    operatorPasswordHash: read('operator-password.hash'),
    influxPassword: read('influx-password'),
    influxToken: read('influx-token'),
    forgejoSecret: read('forgejo-secret'),
    forgejoInternalToken: read('forgejo-internal-token'),
  };
}

export async function rollbackAppliance(options, dependencies = {}) {
  const roots = resolveRoots(options);
  const state = currentState(roots);
  if (!state?.previousVersion) throw new Error('No previous appliance release is recorded.');
  const previousRoot = join(roots.installRoot, 'releases', state.previousVersion);
  const manifest = await verifyBundle(previousRoot, { expectedTarget: state.target });
  const activeManifest = await verifyBundle(state.releaseRoot, { expectedTarget: state.target });
  if (dataRuntimeChanged(activeManifest, manifest)) {
    throw new Error('Rollback is blocked because CONNECT, Forgejo, or InfluxDB changed; restore the pre-upgrade consistency backup instead.');
  }
  const config = validateApplianceConfig(JSON.parse(readFileSync(join(roots.configRoot, 'appliance.json'), 'utf8')), { baseDir: roots.configRoot });
  const secrets = readInstalledSecrets(roots);
  const runImpl = dependencies.runImpl ?? run;
  const readinessImpl = dependencies.waitForReadinessImpl ?? waitForReadiness;
  if (!options.noStart) stopRuntime({ roots, releaseRoot: state.releaseRoot, manifest: { target: state.target }, mode: state.mode, runtime: options.containerRuntime, runImpl });
  renderRuntimeConfiguration({ config, roots, releaseRoot: previousRoot, manifest, mode: state.mode, secrets });
  if (!options.noStart) {
    startInstalledRuntime({ roots, state: { ...state, releaseRoot: previousRoot }, config, runtime: options.containerRuntime, runImpl, systemdUnitRoot: options.systemdUnitRoot ?? dependencies.systemdUnitRoot });
    await readinessImpl(config, roots, options.readinessTimeoutMs, dependencies.fetchImpl, dependencies.httpsProbeImpl);
  }
  const next = { ...state, version: state.previousVersion, previousVersion: state.version, releaseRoot: previousRoot, updatedAt: new Date().toISOString() };
  atomicJson(installStatePath(roots), next);
  atomicJson(join(roots.installRoot, 'current.json'), { schemaVersion: 1, version: next.version, releaseRoot: next.releaseRoot });
  return next;
}

export async function backupAppliance(options, dependencies = {}) {
  const roots = resolveRoots(options);
  const state = currentState(roots);
  if (!state) throw new Error('No appliance installation state was found.');
  const config = validateApplianceConfig(JSON.parse(readFileSync(join(roots.configRoot, 'appliance.json'), 'utf8')), { baseDir: roots.configRoot });
  const runImpl = dependencies.runImpl ?? run;
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backupRoot = join(roots.stateRoot, 'backups', `${stamp}-${randomBytes(3).toString('hex')}-${state.version}`);
  if (existsSync(backupRoot)) throw new Error(`Backup already exists: ${backupRoot}`);
  if (!options.noStop) stopRuntime({ roots, releaseRoot: state.releaseRoot, manifest: { target: state.target }, mode: state.mode, runtime: options.containerRuntime, runImpl });
  try {
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    cpSync(roots.configRoot, join(backupRoot, 'config'), { recursive: true, errorOnExist: true, force: false });
    for (const rel of ['data', 'pki', 'license', 'secrets']) {
      const source = join(roots.stateRoot, rel);
      if (existsSync(source)) cpSync(source, join(backupRoot, rel), { recursive: true, errorOnExist: true, force: false });
    }
    cpSync(installStatePath(roots), join(backupRoot, 'install-state.json'));
    const files = await createFileInventory(backupRoot);
    atomicJson(join(backupRoot, 'backup-manifest.json'), {
      schemaVersion: 1, product: 'xyvirtual-web-appliance-backup', createdAt: new Date().toISOString(),
      installId: state.installId, version: state.version, target: state.target, origin: state.origin,
      files,
    });
  } finally {
    if (!options.noStop) startInstalledRuntime({ roots, state, config, runtime: options.containerRuntime, runImpl, systemdUnitRoot: options.systemdUnitRoot ?? dependencies.systemdUnitRoot });
  }
  return backupRoot;
}

async function verifyBackup(backupRoot, expectedInstallId) {
  const manifest = JSON.parse(await readFile(join(backupRoot, 'backup-manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.product !== 'xyvirtual-web-appliance-backup') throw new Error('Unsupported backup manifest.');
  if (manifest.installId !== expectedInstallId) throw new Error('Backup belongs to a different appliance installId.');
  if (!Array.isArray(manifest.files)) throw new Error('Backup manifest files must be an array.');
  let previous = '';
  const declarations = new Map();
  for (const file of manifest.files) {
    const path = normalizeBundlePath(file?.path);
    if (previous && path.localeCompare(previous) <= 0) throw new Error('Backup manifest files must be uniquely sorted.');
    previous = path;
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid backup declaration: ${path}`);
    }
    declarations.set(path, file);
  }
  const actualFiles = await listBundleFiles(backupRoot, backupRoot, new Set(['backup-manifest.json']));
  if (actualFiles.length !== declarations.size) throw new Error('Backup file count mismatch.');
  for (const actual of actualFiles) {
    const file = declarations.get(actual.path);
    if (!file) throw new Error(`Unexpected backup file: ${actual.path}`);
    const absolute = resolve(backupRoot, file.path);
    if (!absolute.startsWith(`${resolve(backupRoot)}${sep}`)) throw new Error(`Unsafe backup path: ${file.path}`);
    if (actual.bytes !== file.bytes || !existsSync(absolute) || await sha256File(absolute) !== file.sha256) throw new Error(`Backup digest mismatch: ${file.path}`);
    declarations.delete(actual.path);
  }
  if (declarations.size) throw new Error(`Missing backup file: ${[...declarations.keys()][0]}`);
  return manifest;
}

export async function restoreAppliance(options, dependencies = {}) {
  const roots = resolveRoots(options);
  const state = currentState(roots);
  if (!state) throw new Error('No appliance installation state was found.');
  if (options.confirmRestore !== state.installId) throw new Error('Restore requires --confirm-restore with the exact installId.');
  const backupRoot = resolve(options.backupPath);
  const approvedRoot = `${resolve(roots.stateRoot, 'backups')}${sep}`;
  if (!backupRoot.startsWith(approvedRoot)) throw new Error('Restore source must be inside the appliance backups directory.');
  const backupManifest = await verifyBackup(backupRoot, state.installId);
  if (backupManifest.origin !== state.origin || backupManifest.target !== state.target) throw new Error('Backup origin or target does not match this appliance.');
  const backedState = JSON.parse(readFileSync(join(backupRoot, 'install-state.json'), 'utf8'));
  if (backedState.installId !== state.installId || backedState.version !== backupManifest.version || backedState.origin !== state.origin || backedState.target !== state.target) {
    throw new Error('Backup install state does not match its manifest.');
  }
  const restoredReleaseRoot = join(roots.installRoot, 'releases', backupManifest.version);
  const restoredReleaseManifest = await verifyBundle(restoredReleaseRoot, { expectedTarget: state.target });
  const runImpl = dependencies.runImpl ?? run;
  const readinessImpl = dependencies.waitForReadinessImpl ?? waitForReadiness;
  if (!options.noStop) stopRuntime({ roots, releaseRoot: state.releaseRoot, manifest: { target: state.target }, mode: state.mode, runtime: options.containerRuntime, runImpl });
  let safetyBackup = null;
  let next = null;
  try {
    if (!options.skipSafetyBackup) safetyBackup = await backupAppliance({ ...options, noStop: true }, dependencies);
    for (const rel of ['data', 'pki', 'license', 'secrets']) {
      const destination = join(roots.stateRoot, rel);
      const source = join(backupRoot, rel);
      if (!existsSync(source)) continue;
      if (existsSync(destination)) rmSync(destination, { recursive: true, force: false });
      cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
    }
    if (existsSync(roots.configRoot)) rmSync(roots.configRoot, { recursive: true, force: false });
    cpSync(join(backupRoot, 'config'), roots.configRoot, { recursive: true, errorOnExist: true, force: false });
    const restoredConfig = validateApplianceConfig(JSON.parse(readFileSync(join(roots.configRoot, 'appliance.json'), 'utf8')), { baseDir: roots.configRoot });
    next = {
      ...backedState,
      previousVersion: state.version === backupManifest.version ? backedState.previousVersion ?? null : state.version,
      releaseRoot: restoredReleaseRoot,
      updatedAt: new Date().toISOString(),
      restoredFrom: backupRoot,
    };
    renderRuntimeConfiguration({
      config: restoredConfig, roots, releaseRoot: restoredReleaseRoot,
      manifest: restoredReleaseManifest, mode: next.mode, secrets: readInstalledSecrets(roots),
    });
    atomicJson(installStatePath(roots), next);
    atomicJson(join(roots.installRoot, 'current.json'), { schemaVersion: 1, version: next.version, releaseRoot: next.releaseRoot });
    if (!options.noStop) {
      startInstalledRuntime({ roots, state: next, config: restoredConfig, runtime: options.containerRuntime, runImpl, systemdUnitRoot: options.systemdUnitRoot ?? dependencies.systemdUnitRoot });
      await readinessImpl(restoredConfig, roots, options.readinessTimeoutMs, dependencies.fetchImpl, dependencies.httpsProbeImpl);
    }
  } catch (error) {
    throw Object.assign(error, { safetyBackup });
  }
  return { restored: backupRoot, version: backupManifest.version, safetyBackup };
}

export function uninstallAppliance(options, dependencies = {}) {
  const roots = resolveRoots(options);
  const state = currentState(roots);
  if (!state) throw new Error('No appliance installation state was found.');
  if (options.purgeData && options.confirmPurge !== state.installId) {
    throw new Error('Data purge requires --confirm-purge with the exact installId.');
  }
  const runImpl = dependencies.runImpl ?? run;
  if (!options.noStop) stopRuntime({ roots, releaseRoot: state.releaseRoot, manifest: { target: state.target }, mode: state.mode, runtime: options.containerRuntime, runImpl });
  if (state.mode === 'native' && state.target.startsWith('linux-')) {
    for (const id of ['edge', 'control', 'connect', 'forgejo', 'influxdb']) {
      const unit = join(options.systemdUnitRoot ?? dependencies.systemdUnitRoot ?? '/etc/systemd/system', `xyvirtual-${id}.service`);
      if (existsSync(unit)) rmSync(unit, { force: false });
    }
    runImpl('systemctl', ['daemon-reload']);
  }
  rmSync(roots.installRoot, { recursive: true, force: false });
  if (options.purgeData) {
    rmSync(roots.stateRoot, { recursive: true, force: false });
    rmSync(roots.configRoot, { recursive: true, force: false });
  }
  return { removedPrograms: roots.installRoot, preservedState: !options.purgeData ? roots.stateRoot : null };
}

function printPreflight(report) {
  for (const item of report.findings) console.log(`${item.status.toUpperCase().padEnd(11)} ${item.code.padEnd(30)} ${item.detail}`);
  console.log(report.ok ? 'READY: appliance preflight passed.' : 'BLOCKED: fix every required failure before installation.');
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  if (!ACTIONS.has(action)) throw new Error(`First argument must be one of: ${[...ACTIONS].join(', ')}`);
  const bundleRoot = resolve(arg(args, 'bundle', bundleFromRuntime));
  const platform = process.platform;
  const configArgument = arg(args, 'config');
  if (['preflight', 'install', 'upgrade'].includes(action) && !configArgument) {
    throw new Error(`${action} requires --config <path> outside the immutable bundle directory.`);
  }
  const common = {
    bundleRoot,
    platform,
    expectedTarget: arg(args, 'target', targetForPlatform()),
    configPath: configArgument ? resolve(configArgument) : join(bundleRoot, 'config', 'appliance.example.json'),
    mode: arg(args, 'mode', 'container'),
    containerRuntime: arg(args, 'container-runtime', 'docker'),
    installRoot: arg(args, 'install-root'), configRoot: arg(args, 'config-root'), stateRoot: arg(args, 'state-root'),
    noStart: has(args, 'no-start'), noStop: has(args, 'no-stop'),
  };
  if (action === 'preflight') {
    const report = await runPreflight({ bundleRoot, configPath: common.configPath, expectedTarget: common.expectedTarget, mode: common.mode, containerRuntime: common.containerRuntime });
    printPreflight(report);
    if (!report.ok) process.exitCode = 2;
    return;
  }
  if (action === 'install' || action === 'upgrade') {
    const result = await installOrUpgrade(common);
    console.log(`XYvirtual Appliance ${result.state.version} is installed at ${result.state.origin}.`);
    if (result.generatedOperatorPassword) console.log(`Operator password (shown once): ${result.generatedOperatorPassword}`);
    if (result.state.mode === 'container') console.log('Container images were loaded locally with pull disabled.');
    return;
  }
  if (action === 'rollback') {
    const state = await rollbackAppliance(common);
    console.log(`Rolled back to ${state.version}.`);
    return;
  }
  if (action === 'backup') {
    const path = await backupAppliance(common);
    console.log(`Backup created: ${path}`);
    return;
  }
  if (action === 'restore') {
    const result = await restoreAppliance({ ...common, backupPath: arg(args, 'backup'), confirmRestore: arg(args, 'confirm-restore') });
    console.log(JSON.stringify(result));
    return;
  }
  if (action === 'uninstall') {
    const result = uninstallAppliance({ ...common, purgeData: has(args, 'purge-data'), confirmPurge: arg(args, 'confirm-purge') });
    console.log(JSON.stringify(result));
    return;
  }
  const state = currentState(resolveRoots(common));
  console.log(JSON.stringify(state ?? { status: 'not-installed' }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[appliance-manager] ${error.message}`);
    if (error.preflight) printPreflight(error.preflight);
    process.exitCode = 1;
  });
}
