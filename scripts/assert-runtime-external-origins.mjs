// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/** Reject known third-party runtime endpoints when they reappear in executable app sources. */

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const executableExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.json']);
const forbiddenHosts = [
  'www.googletagmanager.com',
  'api.qrserver.com',
  'firebasestorage.googleapis.com',
  'www.gstatic.com',
  'web.realvirtual.io',
  'download.realvirtual.io',
  'cdn.jsdelivr.net',
  'api.github.com',
  'raw.githubusercontent.com',
  'www.3dfindit.com',
  'www.traceparts.com',
];

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path);
    return executableExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

const files = [
  ...filesBelow(join(root, 'src')),
  ...filesBelow(join(root, 'public')).filter((file) => ['.html', '.json'].includes(extname(file))),
  join(root, 'index.html'),
  join(root, 'teams-config.html'),
];
const failures = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
    for (const host of forbiddenHosts) {
      if (line.toLowerCase().includes(host)) {
        failures.push(`${relative(root, file)}:${index + 1}: ${host}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Forbidden runtime external origins found:\n' + failures.map((v) => `  ${v}`).join('\n'));
  process.exit(1);
}
console.log(`✓ runtime external-origin gate passed (${files.length} executable files)`);
