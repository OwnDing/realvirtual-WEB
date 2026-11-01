// SPDX-License-Identifier: AGPL-3.0-only

/**
 * HmiOperationsPlugin — configured KPIs from live signals and the
 * "Alarms & KPIs" settings tab (ADR-0025).
 *
 * KPI definitions and alarm priorities are project documents (`hmi/kpis.json`,
 * `hmi/alarms.json`). Editing them is an engineer capability; everyone sees the
 * resulting KPI cards. Nothing renders in the KPI bar while no KPI is defined,
 * so deployments that do not use this keep their current HMI.
 */

import { lazy } from 'react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { RVViewer } from '../core/rv-viewer';
import { LazyPanelBoundary } from '../core/hmi/LazyPanelBoundary';
import { rvT } from '../core/i18n';

// Engine, sampling, cards and editor are their own chunks (hmi-operations/).
const SettingsTabLazy = lazy(() => import('./hmi-operations/HmiConfigSettingsTab').then((m) => ({ default: m.HmiConfigSettingsTab })));
const kpiRuntime = () => import('./hmi-operations/kpi-runtime');

function HmiConfigSettingsTab(props: UISlotProps) {
  return <LazyPanelBoundary label={rvT('operator', 'alarms.settingsTab')}><SettingsTabLazy {...props} /></LazyPanelBoundary>;
}

export class HmiOperationsPlugin implements RVViewerPlugin {
  readonly id = 'hmi-operations';
  readonly order = 160;
  readonly slots: UISlotEntry[] = [
    { slot: 'settings-tab', component: HmiConfigSettingsTab, label: () => rvT('operator', 'alarms.settingsTab'), order: 280, visibilityId: 'hmi-operations', visibilityRule: { hiddenIn: ['kiosk', 'embedded', 'guest'] } },
  ];
  /** Set by the KPI runtime while it samples. */
  stopKpis?: () => void;

  onModelLoaded(_result: unknown, viewer: RVViewer): void {
    void kpiRuntime().then((runtime) => runtime.loadKpis(this, viewer));
  }

  onModelCleared(viewer: RVViewer): void {
    void kpiRuntime().then((runtime) => runtime.restartKpis(viewer));
  }

  dispose(): void {
    this.stopKpis?.();
  }
}
