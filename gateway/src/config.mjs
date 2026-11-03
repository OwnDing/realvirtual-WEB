// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Gateway configuration (schemaVersion 1) — strict, fail-closed validation.
 *
 * Secrets never live in the file (IO-5): the API key, the OPC UA password and
 * the InfluxDB token are named by environment variable (`*Env`) and resolved
 * once at start. Unknown keys are rejected so a typo cannot silently disable a
 * safety field such as `readOnly` or `writable`.
 */
import { readFileSync } from 'node:fs';
import { parsePlcType } from './signals.mjs';

/**
 * @typedef {{ name: string, nodeId: string, type: string, writable?: boolean, min?: number, max?: number, dataType?: string, history?: boolean }} SignalConfig
 */

const SIGNAL_NAME = /^[A-Za-z0-9_.:\-/[\] ]{1,128}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const SECURITY_MODES = ['None', 'Sign', 'SignAndEncrypt'];
const SECURITY_POLICIES = ['None', 'Basic256Sha256', 'Aes128_Sha256_RsaOaep', 'Aes256_Sha256_RsaPss'];
/** OPC UA built-in types a configured signal may be written as. */
export const WRITE_DATA_TYPES = {
  bool: ['Boolean'],
  int: ['Int16', 'UInt16', 'Int32', 'UInt32', 'Byte', 'SByte', 'Int64', 'UInt64'],
  float: ['Double', 'Float'],
};
const DEFAULT_DATA_TYPE = { bool: 'Boolean', int: 'Int32', float: 'Double' };
/** Representable range of each writable OPC UA integer type. */
export const INTEGER_LIMITS = {
  SByte: [-128, 127], Byte: [0, 255], Int16: [-32768, 32767], UInt16: [0, 65535],
  Int32: [-2147483648, 2147483647], UInt32: [0, 4294967295],
};

export class ConfigError extends Error {}

function fail(path, message) { throw new ConfigError(`${path}: ${message}`); }
function object(value, path) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object'); return value; }
function only(value, path, keys) { for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown key'); }
function string(value, path, re) { if (typeof value !== 'string' || !value.trim() || (re && !re.test(value))) fail(path, 'invalid string'); return value; }
function int(value, path, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail(path, `must be an integer in [${min}, ${max}]`); return value; }
function bool(value, path) { if (typeof value !== 'boolean') fail(path, 'must be a boolean'); return value; }
function optional(obj, key, fn, fallback) { return obj[key] === undefined ? fallback : fn(obj[key]); }
function envName(value, path) { return string(value, path, ENV_NAME); }

function validateSignal(raw, index, seen) {
  const path = `signals[${index}]`;
  const s = object(raw, path);
  only(s, path, ['name', 'nodeId', 'type', 'writable', 'min', 'max', 'dataType', 'history', 'description']);
  const name = string(s.name, `${path}.name`, SIGNAL_NAME);
  if (seen.has(name)) fail(`${path}.name`, `duplicate signal "${name}"`);
  seen.add(name);
  const nodeId = string(s.nodeId, `${path}.nodeId`, /^(?:ns=\d+;)?[isgb]=.+$/);
  const parsed = parsePlcType(s.type) ?? fail(`${path}.type`, 'must be PLCInput|PLCOutput + Bool|Int|Float');
  const writable = optional(s, 'writable', (v) => bool(v, `${path}.writable`), false);
  // A PLCOutput is written by the PLC; the WEB writing it would fight the PLC.
  if (writable && parsed.direction !== 'input') fail(`${path}.writable`, 'only PLCInput* signals may be writable');
  for (const key of ['min', 'max']) {
    if (s[key] !== undefined && (typeof s[key] !== 'number' || !Number.isFinite(s[key]))) fail(`${path}.${key}`, 'must be a finite number');
  }
  if ((s.min !== undefined || s.max !== undefined) && parsed.valueType === 'bool') fail(path, 'min/max do not apply to Bool');
  if (s.min !== undefined && s.max !== undefined && s.min > s.max) fail(path, 'min must not exceed max');
  const dataType = optional(s, 'dataType', (v) => string(v, `${path}.dataType`), DEFAULT_DATA_TYPE[parsed.valueType]);
  if (!WRITE_DATA_TYPES[parsed.valueType].includes(dataType)) fail(`${path}.dataType`, `not valid for ${parsed.valueType}`);
  // 64-bit integers do not round-trip through a JavaScript number; read them, never write them.
  if (writable && (dataType === 'Int64' || dataType === 'UInt64')) fail(`${path}.dataType`, '64-bit integers cannot be writable');
  return {
    name, nodeId, type: s.type, writable, dataType,
    ...(s.min !== undefined ? { min: s.min } : {}),
    ...(s.max !== undefined ? { max: s.max } : {}),
    history: optional(s, 'history', (v) => bool(v, `${path}.history`), true),
    ...(typeof s.description === 'string' ? { description: s.description } : {}),
  };
}

function validateSource(raw) {
  const s = object(raw, 'source');
  if (s.kind !== 'opcua') fail('source.kind', 'only "opcua" is supported');
  only(s, 'source', ['kind', 'endpointUrl', 'securityMode', 'securityPolicy', 'identity', 'publishingIntervalMs', 'samplingIntervalMs', 'writeTimeoutMs', 'pkiDir', 'applicationName']);
  const endpointUrl = string(s.endpointUrl, 'source.endpointUrl', /^opc\.tcp:\/\/[^\s/]+(?::\d+)?(?:\/\S*)?$/);
  const securityMode = optional(s, 'securityMode', (v) => (SECURITY_MODES.includes(v) ? v : fail('source.securityMode', `one of ${SECURITY_MODES}`)), 'None');
  const securityPolicy = optional(s, 'securityPolicy', (v) => (SECURITY_POLICIES.includes(v) ? v : fail('source.securityPolicy', `one of ${SECURITY_POLICIES}`)), 'None');
  if ((securityMode === 'None') !== (securityPolicy === 'None')) fail('source', 'securityMode None requires securityPolicy None and vice versa');
  const identityRaw = optional(s, 'identity', (v) => object(v, 'source.identity'), { type: 'anonymous' });
  let identity;
  if (identityRaw.type === 'anonymous') { only(identityRaw, 'source.identity', ['type']); identity = { type: 'anonymous' }; }
  else if (identityRaw.type === 'username') {
    only(identityRaw, 'source.identity', ['type', 'username', 'passwordEnv']);
    identity = { type: 'username', username: string(identityRaw.username, 'source.identity.username'), passwordEnv: envName(identityRaw.passwordEnv, 'source.identity.passwordEnv') };
    // Without a secure channel the password would cross the network readable.
    if (securityMode === 'None') fail('source.identity', 'username identity requires securityMode Sign or SignAndEncrypt');
  } else fail('source.identity.type', 'anonymous | username');
  return {
    kind: 'opcua', endpointUrl, securityMode, securityPolicy, identity,
    publishingIntervalMs: optional(s, 'publishingIntervalMs', (v) => int(v, 'source.publishingIntervalMs', 10, 60000), 100),
    samplingIntervalMs: optional(s, 'samplingIntervalMs', (v) => int(v, 'source.samplingIntervalMs', 0, 60000), 100),
    writeTimeoutMs: optional(s, 'writeTimeoutMs', (v) => int(v, 'source.writeTimeoutMs', 100, 60000), 5000),
    pkiDir: optional(s, 'pkiDir', (v) => string(v, 'source.pkiDir'), null),
    applicationName: optional(s, 'applicationName', (v) => string(v, 'source.applicationName'), 'XYvirtual Gateway'),
  };
}

function validateHistory(raw) {
  if (raw === undefined) return { enabled: false };
  const h = object(raw, 'history');
  only(h, 'history', ['enabled', 'url', 'org', 'bucket', 'tokenEnv', 'tokenFile', 'flushIntervalMs', 'maxQueue', 'maxPointsPerSeries', 'maxRangeDays']);
  const enabled = bool(h.enabled, 'history.enabled');
  if (!enabled) return { enabled: false };
  // Exactly one secret source: an env var, or a file readable only by the service (0600).
  if ((h.tokenEnv === undefined) === (h.tokenFile === undefined)) fail('history', 'set exactly one of tokenEnv or tokenFile');
  return {
    enabled: true,
    url: string(h.url, 'history.url', /^https?:\/\/\S+$/).replace(/\/$/, ''),
    org: string(h.org, 'history.org'),
    bucket: string(h.bucket, 'history.bucket', /^[A-Za-z0-9_.-]{1,64}$/),
    tokenEnv: h.tokenEnv === undefined ? null : envName(h.tokenEnv, 'history.tokenEnv'),
    tokenFile: h.tokenFile === undefined ? null : string(h.tokenFile, 'history.tokenFile'),
    flushIntervalMs: optional(h, 'flushIntervalMs', (v) => int(v, 'history.flushIntervalMs', 50, 60000), 1000),
    maxQueue: optional(h, 'maxQueue', (v) => int(v, 'history.maxQueue', 100, 5_000_000), 100_000),
    maxPointsPerSeries: optional(h, 'maxPointsPerSeries', (v) => int(v, 'history.maxPointsPerSeries', 10, 100_000), 5000),
    maxRangeDays: optional(h, 'maxRangeDays', (v) => int(v, 'history.maxRangeDays', 1, 3660), 400),
  };
}

/**
 * Optional multiuser guard (ADR-0028). It is a security boundary only when the
 * user identity comes from the Appliance entry, so it requires
 * `trustProxyIdentity` — a guard that cannot tell users apart would just be an
 * open relay with extra steps.
 */
function validateMultiuser(raw, trustProxyIdentity, websocketPath) {
  if (raw === undefined) return null;
  const m = object(raw, 'multiuser');
  only(m, 'multiuser', ['upstream', 'path', 'maxClients']);
  if (!trustProxyIdentity) fail('multiuser', 'requires trustProxyIdentity: true (the role comes from the entry proxy)');
  const upstream = string(m.upstream, 'multiuser.upstream', /^wss?:\/\/[^\s/]+(?::\d+)?(?:\/\S*)?$/);
  const path = optional(m, 'path', (v) => string(v, 'multiuser.path', /^\/[A-Za-z0-9/_-]*$/), '/multiuser');
  if (path === websocketPath) fail('multiuser.path', 'must differ from websocketPath');
  if (['/health'].includes(path) || path.startsWith('/history')) fail('multiuser.path', 'collides with an HTTP route');
  return { upstream, path, maxClients: optional(m, 'maxClients', (v) => int(v, 'multiuser.maxClients', 1, 1000), 50) };
}

/** Validate a parsed config object; returns a normalized copy or throws ConfigError. */
export function validateConfig(raw) {
  const c = object(raw, 'config');
  if (c.schemaVersion !== 1) fail('schemaVersion', 'must be 1');
  only(c, 'config', ['schemaVersion', 'listen', 'apiKeyEnv', 'allowedOrigins', 'readOnly', 'trustProxyIdentity', 'audit', 'source', 'signals', 'history', 'websocketPath', 'maxClients', 'multiuser']);
  const listen = object(c.listen ?? {}, 'listen');
  only(listen, 'listen', ['host', 'port']);
  const signalsRaw = Array.isArray(c.signals) ? c.signals : fail('signals', 'must be an array');
  // No source = an installed but not yet configured gateway (Appliance default): it
  // serves /health and an empty signal list. A source always needs signals and vice versa.
  if (c.source === undefined && signalsRaw.length > 0) fail('signals', 'require a source');
  if (c.source !== undefined && signalsRaw.length === 0) fail('signals', 'a source needs at least one signal');
  if (signalsRaw.length > 20000) fail('signals', 'at most 20000 entries');
  const seen = new Set();
  const audit = object(c.audit ?? fail('audit', 'is required'), 'audit');
  only(audit, 'audit', ['path']);
  const origins = optional(c, 'allowedOrigins', (v) => {
    if (!Array.isArray(v)) fail('allowedOrigins', 'must be an array');
    return v.map((o, i) => string(o, `allowedOrigins[${i}]`, /^https?:\/\/[^/\s]+$/));
  }, []);
  return {
    schemaVersion: 1,
    listen: {
      host: optional(listen, 'host', (v) => string(v, 'listen.host'), '127.0.0.1'),
      port: optional(listen, 'port', (v) => int(v, 'listen.port', 0, 65535), 5200),
    },
    websocketPath: optional(c, 'websocketPath', (v) => string(v, 'websocketPath', /^\/[A-Za-z0-9/_-]*$/), '/ws'),
    apiKeyEnv: optional(c, 'apiKeyEnv', (v) => envName(v, 'apiKeyEnv'), null),
    allowedOrigins: origins,
    readOnly: optional(c, 'readOnly', (v) => bool(v, 'readOnly'), false),
    // ADR-0024: behind the Appliance entry, identity arrives as X-Rv-User/X-Rv-Role set by
    // Caddy forward_auth. Only enable when the gateway is reachable through that entry alone.
    trustProxyIdentity: optional(c, 'trustProxyIdentity', (v) => bool(v, 'trustProxyIdentity'), false),
    maxClients: optional(c, 'maxClients', (v) => int(v, 'maxClients', 1, 10000), 200),
    audit: { path: string(audit.path, 'audit.path') },
    source: c.source === undefined ? null : validateSource(c.source),
    signals: signalsRaw.map((s, i) => validateSignal(s, i, seen)),
    history: validateHistory(c.history),
    multiuser: validateMultiuser(
      c.multiuser,
      optional(c, 'trustProxyIdentity', (v) => bool(v, 'trustProxyIdentity'), false),
      optional(c, 'websocketPath', (v) => string(v, 'websocketPath', /^\/[A-Za-z0-9/_-]*$/), '/ws'),
    ),
  };
}

/** Resolve `*Env` secrets from `env`; a named-but-missing secret is a start error. */
export function resolveSecrets(config, env = process.env) {
  const read = (name, path) => {
    const value = env[name];
    if (typeof value !== 'string' || !value) throw new ConfigError(`${path}: environment variable ${name} is not set`);
    return value;
  };
  const readFile = (path, field) => {
    let value;
    try { value = readFileSync(path, 'utf8').trim(); } catch (error) { throw new ConfigError(`${field}: ${error.message}`); }
    if (!value) throw new ConfigError(`${field}: file is empty`);
    return value;
  };
  const history = config.history;
  return {
    apiKey: config.apiKeyEnv ? read(config.apiKeyEnv, 'apiKeyEnv') : null,
    opcuaPassword: config.source?.identity.type === 'username' ? read(config.source.identity.passwordEnv, 'source.identity.passwordEnv') : null,
    influxToken: !history.enabled ? null : history.tokenFile ? readFile(history.tokenFile, 'history.tokenFile') : read(history.tokenEnv, 'history.tokenEnv'),
  };
}

export function loadConfig(path) {
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new ConfigError(`${path}: ${error.message}`); }
  return validateConfig(raw);
}
