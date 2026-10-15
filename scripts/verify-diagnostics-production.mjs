// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startOfflineServer } from './offline-test-server.mjs';
import { diagnosticProductionJourney } from './diagnostic-production-journey.mjs';
const server = await startOfflineServer('dist');
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { localStorage.setItem('rv-terms-accepted', '1'); localStorage.setItem('rv-welcome-dismissed', '1'); });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const result = await diagnosticProductionJourney(page, server.origin);
  await mkdir('test-results/diagnostics', { recursive: true });
  await writeFile('test-results/diagnostics/production.json', JSON.stringify({ browser: browser.version(), ...result }, null, 2));
  console.log('[diagnostics] production download journey passed', result);
  await context.close();
} finally { await browser?.close(); await server.close(); }
