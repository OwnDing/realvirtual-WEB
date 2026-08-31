// SPDX-License-Identifier: AGPL-3.0-only

import { createServer } from 'node:http';
import { X509Certificate } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBundle } from './lib/bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATIC = resolve(here, 'static');
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
]);

export function validateControlConfig(raw) {
  if (!raw || raw.schemaVersion !== 1) throw new Error('Control config must use schemaVersion 1.');
  if (typeof raw.version !== 'string' || !raw.version) throw new Error('Control config version is required.');
  if (typeof raw.installId !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(raw.installId)) throw new Error('Control config installId is invalid.');
  if (typeof raw.bundleRoot !== 'string' || !raw.bundleRoot) throw new Error('Control config bundleRoot is required.');
  if (!Array.isArray(raw.services)) throw new Error('Control config services must be an array.');
  const ids = new Set();
  for (const service of raw.services) {
    if (!service || typeof service.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(service.id)) throw new Error('Control service id is invalid.');
    if (ids.has(service.id)) throw new Error(`Duplicate control service id: ${service.id}`);
    ids.add(service.id);
    const url = new URL(service.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Unsafe health probe URL for ${service.id}.`);
    if (service.required !== true && service.required !== false) throw new Error(`Health service ${service.id} must declare required.`);
  }
  if (raw.certificate !== undefined) {
    if (!raw.certificate || !['internal-ca', 'customer'].includes(raw.certificate.mode) || typeof raw.certificate.path !== 'string' || !raw.certificate.path || !Array.isArray(raw.certificate.hostnames)) {
      throw new Error('Control certificate evidence configuration is invalid.');
    }
  }
  let urls = null;
  if (raw.urls !== undefined) {
    if (!raw.urls || typeof raw.urls !== 'object' || Array.isArray(raw.urls)) throw new Error('Control service URLs are invalid.');
    urls = {};
    for (const id of ['web', 'git', 'connectHealth', 'influx', 'diagnostics']) {
      const url = new URL(raw.urls[id]);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Unsafe control service URL: ${id}`);
      urls[id] = url.href;
    }
  }
  return {
    ...raw,
    urls,
    host: typeof raw.host === 'string' ? raw.host : '127.0.0.1',
    port: Number.isInteger(raw.port) ? raw.port : 8081,
    staticRoot: typeof raw.staticRoot === 'string' ? raw.staticRoot : DEFAULT_STATIC,
    probeTimeoutMs: Number.isInteger(raw.probeTimeoutMs) ? raw.probeTimeoutMs : 2500,
    integrityTtlMs: Number.isInteger(raw.integrityTtlMs) ? raw.integrityTtlMs : 60_000,
  };
}

async function certificateEvidence(config) {
  if (!config.certificate) return null;
  try {
    const certificate = new X509Certificate(await readFile(config.certificate.path));
    const now = Date.now();
    const validFrom = new Date(certificate.validFrom).getTime();
    const validTo = new Date(certificate.validTo).getTime();
    const valid = now >= validFrom && now < validTo;
    const hostnamesCovered = config.certificate.mode === 'customer'
      ? config.certificate.hostnames.every((hostname) => Boolean(certificate.checkHost(hostname)))
      : null;
    const pass = valid && hostnamesCovered !== false;
    return {
      mode: config.certificate.mode,
      status: pass ? 'pass' : 'fail',
      code: !valid ? 'CERTIFICATE_TIME_INVALID' : hostnamesCovered === false ? 'CERTIFICATE_SAN_MISMATCH' : config.certificate.mode === 'customer' ? 'CUSTOMER_CERTIFICATE_VALID' : 'INTERNAL_CA_ROOT_VALID',
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(validTo).toISOString(),
      fingerprint256: certificate.fingerprint256,
      hostnamesCovered,
    };
  } catch {
    return { mode: config.certificate.mode, status: 'fail', code: 'CERTIFICATE_EVIDENCE_UNAVAILABLE' };
  }
}

function safeErrorCode(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'PROBE_TIMEOUT';
  if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  return 'PROBE_FAILED';
}

export async function probeService(service, timeoutMs, fetchImpl = fetch) {
  const started = performance.now();
  try {
    const response = await fetchImpl(service.url, { method: service.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const ok = response.status >= 200 && response.status < 300;
    return {
      id: service.id,
      required: service.required,
      status: ok ? 'ok' : service.required ? 'failed' : 'degraded',
      code: ok ? 'REACHABLE' : `HTTP_${response.status}`,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      id: service.id,
      required: service.required,
      status: service.required ? 'failed' : 'degraded',
      code: safeErrorCode(error),
      durationMs: Math.round(performance.now() - started),
    };
  }
}

export function createReadiness(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const verify = dependencies.verifyBundleImpl ?? verifyBundle;
  let integrity = null;
  let integrityAt = 0;
  let inFlight = null;

  async function checkIntegrity() {
    const now = Date.now();
    if (integrity && now - integrityAt < config.integrityTtlMs) return integrity;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const manifest = await verify(config.bundleRoot, { expectedTarget: config.target });
        integrity = { id: 'release', required: true, status: 'ok', code: 'VERIFIED', version: manifest.version };
      } catch {
        integrity = { id: 'release', required: true, status: 'failed', code: 'INTEGRITY_FAILED' };
      } finally {
        integrityAt = Date.now();
        inFlight = null;
      }
      return integrity;
    })();
    return inFlight;
  }

  return async function readiness() {
    const [release, ...services] = await Promise.all([
      checkIntegrity(),
      ...config.services.map((service) => probeService(service, config.probeTimeoutMs, fetchImpl)),
    ]);
    const checks = [release, ...services];
    const failed = checks.some((check) => check.required && check.status === 'failed');
    const degraded = checks.some((check) => check.status === 'degraded');
    return {
      httpStatus: failed ? 503 : 200,
      body: {
        status: failed ? 'failed' : degraded ? 'degraded' : 'ok',
        service: 'appliance-control',
        version: config.version,
        checks,
      },
    };
  };
}

function json(res, status, value) {
  res.writeHead(status, JSON_HEADERS);
  res.end(`${JSON.stringify(value)}\n`);
}

function staticPath(staticRoot, requestPath) {
  const stripped = requestPath.replace(/^\/(?:appliance|diagnostics)\/?/, '');
  const relativePath = stripped || (requestPath.startsWith('/diagnostics') ? 'diagnostics/index.html' : 'dashboard/index.html');
  const normalized = relativePath.split('/').filter(Boolean);
  if (normalized.some((part) => part === '.' || part === '..')) return null;
  const prefix = requestPath.startsWith('/diagnostics') ? ['diagnostics'] : ['dashboard'];
  const parts = normalized[0] === prefix[0] ? normalized : [...prefix, ...normalized];
  const absolute = resolve(staticRoot, ...parts);
  const base = `${resolve(staticRoot)}${sep}`;
  return absolute.startsWith(base) ? absolute : null;
}

async function serveStatic(res, staticRoot, requestPath) {
  const path = staticPath(staticRoot, requestPath);
  if (!path) return false;
  try {
    const info = await stat(path);
    const resolved = info.isDirectory() ? resolve(path, 'index.html') : path;
    const bytes = await readFile(resolved);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES.get(extname(resolved)) ?? 'application/octet-stream',
      'cache-control': extname(resolved) === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
    res.end(bytes);
    return true;
  } catch {
    return false;
  }
}

export function createControlServer(rawConfig, dependencies = {}) {
  const config = validateControlConfig(rawConfig);
  const readiness = createReadiness(config, dependencies);
  return createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://appliance.invalid').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      json(res, 405, { status: 'failed', code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    if (pathname === '/health/live') {
      json(res, 200, { status: 'ok', service: 'appliance-control' });
      return;
    }
    if (pathname === '/health/ready' || pathname === '/appliance/api/status') {
      const result = await readiness();
      json(res, result.httpStatus, result.body);
      return;
    }
    if (pathname === '/appliance/api/info') {
      const certificate = await certificateEvidence(config);
      json(res, 200, {
        product: 'xyvirtual-web-appliance', version: config.version,
        installId: config.installId, target: config.target,
        certificate,
        urls: config.urls ?? null,
        diagnostics: { websocketPath: config.websocketPath ?? '/connect/webviewer' },
      });
      return;
    }
    if (pathname === '/appliance' || pathname.startsWith('/appliance/') || pathname === '/diagnostics' || pathname.startsWith('/diagnostics/')) {
      if (await serveStatic(res, config.staticRoot, pathname)) return;
    }
    json(res, 404, { status: 'failed', code: 'NOT_FOUND' });
  });
}

async function main() {
  const configAt = process.argv.indexOf('--config');
  const configPath = configAt >= 0 ? process.argv[configAt + 1] : process.env.RV_APPLIANCE_CONTROL_CONFIG;
  if (!configPath) throw new Error('Pass --config <control.json> or set RV_APPLIANCE_CONTROL_CONFIG.');
  const config = validateControlConfig(JSON.parse(await readFile(resolve(configPath), 'utf8')));
  const server = createControlServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`[appliance-control] listening on ${config.host}:${config.port} (${config.version})`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[appliance-control] ${error.message}`);
    process.exitCode = 1;
  });
}
