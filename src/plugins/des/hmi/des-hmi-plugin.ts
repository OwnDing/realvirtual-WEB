// SPDX-License-Identifier: AGPL-3.0-only

import type { LibraryCatalog } from '../../../core/library/library-types';

const catalog: LibraryCatalog = {
  version: '1.0', name: 'DES Components', entries: [
    {
      id: 'des-station', name: 'Station', category: 'des', virtual: true,
      desType: 'Station', desConfig: { ProcessingTime: 5 }, gizmoSize: [800, 800, 800],
      virtualPorts: [port('ZN-in', [0, 0, -400], 'material.in', 'in', [0, 0, -1]), port('ZP-out', [0, 0, 400], 'material.out', 'out', [0, 0, 1])],
    },
    {
      id: 'des-storage', name: 'Storage', category: 'des', virtual: true,
      desType: 'Storage', desConfig: { MaxCapacity: 10 }, gizmoSize: [1000, 700, 1000],
      virtualPorts: [port('ZN-in', [0, 0, -500], 'material.in', 'in', [0, 0, -1]), port('ZP-out', [0, 0, 500], 'material.out', 'out', [0, 0, 1])],
    },
    {
      id: 'des-sink', name: 'Sink', category: 'des', virtual: true,
      desType: 'Sink', desConfig: {}, gizmoSize: [700, 700, 700],
      virtualPorts: [port('ZN-in', [0, 0, -350], 'material.in', 'in', [0, 0, -1])],
    },
    {
      id: 'des-processing', name: 'Processing Attachment', category: 'des', virtual: true,
      desType: 'Processing', desConfig: { targetComponentPath: '', processingTime: 5 }, gizmoSize: [500, 500, 500],
    },
    {
      id: 'des-downtime', name: 'Downtime', category: 'des', virtual: true,
      desType: 'Downtime', desConfig: { TargetComponentPath: '', MTBF: 3600, MTTR: 300, Enabled: true }, gizmoSize: [500, 500, 500],
    },
    {
      id: 'des-pallet-source', name: 'Pallet Source', category: 'des', virtual: true,
      desType: 'PalletSource', desConfig: { BlisterCount: 2, PartsPerBlister: 3 }, gizmoSize: [700, 500, 700],
      virtualPorts: [port('ZP-out', [0, 0, 350], 'material.out', 'out', [0, 0, 1])],
    },
    {
      id: 'des-indexing-conveyor', name: 'Indexing Conveyor', category: 'des', virtual: true,
      desType: 'IndexingConveyor', desConfig: { slotCount: 4, pitch: 1000, speed: 1000, dwellTime: 0, reportFreeAt: 1 },
      gizmoSize: [4000, 500, 800],
      virtualPorts: [port('XN-in', [-2000, 0, 0], 'material.in', 'in', [-1, 0, 0]), port('XP-out', [2000, 0, 0], 'material.out', 'out', [1, 0, 0])],
      virtualChildren: Array.from({ length: 4 }, (_, index) => ({
        name: `Carrier-${index}`, kind: 'carrier' as const, position: [-1500 + index * 1000, 250, 0] as [number, number, number],
      })),
    },
    {
      id: 'des-robot-handling', name: 'Robot Handling', category: 'des', virtual: true,
      desType: 'RobotHandling', desConfig: { mode: 'transfer', batchSize: 1, timePerCycle: 1 }, gizmoSize: [1200, 1800, 1200],
      virtualPorts: [
        port('ZN-in', [0, 0, -600], 'material.in', 'in', [0, 0, -1]),
        port('ZP-out', [0, 0, 600], 'material.out', 'out', [0, 0, 1]),
        port('ZP-des-empty', [600, 0, 0], 'material.empty-out', 'out', [1, 0, 0]),
      ],
    },
    {
      id: 'des-path-transport', name: 'Path Transport', category: 'des', virtual: true,
      desType: 'PathTransport', desConfig: { capacity: 1, speed: 1000 }, gizmoSize: [2000, 300, 600],
      virtualPorts: [port('XN-in', [-1000, 0, 0], 'material.in', 'in', [-1, 0, 0]), port('XP-out', [1000, 0, 0], 'material.out', 'out', [1, 0, 0])],
      virtualChildren: [{ name: 'Path-1', kind: 'path', position: [-1000, 150, 0], size: [2000, 0, 0] }],
    },
  ],
};

function port(
  name: string,
  position: [number, number, number],
  portId: string,
  flow: 'in' | 'out' | 'bidi',
  direction: [number, number, number],
) {
  return { name, position, portId, typeId: 'des-material-flow-v1', flow, direction };
}

export class DESHMIPlugin {
  readonly id = 'des-hmi';
  ensureViewer(
    viewer: { getPlugin(id: string): unknown; modes?: { activeMode?: string | null } },
    enteringMode: string | null | undefined = viewer.modes?.activeMode,
  ): void {
    if (enteringMode !== 'des') return;
    const planner = viewer.getPlugin('layout-planner') as { store?: { addCatalogDirect(key: string, value: LibraryCatalog): void } } | null;
    planner?.store?.addCatalogDirect('des-components', catalog);
  }
}

export default DESHMIPlugin;
