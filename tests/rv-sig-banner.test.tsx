// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SigWarningBanner } from '../src/core/hmi/SigWarningBanner';
import {
  resetSignatureUiState,
  setSignatureUiState,
} from '../src/core/rv-sig-store';
import type { RVViewer } from '../src/core/rv-viewer';
import { setLocale } from '../src/core/i18n';

/**
 * English is pinned rather than inherited (ADR-0001 Validation).
 *
 * The shell copy asserted below comes from the catalog and the product default
 * is `zh-CN`, so without the pin these locators would be matching whatever the
 * default happens to be rather than the behaviour under test.
 */
beforeAll(async () => { await setLocale('en-US'); });

afterEach(() => {
  cleanup();
  resetSignatureUiState();
});

function publish(
  signatureState: 'none' | 'valid' | 'invalid' | 'unverifiable',
  logicRunState: 'active' | 'gated' | 'activating',
) {
  const activateGatedLogic = vi.fn(async () => true);
  const viewer = { activateGatedLogic } as unknown as RVViewer;
  act(() => {
    setSignatureUiState({
      signatureState,
      logicRunState,
      modelName: 'cell.glb',
      viewer,
    });
  });
  return activateGatedLogic;
}

describe('SigWarningBanner', () => {
  it.each(['none', 'valid'] as const)('does not render for %s models', (signatureState) => {
    render(<SigWarningBanner />);
    publish(signatureState, 'active');
    expect(screen.queryByTestId('sig-warning-banner')).toBeNull();
  });

  it('renders distinct invalid and unverifiable messages in normal and compact shells', () => {
    render(
      <>
        <SigWarningBanner />
        <SigWarningBanner compact />
      </>,
    );
    publish('invalid', 'gated');
    expect(screen.getAllByText('Model signature is invalid')).toHaveLength(2);

    publish('unverifiable', 'gated');
    expect(screen.getAllByText('Model signature could not be verified')).toHaveLength(2);
    expect(screen.getByText(/this browser could not verify/i)).toBeTruthy();
  });

  it('dismisses locally without activating logic', () => {
    render(<SigWarningBanner />);
    const activate = publish('invalid', 'gated');
    fireEvent.click(screen.getByLabelText('Dismiss model signature warning'));
    expect(screen.queryByTestId('sig-warning-banner')).toBeNull();
    expect(activate).not.toHaveBeenCalled();
  });

  it('shows provenance details and forwards explicit activation once', async () => {
    render(<SigWarningBanner />);
    const activate = publish('invalid', 'gated');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByTestId('sig-warning-details').textContent).toContain('cell.glb');
    fireEvent.click(screen.getByRole('button', { name: 'Activate logic' }));
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
