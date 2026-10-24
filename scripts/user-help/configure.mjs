// SPDX-License-Identifier: AGPL-3.0-only
// Explicit delivery operation; never run automatically or overwrite source settings.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2), get = name => args[args.indexOf(name) + 1];
if (!args.includes('--dist') || !args.includes('--page-url')) throw new Error('Required: --dist OUTPUT --page-url https://host/deployment/');
const output = resolve(get('--dist')), root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (output === root || output === resolve(root, 'public')) throw new Error('Use a delivery copy, not source settings');
const url = new URL(get('--page-url'));
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('Use a credential-free HTTP(S) deployment URL ending in /');
const help = new URL('user-help/', url).href;
const manifest = JSON.parse(readFileSync(resolve(output, 'user-help/manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1) throw new Error('Build user help before configuring it');
const path = resolve(output, 'settings.json'), config = JSON.parse(readFileSync(path, 'utf8'));
config.services = { ...config.services, documentation: { baseUrl: help } };
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('[user-help] Enabled bundled help in the specified delivery copy');
