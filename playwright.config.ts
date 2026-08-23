// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  /**
   * `channel: 'chromium'` (set per project below) selects Chrome for Testing —
   * the FULL browser in new-headless mode — instead of Playwright's default
   * `chromium-headless-shell`, which has no GPU stack and therefore cannot
   * create a WebGL context at all on macOS. Without it 24 of the 29 specs here
   * simply timed out waiting for `locator('canvas')`, i.e. every assertion after
   * that line had never run. `smoke.spec.ts` went from 4 failed / 1 passed to
   * 5 passed with this one option.
   *
   * Four specs additionally force SOFTWARE rendering with their own
   * `test.use({ launchOptions: { args: ['--use-angle=swiftshader', …] } })`.
   * That is a deliberate determinism choice for the two that make pixel/render
   * assertions, NOT the workaround this option replaces — do not copy those
   * args into a new spec just to make a canvas appear.
   */
  use: {
    baseURL: 'http://localhost:5177',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
      testIgnore: /embed-smoke\.spec\.ts/,
    },
    {
      name: 'embed-chromium',
      testMatch: /embed-smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        baseURL: 'http://localhost:4178',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5177',
      port: 5177,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run preview:embed',
      port: 4178,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
