// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { beforeEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, Object3D, Scene } from 'three';
import type { RVViewer } from '../src/core/rv-viewer';
import { NodeRegistry } from '../src/core/engine/rv-node-registry';
import { AssetDocument } from '../src/core/editor/rv-asset-document';
import { __clearDraftStoresForTests } from '../src/core/ops/rv-document-drafts';
import {
  applySmartTemplate,
  createAssemblyPort,
  createPlcSignal,
  validateSmartAsset,
} from '../src/plugins/smart-asset-editor/smart-asset-model';

function fixture() {
  const scene = new Scene();
  const root = new Group(); root.name = 'PaintModule'; scene.add(root);
  const body = new Mesh(new BoxGeometry(1, 1, 1)); body.name = 'Body'; root.add(body);
  const registry = new NodeRegistry();
  root.traverse(node => registry.registerNode(NodeRegistry.computeNodePath(node), node));
  const viewer = {
    scene,
    registry,
    signalStore: null,
    transportManager: null,
    get currentModelRoot() { return root; },
    markRenderDirty() {},
    markShadowsDirty() {},
    emit() {},
    rebuildGroupedBvh() {},
  } as unknown as RVViewer;
  return { viewer, root, registry };
}

function port(name: string, portId: string, flow: 'in' | 'out', direction: [number, number, number]) {
  const node = new Object3D();
  node.name = name;
  node.userData.realvirtual = {
    AssemblyPort: {
      PortId: portId,
      TypeId: 'paintline-track-v1',
      Flow: flow,
      Direction: { x: direction[0], y: direction[1], z: direction[2] },
    },
  };
  return node;
}

beforeEach(async () => { await __clearDraftStoresForTests(); });

describe('smart asset authoring model', () => {
  it('creates normalized stable ports with the permanent legacy name and rejects duplicates', async () => {
    const { viewer, root, registry } = fixture();
    const doc = AssetDocument.newUntitled(viewer);
    const path = await createAssemblyPort(doc, root, {
      portId: 'track.in', typeId: 'paintline-track-v1', flow: 'in',
      position: [0, 0, -1], direction: [0, 0, -2],
      parentPath: NodeRegistry.computeNodePath(root),
    });
    const created = registry.getNode(path)!;
    expect(created.name).toBe('Snap-ZN-paintline-track-v1');
    expect(created.position.toArray()).toEqual([0, 0, -1]);
    expect(created.userData.realvirtual.AssemblyPort).toMatchObject({
      PortId: 'track.in', TypeId: 'paintline-track-v1', Flow: 'in',
      Direction: { x: 0, y: 0, z: -1 },
    });
    await expect(createAssemblyPort(doc, root, {
      portId: 'track.in', typeId: 'paintline-track-v1', flow: 'out',
      position: [0, 0, 1], direction: [0, 0, 1],
    })).rejects.toThrow(/already exists/);
    doc.dispose();
  });

  it('applies the paint-track template atomically and produces a publishable asset', async () => {
    const { viewer, root } = fixture();
    const doc = AssetDocument.newUntitled(viewer);
    await applySmartTemplate(doc, root, root, 'paint-track', { length: 4 });

    const cfg = root.userData.realvirtual.PaintLineTrackModule;
    expect(cfg.Points).toEqual([{ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 2 }]);
    expect(root.children.filter(node => node.name.startsWith('Snap-'))).toHaveLength(2);
    const report = validateSmartAsset(root);
    expect(report).toMatchObject({
      publishable: true, errorCount: 0, meshCount: 1, portCount: 2, templateCount: 1,
    });
    expect(doc.getSnapshot().canUndo).toBe(true);
    await doc.undo();
    expect(root.userData.realvirtual?.PaintLineTrackModule).toBeUndefined();
    expect(root.children.filter(node => node.name.startsWith('Snap-'))).toHaveLength(0);
    doc.dispose();
  });

  it('creates all supported signal shapes and rejects a duplicate signal name', async () => {
    const { viewer, root, registry } = fixture();
    const doc = AssetDocument.newUntitled(viewer);
    const path = await createPlcSignal(doc, root, {
      name: 'LineRunning', type: 'PLCOutputBool', comment: 'PLC to twin', initialValue: true,
      parentPath: NodeRegistry.computeNodePath(root),
    });
    expect(registry.getNode(path)?.userData.realvirtual.PLCOutputBool).toMatchObject({
      Name: 'LineRunning', Comment: 'PLC to twin', OriginDataType: 'BOOL', Active: 'Always',
      Status: { Value: true },
    });
    await expect(createPlcSignal(doc, root, {
      name: 'LineRunning', type: 'PLCInputFloat', initialValue: 0,
    })).rejects.toThrow(/already exists/);
    doc.dispose();
  });

  it('reports duplicate identities, ports, signals and invalid smart parameters without mutating the tree', () => {
    const { root } = fixture();
    root.userData.realvirtual = { NodeId: 'same' };
    const child = new Object3D(); child.name = 'Bad'; child.userData.realvirtual = {
      NodeId: 'same',
      PLCOutputBool: { Name: 'SameSignal' },
      PaintProcessZone: { Kind: 'unknown', Size: { x: 1, y: 0, z: 1 } },
    };
    const other = new Object3D(); other.name = 'Other'; other.userData.realvirtual = {
      PLCInputBool: { Name: 'SameSignal' },
    };
    root.add(child, other);
    root.add(port('Snap-ZN-paintline-track-v1', 'duplicate', 'in', [0, 0, -1]));
    root.add(port('Snap-ZP-paintline-track-v1', 'duplicate', 'out', [0, 0, 1]));

    const before = JSON.stringify(root.toJSON());
    const report = validateSmartAsset(root);
    expect(report.publishable).toBe(false);
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'node.id.duplicate', 'port.id.duplicate', 'signal.name.duplicate',
      'zone.kind.invalid', 'zone.size.invalid',
    ]));
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });

  it('blocks an empty geometry-only shell and invalid zero direction', async () => {
    const root = new Group(); root.name = 'Empty';
    expect(validateSmartAsset(root).issues.map(issue => issue.code)).toContain('asset.empty');

    const { viewer, root: asset } = fixture();
    const doc = AssetDocument.newUntitled(viewer);
    await expect(createAssemblyPort(doc, asset, {
      portId: 'bad', typeId: 'any', flow: 'bidi', position: [0, 0, 0], direction: [0, 0, 0],
    })).rejects.toThrow(/non-zero/);
    doc.dispose();
  });
});
