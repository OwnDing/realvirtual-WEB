// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Object3D } from 'three';
import { WebComponentPlugin } from '../src/plugins/web-component-plugin';
import { RVScriptHost } from '../src/core/engine/rv-script-host';
import { setAppConfig } from '../src/core/rv-app-config';
import { getScriptEditorState } from '../src/core/hmi/script/script-editor-store';
import type { LoadResult } from '../src/core/engine/rv-scene-loader';
import type { RVViewer } from '../src/core/rv-viewer';
import { computeWebComponentNodePath } from '../src/core/engine/rv-web-component-registry';
const viewer = {} as RVViewer;
function load(): LoadResult {
  const root = new Object3D(); root.name = 'Model';
  root.userData.realvirtual = { WebComponent: { Code: 'function setup(){return {}}' } };
  return { root, logicGated: false, gatedFrames: [] } as unknown as LoadResult;
}
afterEach(() => { setAppConfig({}); vi.restoreAllMocks(); });
describe('WebComponent consent generation', () => {
  it('a URL/constructor request opens the editor but does not run scripts', () => {
    const plugin = new WebComponentPlugin({ allowScripts: true });
    try {
      plugin.onModelLoaded(load(), viewer);
      expect(getScriptEditorState().open).toBe(true);
      expect(plugin.scriptsAllowed).toBe(false);
      expect(plugin.instances).toEqual([]);
    } finally { plugin.dispose(); }
  });
  it('deployment denial overrides explicit model consent', () => {
    setAppConfig({ scripting: { sandbox: false, native: false } });
    const plugin = new WebComponentPlugin();
    try { plugin.onModelLoaded(load(), viewer); plugin.setAllowScripts(true); expect(plugin.scriptsAllowed).toBe(false); }
    finally { plugin.dispose(); }
  });
  it('saving one script cannot approve an unrelated concurrent edit', async () => {
    let resolve!: (value: RVScriptHost) => void;
    vi.spyOn(RVScriptHost, 'create').mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const plugin = new WebComponentPlugin(); const result = load();
    const sibling = new Object3D(); sibling.name = 'Other';
    sibling.userData.realvirtual = { WebComponent: { Code: 'function setup(){return {}}' } };
    result.root.add(sibling);
    plugin.onModelLoaded(result, viewer); plugin.setAllowScripts(true);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    sibling.userData.realvirtual.WebComponent.Code = 'while(true){}';
    expect(await plugin.reloadOrCreate(computeWebComponentNodePath(result.root), 'function setup(){return {}}')).toBe(false);
    resolve({ dispose: vi.fn() } as unknown as RVScriptHost);
    await new Promise(r => setTimeout(r, 0));
    expect(plugin.scriptsAllowed).toBe(false);
    expect(plugin.instances).toEqual([]);
    plugin.dispose();
  });
  it('revoke/switch/dispose during WASM initialization never creates a stale registry', async () => {
    for (const action of ['revoke', 'switch', 'dispose', 'edit']) {
      let resolve!: (value: RVScriptHost) => void;
      vi.spyOn(RVScriptHost, 'create').mockImplementationOnce(() => new Promise(r => { resolve = r; }));
      const plugin = new WebComponentPlugin(); const result = load();
      plugin.onModelLoaded(result, viewer); plugin.setAllowScripts(true);
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      if (action === 'revoke') plugin.setAllowScripts(false);
      if (action === 'switch') plugin.onModelLoaded(load(), viewer);
      if (action === 'dispose') plugin.dispose();
      if (action === 'edit') result.root.userData.realvirtual.WebComponent.Code = 'while(true){}';
      const dispose = vi.fn(); resolve({ dispose } as unknown as RVScriptHost);
      await new Promise(r => setTimeout(r, 0));
      expect(plugin.instances).toEqual([]);
      if (action !== 'edit') expect(plugin.scriptsAllowed).toBe(false);
      plugin.dispose(); expect(dispose).toHaveBeenCalledOnce();
    }
  });
});
