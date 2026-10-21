// SPDX-License-Identifier: AGPL-3.0-only
import type { Plugin } from 'vite';
import { relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Records actual bundle inputs. Final hashes are collected after postbuild. */
export function securityBuildGraph(target: string): Plugin {
  const root = resolve('.');
  function source(id: string) {
    const path = relative(root, id.split('?')[0]).replaceAll('\\', '/');
    if (id.startsWith('\0')) return { kind: 'virtual', id: createHash('sha256').update(id).digest('hex') };
    if (path.startsWith('../')) return { kind: 'external-unreviewed' };
    const match = path.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/);
    return match ? { kind: 'npm', packagePath: match[1], path } : { kind: 'repository', path };
  }
  return {
    name: 'security-build-graph', apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle).map(item => ({
        file: item.fileName,
        inputs: item.type === 'chunk' ? Object.keys(item.modules).map(source) : item.originalFileNames.map(id => source(resolve(root, id))),
      }));
      this.emitFile({ type: 'asset', fileName: 'security-build-graph.json', source: JSON.stringify({ schemaVersion: 1, target, lockSha256: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'), files }, null, 2) });
    },
  };
}
