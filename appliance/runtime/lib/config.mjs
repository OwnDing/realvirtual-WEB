// SPDX-License-Identifier: AGPL-3.0-only

import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const PORT_FIELDS = ['httpsPort', 'httpPort', 'controlPort', 'connectPort', 'forgejoPort', 'influxPort'];

function hostname(value, field) {
  if (typeof value !== 'string' || !value || value.length > 253 || /[\s/:]/.test(value)) throw new Error(`${field} must be a DNS name or IP without scheme, path, or port.`);
  try {
    const parsed = new URL(`https://${value}`);
    if (parsed.hostname !== value.toLowerCase() && parsed.hostname !== `[${value.toLowerCase()}]`) throw new Error();
  } catch {
    throw new Error(`${field} is invalid: ${value}`);
  }
  return value.toLowerCase();
}

function port(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${field} must be an integer from 1 to 65535.`);
  return value;
}

export function validateApplianceConfig(raw, { baseDir = process.cwd() } = {}) {
  if (!raw || raw.schemaVersion !== 1) throw new Error('Appliance config must use schemaVersion 1.');
  const hostnameValue = hostname(raw.hostname, 'hostname');
  const influxHostname = hostname(raw.influxHostname, 'influxHostname');
  const ports = Object.fromEntries(PORT_FIELDS.map((field) => [field, port(raw[field], field)]));
  const seenPorts = new Map();
  for (const [field, value] of Object.entries(ports)) {
    if (seenPorts.has(value)) throw new Error(`${field} conflicts with ${seenPorts.get(value)} on port ${value}.`);
    seenPorts.set(value, field);
  }
  const tlsMode = raw.tls?.mode;
  if (!['internal-ca', 'customer'].includes(tlsMode)) throw new Error('tls.mode must be internal-ca or customer.');
  let certificate = null;
  let privateKey = null;
  let trustBundle = null;
  if (tlsMode === 'customer') {
    if (typeof raw.tls.certificate !== 'string' || typeof raw.tls.privateKey !== 'string') throw new Error('Customer TLS mode requires certificate and privateKey.');
    certificate = isAbsolute(raw.tls.certificate) ? raw.tls.certificate : resolve(baseDir, raw.tls.certificate);
    privateKey = isAbsolute(raw.tls.privateKey) ? raw.tls.privateKey : resolve(baseDir, raw.tls.privateKey);
    if (raw.tls.trustBundle !== null && raw.tls.trustBundle !== undefined) {
      if (typeof raw.tls.trustBundle !== 'string' || !raw.tls.trustBundle) throw new Error('tls.trustBundle must be a non-empty path or null.');
      trustBundle = isAbsolute(raw.tls.trustBundle) ? raw.tls.trustBundle : resolve(baseDir, raw.tls.trustBundle);
    }
  }
  const operatorUser = raw.authentication?.operatorUser;
  if (typeof operatorUser !== 'string' || !/^[a-z][a-z0-9._-]{2,31}$/i.test(operatorUser)) throw new Error('authentication.operatorUser is invalid.');
  let licenseFile = null;
  if (raw.license?.file !== null && raw.license?.file !== undefined) {
    if (typeof raw.license.file !== 'string' || !raw.license.file) throw new Error('license.file must be a non-empty path or null.');
    licenseFile = isAbsolute(raw.license.file) ? raw.license.file : resolve(baseDir, raw.license.file);
  }
  return {
    schemaVersion: 1,
    hostname: hostnameValue,
    influxHostname,
    ...ports,
    tls: { mode: tlsMode, certificate, privateKey, trustBundle },
    authentication: { operatorUser },
    license: { file: licenseFile },
    browserSupport: raw.browserSupport ?? {},
  };
}

export async function validateCustomerCertificate(config, now = new Date()) {
  if (config.tls.mode !== 'customer') return { status: 'pass', code: 'INTERNAL_CA_SELECTED' };
  const [certificateBytes, privateKeyBytes] = await Promise.all([
    readFile(config.tls.certificate), readFile(config.tls.privateKey),
  ]);
  if (config.tls.trustBundle) await readFile(config.tls.trustBundle);
  const certificate = new X509Certificate(certificateBytes);
  const notBefore = new Date(certificate.validFrom);
  const notAfter = new Date(certificate.validTo);
  if (now < notBefore) throw Object.assign(new Error('TLS certificate is not valid yet.'), { code: 'CERT_NOT_YET_VALID' });
  if (now >= notAfter) throw Object.assign(new Error('TLS certificate is expired.'), { code: 'CERT_EXPIRED' });
  if (!certificate.checkHost(config.hostname)) throw Object.assign(new Error(`TLS certificate does not cover ${config.hostname}.`), { code: 'CERT_HOSTNAME_MISMATCH' });
  if (!certificate.checkHost(config.influxHostname)) throw Object.assign(new Error(`TLS certificate does not cover ${config.influxHostname}.`), { code: 'CERT_INFLUX_HOSTNAME_MISMATCH' });
  const certificateKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const privatePublic = createPublicKey(createPrivateKey(privateKeyBytes)).export({ type: 'spki', format: 'der' });
  if (!certificateKey.equals(privatePublic)) throw Object.assign(new Error('TLS certificate and private key do not match.'), { code: 'CERT_KEY_MISMATCH' });
  const remainingDays = Math.floor((notAfter.getTime() - now.getTime()) / 86_400_000);
  if (remainingDays < 30) return { status: 'warn', code: 'CERT_EXPIRES_SOON', remainingDays, fingerprint256: certificate.fingerprint256 };
  return { status: 'pass', code: 'CERTIFICATE_VALID', remainingDays, fingerprint256: certificate.fingerprint256 };
}

export function renderTemplate(source, variables) {
  const missing = new Set();
  const rendered = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, name) => {
    if (!Object.hasOwn(variables, name)) {
      missing.add(name);
      return '';
    }
    return String(variables[name]);
  });
  if (missing.size) throw new Error(`Template variables are missing: ${[...missing].sort().join(', ')}`);
  if (/\{\{[A-Z0-9_]+\}\}/.test(rendered)) throw new Error('Template rendering left unresolved variables.');
  return rendered;
}

export function httpsPortSuffix(portValue) {
  return portValue === 443 ? '' : `:${portValue}`;
}
