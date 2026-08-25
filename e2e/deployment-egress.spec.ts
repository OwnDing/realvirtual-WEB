// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { test, expect } from 'playwright/test';

test('default deployment boots without cross-origin requests or sockets', async ({ page }) => {
  test.setTimeout(90_000);
  const external: string[] = [];
  const appOrigin = new URL('http://localhost:5177').origin;

  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== appOrigin) {
      external.push(`${request.resourceType()}: ${request.url()}`);
    }
  });
  page.on('websocket', (socket) => {
    const url = new URL(socket.url());
    const correspondingOrigin = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
    if (correspondingOrigin !== appOrigin) external.push(`websocket: ${socket.url()}`);
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('rv-terms-accepted', '1');
  });
  await page.goto('/?mode=planner', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.waitForTimeout(5_000);

  expect(external).toEqual([]);
});

test('Teams configuration entry uses only bundled resources', async ({ page }) => {
  const external: string[] = [];
  const appOrigin = new URL('http://localhost:5177').origin;

  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== appOrigin) {
      external.push(`${request.resourceType()}: ${request.url()}`);
    }
  });

  await page.goto('/teams-config.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_000);

  expect(external).toEqual([]);
});
