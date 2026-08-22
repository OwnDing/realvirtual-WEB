// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = [
  resolve(process.cwd(), 'src/core/material-flow/des'),
  resolve(process.cwd(), 'src/plugins/des'),
];

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('public DES architecture boundary', () => {
  it('does not import paint-line, demo-model, project, or private DES modules', () => {
    const violations = ROOTS.flatMap(sourceFiles).flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      const imports = [...text.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
        .map((match) => match[1]);
      return imports
        .filter((specifier) => /PaintLine|DemoPaintLine|@rv-projects|@rv-private/i.test(specifier))
        .map((specifier) => `${path}: ${specifier}`);
    });
    expect(violations).toEqual([]);
  });
});
