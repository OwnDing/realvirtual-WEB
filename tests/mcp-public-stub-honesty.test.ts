// SPDX-License-Identifier: AGPL-3.0-only
/**
 * MCP editor tools must not report success for work a public no-op stub did
 * not do. In a build without the private sibling every stub-backed tool refuses
 * with `{ unavailable: true }` BEFORE touching the document; with the private
 * sibling present the same modules are real and the marker check flips.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, Object3D } from 'three';
import type { RVViewer } from '../src/core/rv-viewer';
import { NodeRegistry } from '../src/core/engine/rv-node-registry';
import { AssetDocument } from '../src/core/editor/rv-asset-document';
import { McpEditorTools } from '../src/plugins/mcp-bridge/rv-mcp-editor-tools';
import { McpViewTools } from '../src/plugins/mcp-bridge/rv-mcp-view-tools';
import { setActiveAssetContext } from '../src/core/editor/active-asset-store';
import { __clearDraftStoresForTests } from '../src/core/ops/rv-document-drafts';
import { isPublicStub, capabilityUnavailable } from '../src/core/rv-public-stub';
// The stub FILES themselves (relative, so this test runs in the community
// edition); the tools under test resolve `@rv-private/*` on their own.
import * as transformActions from '../src/private-stubs/plugins/asset-editor/kinematics/transform-actions';
import * as createActions from '../src/private-stubs/plugins/asset-editor/kinematics/create-actions';
import * as groupActions from '../src/private-stubs/plugins/asset-editor/group-actions';
import * as selectActions from '../src/private-stubs/plugins/asset-editor/select-actions';

const PUBLIC = !__RV_HAS_PRIVATE__;

interface Env { viewer: RVViewer; doc: AssetDocument; tools: McpEditorTools; boxPath: string; meshPath: string; selected: string[] }

function makeEnv(): Env {
  const scene = new Scene();
  const root = new Group();
  root.name = 'Asset';
  scene.add(root);
  const box = new Object3D();
  box.name = 'Box';
  root.add(box);
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x336699 }));
  mesh.name = 'Panel';
  root.add(mesh);
  const registry = new NodeRegistry();
  root.traverse((n) => registry.registerNode(NodeRegistry.computeNodePath(n), n));
  const env = { selected: [] as string[] } as Env;
  const viewer = {
    scene, registry, signalStore: null, transportManager: null,
    get currentModelRoot() { return root; },
    modes: { activeMode: 'editor', has: () => true, setMode() {}, list: () => [{ id: 'editor' }], subscribe: () => () => {} },
    selectionManager: {
      select() {}, selectPaths(p: string[]) { env.selected = p; }, clear() {},
      getSnapshot: () => ({ selectedPaths: env.selected, primaryPath: env.selected[0] ?? null }),
    },
    groups: { get: () => undefined },
    markRenderDirty() {}, markShadowsDirty() {}, emit() {}, on() { return () => {}; },
    rebuildGroupedBvh() {}, refitRaycastSubtrees() {},
  } as unknown as RVViewer;
  const doc = AssetDocument.newUntitled(viewer);
  setActiveAssetContext({ viewer, doc });
  return Object.assign(env, {
    viewer, doc, tools: new McpEditorTools(() => viewer),
    boxPath: NodeRegistry.computeNodePath(box), meshPath: NodeRegistry.computeNodePath(mesh),
  });
}

let env: Env;
beforeEach(async () => { await __clearDraftStoresForTests(); env = makeEnv(); });
afterEach(() => { setActiveAssetContext(null); env.doc.dispose(); });

describe('public stub detection', () => {
  it('recognises the stub modules and nothing else', () => {
    for (const mod of [transformActions, createActions, groupActions, selectActions]) {
      expect(isPublicStub(mod)).toBe(true);
    }
    expect(isPublicStub({})).toBe(false);
    expect(isPublicStub(null)).toBe(false);
    expect(isPublicStub({ RV_PUBLIC_STUB: 'true' })).toBe(false);
    expect(capabilityUnavailable('X', 'Use Y.')).toMatchObject({ unavailable: true, capability: 'X' });
  });
});

describe.runIf(PUBLIC)('stub-backed MCP tools refuse instead of faking success', () => {
  const calls: Array<[string, (e: Env) => Promise<string>]> = [
    ['web_editor_zero_position', (e) => e.tools.webEditorZeroPosition(e.boxPath)],
    ['web_editor_rotate90', (e) => e.tools.webEditorRotate90(e.boxPath, 'y', 1)],
    ['web_editor_to_ground', (e) => e.tools.webEditorToGround(e.boxPath)],
    ['web_editor_pivot', (e) => e.tools.webEditorPivot(e.boxPath, 'bottom', '')],
    ['web_editor_create_kinematic', (e) => e.tools.webEditorCreateKinematic('Axis')],
    ['web_editor_add_signal', (e) => e.tools.webEditorAddSignal(e.boxPath, 'PLCOutputBool', '')],
    ['web_editor_convert_signal', (e) => e.tools.webEditorConvertSignal(e.boxPath, 'Int')],
    ['web_editor_toggle_signal_direction', (e) => e.tools.webEditorToggleSignalDirection(e.boxPath)],
    ['web_editor_add_logic_step', (e) => e.tools.webEditorAddLogicStep(e.boxPath, 'LogicStep_Delay')],
    ['web_editor_material_presets', (e) => e.tools.webEditorMaterialPresets()],
    ['web_editor_material_stats', (e) => e.tools.webEditorMaterialStats()],
    ['web_editor_assign_material (preset)', (e) => e.tools.webEditorAssignMaterial(e.meshPath, 'steel', '', 0, 0.5, 1)],
    ['web_editor_kinematize', (e) => e.tools.webEditorKinematize(e.boxPath, 'Axis', 'LinearX', 100, 0, 0, 0, true)],
    ['web_editor_test_start', (e) => e.tools.webEditorTestStart()],
    ['web_editor_shortcut S>I', (e) => { e.selected = [e.meshPath]; return e.tools.webEditorShortcut('S>I', ''); }],
    ['web_editor_shortcut K', (e) => { e.selected = [e.boxPath]; return e.tools.webEditorShortcut('K', 'Axis'); }],
    ['web_editor_shortcut Delete', (e) => { e.selected = [e.boxPath]; return e.tools.webEditorShortcut('Delete', ''); }],
  ];
  for (const [name, call] of calls) {
    it(`${name} reports unavailable and writes nothing`, async () => {
      const before = env.doc.getSnapshot().opCount;
      const result = JSON.parse(await call(env)) as Record<string, unknown>;
      expect(result['unavailable'], JSON.stringify(result)).toBe(true);
      expect(String(result['error'])).toMatch(/not available in this build/);
      expect(result['ok']).toBeUndefined();
      await env.doc.whenIdle();
      expect(env.doc.getSnapshot().opCount).toBe(before);
    });
  }

  it('web_select_similar refuses rather than selecting nothing', async () => {
    env.selected = [env.meshPath];
    const view = new McpViewTools(() => env.viewer);
    const result = JSON.parse(await view.webSelectSimilar('identical', env.meshPath)) as Record<string, unknown>;
    expect(result).toMatchObject({ unavailable: true });
  });

  it('a mechanism refusal does not point at an axis-group tool that is a stub too', async () => {
    const result = JSON.parse(await env.tools.webEditorMechanismCreate(env.boxPath)) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/Rigid-body mechanisms are not available/);
    expect(String(result['error'])).toMatch(/not available in this build either/);
  });

  it('the editor status reports the test session as unavailable, not idle', async () => {
    const status = JSON.parse(await env.tools.webEditorStatus()) as Record<string, unknown>;
    expect(status['testSession']).toBe('unavailable');
  });

  it('rename, a public document operation, still works', async () => {
    const result = JSON.parse(await env.tools.webEditorRename(env.boxPath, 'Frame')) as Record<string, unknown>;
    expect(result['error']).toBeUndefined();
    expect(result['ok']).toBe(true);
  });
});
