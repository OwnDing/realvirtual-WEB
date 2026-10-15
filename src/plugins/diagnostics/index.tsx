// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense } from 'react';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { UISlotEntry } from '../../core/rv-ui-plugin';
import { rvT } from '../../core/i18n';
import { diagnosticSession } from '../../core/diagnostics/session';
import { diagnosticDownloads } from '../../core/diagnostics/export';
import { ViewerDiagnosticSource } from '../../core/diagnostics/viewer-source';
import { getComponentInstances } from '../../core/engine/rv-component-registry';
const Panel = lazy(() => import('./DiagnosticsPanel'));
function Entry() { return <Suspense fallback={null}><Panel /></Suspense>; }
export class DiagnosticsPlugin implements RVViewerPlugin {
  readonly id = 'diagnostics';
  readonly core = true;
  readonly slots: UISlotEntry[] = [{ slot: 'settings-tab', component: Entry, label: () => rvT('shell', 'diagnostics.title'), order: 900, visibilityId: 'diagnostics', visibilityRule: { hiddenIn: ['kiosk', 'embed', 'guest'] } }];
  private source: ViewerDiagnosticSource | null = null;
  private cleanup: (() => void)[] = [];
  init(viewer: RVViewer): void {
    this.source = new ViewerDiagnosticSource(viewer, getComponentInstances);
    this.cleanup.push(diagnosticSession.start());
    this.cleanup.push(diagnosticSession.attach(this.source), viewer.on('renderer-context-lost', () => diagnosticSession.record('CONTEXT_LOST')));
  }
  onModelLoaded(): void { this.source?.changed(); diagnosticSession.record('MODEL_LOADED'); }
  onModelCleared(): void { this.source?.changed(); diagnosticSession.record('MODEL_CLEARED'); }
  onConnectionStateChanged(state: 'Connected' | 'Disconnected'): void { diagnosticSession.record(state === 'Connected' ? 'CONNECTION_CONNECTED' : 'CONNECTION_DISCONNECTED'); }
  dispose(): void { this.cleanup.splice(0).forEach(fn => fn()); this.source = null; diagnosticDownloads.dispose(); }
}
