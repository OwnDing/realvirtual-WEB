// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * WebErrorPlugin — alarm management over the central ErrorStore (ADR-0025).
 *
 * Every active ErrorStore entry is an alarm: the AlarmStore adds priority,
 * latching, acknowledgement, shelving and a bounded history. The engine and the
 * panel (web-error/alarm-panel.tsx) load as their own chunks, so the entry
 * carries only this plugin shell.
 *
 * Store lifecycle: the plugin clears the ErrorStore on model switch via
 * onModelCleared (clearModel() does NOT run a per-component dispose sweep).
 */

import { lazy } from 'react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { RVViewer } from '../core/rv-viewer';
import { LazyPanelBoundary } from '../core/hmi/LazyPanelBoundary';
import { getProjectStore } from '../core/project/project-store';
import { rvT } from '../core/i18n';

const AlarmPanel = lazy(() => import('./web-error/alarm-panel').then((m) => ({ default: m.AlarmPanel })));
const alarmRuntime = () => import('../core/hmi/alarm-runtime');

export function WebErrorPanel(props: UISlotProps) {
  return <LazyPanelBoundary label={rvT('operator', 'alarms.alarm')}><AlarmPanel {...props} /></LazyPanelBoundary>;
}

// ─── Plugin ─────────────────────────────────────────────────────────────

export class WebErrorPlugin implements RVViewerPlugin {
  readonly id = 'web-error';
  readonly slots: UISlotEntry[] = [
    { slot: 'messages', component: WebErrorPanel, order: 5 },
  ];

  private _disconnect: (() => void) | null = null;
  private _disposed = false;

  /** ADR-0025: track alarms for the whole session, not only while the panel is mounted. */
  init(viewer: RVViewer): void {
    void alarmRuntime().then((runtime) => {
      if (!this._disposed) this._disconnect = runtime.connectAlarmFeed(viewer);
    });
  }

  onModelLoaded(_result: unknown, viewer: RVViewer): void {
    const scope = getProjectStore().getProject()?.id ?? viewer.currentModelUrl ?? 'default';
    void alarmRuntime().then((runtime) => runtime.loadAlarmConfiguration(viewer, scope));
  }

  /** Clear the error registry on model switch — clearModel() runs no per-component
   *  dispose sweep, so this hook is the reliable store cleanup (plan §2.7). Live
   *  alarms end with the model; their history is kept. */
  onModelCleared(viewer: RVViewer): void {
    viewer.errorStore.clear();
    void alarmRuntime().then((runtime) => runtime.alarmStoreFor(viewer).reset());
  }

  dispose(): void {
    this._disposed = true;
    this._disconnect?.();
    this._disconnect = null;
  }
}
