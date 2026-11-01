// SPDX-License-Identifier: AGPL-3.0-only
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** A PRODUCTION install of a gateway package: one runtime dependency, its dev dependency absent. */
export function gatewayFixture(root: string): string {
  const g = join(root, 'gateway');
  mkdirSync(join(g, 'src'), { recursive: true });
  writeFileSync(join(g, 'src', 'main.mjs'), '// fixture gateway\n');
  writeFileSync(join(g, 'README.md'), '# fixture\n');
  writeFileSync(join(g, 'gateway.example.json'), '{}\n');
  writeFileSync(join(g, 'package.json'), JSON.stringify({ name: '@xyvirtual/gateway', version: '0.1.0' }));
  const integrity = `sha512-${createHash('sha512').update('fixture').digest('base64')}`;
  const pkg = (name: string, extra: object = {}) => ({ version: '1.0.0', resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`, integrity, license: 'MIT', ...extra });
  writeFileSync(join(g, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { name: '@xyvirtual/gateway' }, 'node_modules/fixture-dep': pkg('fixture-dep'), 'node_modules/fixture-dev': pkg('fixture-dev', { dev: true }) } }));
  mkdirSync(join(g, 'node_modules', 'fixture-dep'), { recursive: true });
  writeFileSync(join(g, 'node_modules', 'fixture-dep', 'package.json'), JSON.stringify({ name: 'fixture-dep', version: '1.0.0', license: 'MIT' }));
  writeFileSync(join(g, 'node_modules', 'fixture-dep', 'LICENSE'), 'MIT fixture license\n');
  return g;
}

