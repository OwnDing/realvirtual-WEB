// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Postbuild: stamp the Google Analytics measurement id into dist/settings.json.
 *
 * The committed public/settings.json ships with an EMPTY googleAnalyticsId, so the
 * public GitHub source (and forks) never carry a tracking id. The real id is
 * supplied out-of-band — from the CI secret GA_MEASUREMENT_ID, or locally from a
 * gitignored .env.production — and written into the BUILT settings.json here. That
 * way every build with the id available gets it automatically, while nothing
 * tracking-related is ever committed to the repo.
 *
 * Runs automatically after `npm run build` (npm "postbuild" lifecycle hook).
 * No-op (exit 0) when no id is available or dist/settings.json is missing.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Best-effort read of one key from a gitignored .env file (no dotenv dep). */
function valueFromEnvFile(key) {
  for (const name of ['.env.production', '.env']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`));
      if (m) {
        const v = m[1].replace(/^["']|["']$/g, '').trim();
        if (v) return v;
      }
    }
  }
  return '';
}

const gaId = (process.env.GA_MEASUREMENT_ID || valueFromEnvFile('GA_MEASUREMENT_ID')).trim();
const scriptUrl = (process.env.GA_SCRIPT_URL || valueFromEnvFile('GA_SCRIPT_URL')).trim();
const distSettings = join(root, 'dist', 'settings.json');

if (!gaId || !scriptUrl) {
  console.log('[inject-ga] GA_MEASUREMENT_ID and GA_SCRIPT_URL are both required — skipping.');
  process.exit(0);
}
if (!existsSync(distSettings)) {
  console.log('[inject-ga] dist/settings.json not found — skipping.');
  process.exit(0);
}

try {
  const cfg = JSON.parse(readFileSync(distSettings, 'utf-8'));
  const origin = new URL(scriptUrl).origin;
  cfg.schemaVersion = 1;
  cfg.services = {
    ...(cfg.services ?? {}),
    analytics: { provider: 'google-analytics', measurementId: gaId, scriptUrl },
  };
  cfg.egress = { mode: 'allow-listed', allow: Array.isArray(cfg.egress?.allow) ? cfg.egress.allow : [] };
  const existing = cfg.egress.allow.find((rule) => rule.origin === origin);
  if (existing) existing.purposes = [...new Set([...(existing.purposes ?? []), 'analytics'])];
  else cfg.egress.allow.push({ origin, purposes: ['analytics'] });
  writeFileSync(distSettings, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[inject-ga] Injected GA id into dist/settings.json: ${gaId}`);
} catch (e) {
  console.error('[inject-ga] Failed to patch dist/settings.json:', e);
  process.exit(1);
}
