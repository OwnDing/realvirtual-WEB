import type { KeyObject } from 'node:crypto';

export const RV_LIC_MAX_BYTES: number;

export interface RvLicenseCertificate {
  pub: string;
  org: string;
  sig: string;
}

export interface RvLicenseSigningConfig {
  privateKey: KeyObject;
  cert: RvLicenseCertificate | null;
}

export interface RvLicenseKeyPair {
  privateKeyPem: string;
  publicKeyBase64: string;
}

export interface RvLicenseEnvelope {
  rvlic: 1;
  payload: string;
  sig: string;
  cert?: RvLicenseCertificate;
}

export function rawPublicKey(key: KeyObject): Buffer;

export function licenseMessage(payloadBytes: Uint8Array | Buffer): Buffer;

export function certificateMessage(
  publicKeyRaw: Uint8Array | Buffer,
  organization: string,
): Buffer;

export function generateLicenseKeyPair(): RvLicenseKeyPair;

export function issueDelegationCertificate(
  publicKeyRaw: Uint8Array | Buffer,
  organization: string,
  rootPrivateKey: KeyObject,
): RvLicenseCertificate;

export function loadLicenseSigningConfig(
  env?: Record<string, string | undefined>,
): RvLicenseSigningConfig | null;

export function signLicensePayload(
  payload: Record<string, unknown>,
  signing: RvLicenseSigningConfig,
): RvLicenseEnvelope;

export function verifyLicenseEnvelope(
  envelope: unknown,
  rootPublicKeyRaw: Uint8Array | Buffer,
): 'valid' | 'invalid' | 'unverifiable';
