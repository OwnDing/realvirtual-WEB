// SPDX-License-Identifier: AGPL-3.0-only

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initI18n, setLocale } from '../../src/core/i18n';
import type { RVViewer } from '../../src/core/rv-viewer';
import { EventQueueOverlay } from '../../src/plugins/des/hmi/event-queue-overlay';
import { setEventQueueWindowOpen } from '../../src/plugins/sim-controller/event-queue-window-store';

beforeAll(async () => { initI18n(); await setLocale('en-US'); });
afterEach(() => { setEventQueueWindowOpen(false); cleanup(); });

function viewer(processed: number, pending: number): RVViewer {
  return {
    simulationKernel: {
      desControl: () => ({
        eventStats: () => ({ currentTime: 42, processed, pending, nextEventTime: pending ? 48 : Infinity }),
        kpiSnapshot: () => ({
          simTimeSeconds: 42,
          throughputPerHour: 120,
          bottleneck: { name: 'Station-1', utilization: 87.5 },
          components: [],
        }),
      }),
    },
  } as unknown as RVViewer;
}

describe('public DES event and KPI diagnostics', () => {
  it('renders live event counters, throughput and the bottleneck', () => {
    act(() => setEventQueueWindowOpen(true));
    render(<EventQueueOverlay viewer={viewer(12, 3)} />);
    expect(screen.getByTestId('des-event-queue-panel').textContent).toContain('Processed: 12');
    expect(screen.getByTestId('des-event-queue-panel').textContent).toContain('Throughput: 120.00 / h');
    expect(screen.getByTestId('des-event-queue-panel').textContent).toContain('Station-1 (87.5%)');
  });

  it('explains an empty model instead of showing silent zeroes', () => {
    act(() => setEventQueueWindowOpen(true));
    render(<EventQueueOverlay viewer={viewer(0, 0)} />);
    expect(screen.getByText(/No pending or processed events/)).toBeTruthy();
  });
});
