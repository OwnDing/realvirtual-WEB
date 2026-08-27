// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * The loader's job is to fail CLOSED, unlike settings.json which fails open so
 * the app always boots. A deployment that declared it needs a license must
 * never read as licensed because a file 404'd.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { refreshLicense } from '../src/core/licensing/rv-lic-store';
import { licenseMessage } from '../src/core/licensing/rv-lic-verify';
import { RV_LIC_MAX_BYTES } from '../src/core/licensing/rv-lic-types';
import { setAppConfig } from '../src/core/rv-app-config';
import { LICENSE_CLOCK_KEY } from '../src/core/hmi/rv-storage-keys';

let rootKeys: CryptoKeyPair;
let rootPublicKeyBase64: string;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signedLicense(payload: Record<string, unknown>): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = new Uint8Array(
    await crypto.subtle.sign('Ed25519', rootKeys.privateKey, licenseMessage(payloadBytes)),
  );
  return JSON.stringify({ rvlic: 1, payload: toBase64(payloadBytes), sig: toBase64(signature) });
}

const PAYLOAD = {
  v: 1,
  id: 'XYV-LIC-2026-0007',
  issuedAt: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
};
const DURING_TERM = Date.parse('2026-06-01T00:00:00Z');

/** Records what was requested so the same-origin claim can be asserted. */
function stubFetch(handler: (url: string) => Response | Promise<Response>): string[] {
  const seen: string[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    return Promise.resolve(handler(url));
  });
  return seen;
}

beforeAll(async () => {
  rootKeys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
  rootPublicKeyBase64 = toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', rootKeys.publicKey)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(LICENSE_CLOCK_KEY);
  setAppConfig({});
});

describe('a deployment that did not ask for a license', () => {
  it('never even looks for the file', async () => {
    const seen = stubFetch(() => new Response('', { status: 500 }));
    setAppConfig({});

    const result = await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM });
    expect(result.state).toBe('not-required');
    expect(seen).toEqual([]);
  });

  it('stays inert when the section exists but required is false', async () => {
    const seen = stubFetch(() => new Response('', { status: 200 }));
    setAppConfig({ license: { required: false, path: 'license.rvlic' } });

    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state)
      .toBe('not-required');
    expect(seen).toEqual([]);
  });
});

describe('loading fails closed', () => {
  it('reports absent on 404', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state).toBe('absent');
  });

  it('reports absent when the request throws', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state).toBe('absent');
  });

  it('refuses an oversized body', async () => {
    stubFetch(() => new Response('x'.repeat(RV_LIC_MAX_BYTES + 1), { status: 200 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state).toBe('absent');
  });

  it('reports invalid, not absent, when a file is there but unsigned', async () => {
    stubFetch(() => new Response('{"rvlic":1,"payload":"AAAA","sig":"nope"}', { status: 200 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state).toBe('invalid');
  });

  it('never withholds saving for any load failure', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).canSave).toBe(true);
  });
});

describe('loading a real license', () => {
  it('accepts one and reports the term', async () => {
    const text = await signedLicense(PAYLOAD);
    stubFetch(() => new Response(text, { status: 200 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });

    const result = await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM });
    expect(result.state).toBe('valid');
    expect(result.payload?.id).toBe('XYV-LIC-2026-0007');
  });

  it('requests the configured path, relative to the deployment base', async () => {
    const text = await signedLicense(PAYLOAD);
    const seen = stubFetch(() => new Response(text, { status: 200 }));
    setAppConfig({ license: { required: true, path: 'licenses/plant-1.rvlic' } });

    await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM });
    expect(seen).toHaveLength(1);
    expect(seen[0].endsWith('licenses/plant-1.rvlic')).toBe(true);
    // Relative to BASE_URL, so it cannot name another origin.
    expect(/^[a-z]+:/i.test(seen[0])).toBe(false);
  });

  it('compares the install id the deployment asserts about itself', async () => {
    const text = await signedLicense({ ...PAYLOAD, binding: { installId: 'XYV-INST-9F2A4C81' } });
    stubFetch(() => new Response(text, { status: 200 }));

    setAppConfig({ license: { required: true, path: 'license.rvlic', installId: 'XYV-INST-9F2A4C81' } });
    expect((await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM })).state).toBe('valid');

    setAppConfig({ license: { required: true, path: 'license.rvlic', installId: 'XYV-INST-SOMEELSE' } });
    const moved = await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM });
    expect(moved.state).toBe('mismatch');
    expect(moved.canSave).toBe(true);
  });

  it('degrades to readonly well past the grace period', async () => {
    const text = await signedLicense(PAYLOAD);
    stubFetch(() => new Response(text, { status: 200 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });

    const late = Date.parse('2027-06-01T00:00:00Z');
    const result = await refreshLicense({ rootPublicKeyBase64 }, { now: late });
    expect(result.state).toBe('readonly');
    expect(result.canSave).toBe(false);
    expect(result.watermark).toBe(true);
  });

  it('anchors the clock so a later rollback is visible', async () => {
    const text = await signedLicense(PAYLOAD);
    stubFetch(() => new Response(text, { status: 200 }));
    setAppConfig({ license: { required: true, path: 'license.rvlic' } });

    await refreshLicense({ rootPublicKeyBase64 }, { now: DURING_TERM });
    expect(Number(localStorage.getItem(LICENSE_CLOCK_KEY))).toBe(DURING_TERM);

    const rolled = await refreshLicense({ rootPublicKeyBase64 }, { now: Date.parse('2026-01-02T00:00:00Z') });
    expect(rolled.clockRollback).toBe(true);
    // Still fully usable: the mark only floors the arithmetic.
    expect(rolled.state).toBe('valid');
    expect(rolled.canSave).toBe(true);
  });
});
