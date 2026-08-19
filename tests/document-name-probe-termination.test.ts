// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it, vi } from 'vitest';
import { planDocument } from '../src/core/project/rv-document-ops';
import type { ProjectBackend } from '../src/core/project/backends/project-backend';

describe('document name probing termination', () => {
  it('fails closed when a backend reports every candidate as occupied', async () => {
    const readBlobBytes = vi.fn(async () => new ArrayBuffer(1));
    const backend = {
      kind: 'browser',
      id: 'always-occupied',
      writable: true,
      isActive: true,
      readBlobBytes,
    } as unknown as ProjectBackend;

    await expect(planDocument(backend, null, 'Untitled')).rejects.toThrow(
      'Could not find a free document name for "Untitled" after 1000 attempts.',
    );
    expect(readBlobBytes).toHaveBeenCalledTimes(1_000);
  });
});
