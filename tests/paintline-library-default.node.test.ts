// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REALVIRTUAL_LIBRARY_PATH } from '../src/core/project/backends/bundled-backend';

const ROOT = resolve(__dirname, '..');

describe('paint-line starter library deployment', () => {
  it('is an explicit application subscription, not a hidden planner default', () => {
    const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');
    const planner = readFileSync(resolve(ROOT, 'src/plugins/layout-planner/index.ts'), 'utf8');

    expect(main).toContain('new LayoutPlannerPlugin({ catalogUrls: [REALVIRTUAL_LIBRARY_PATH] })');
    expect(planner).toMatch(/const DEFAULT_LIBRARY_URLS: string\[\] = \[\];/);
    expect(REALVIRTUAL_LIBRARY_PATH).toBe('library/catalog.json');
  });

  it('the subscribed catalog contains a usable Paint Line category', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(ROOT, 'public', REALVIRTUAL_LIBRARY_PATH), 'utf8'),
    ) as { entries?: Array<{ category?: string; glbUrl?: string }> };
    const paintLine = catalog.entries?.filter((entry) => entry.category === 'Paint Line') ?? [];

    expect(paintLine.length).toBeGreaterThanOrEqual(8);
    expect(paintLine.every((entry) => entry.glbUrl?.endsWith('.glb'))).toBe(true);
  });
});
