// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { DocumentCard } from '../src/core/hmi/scene/DocumentCard';
import { RVViewerProvider } from '../src/hooks/use-viewer';
import DemoExportPanel from '../src/core/demo-package/DemoExportPanel';
import { loadDemoArtifacts } from '../src/core/demo-package/artifacts';
import { setActiveDocumentView, resetActiveDocumentViewForTests, type ActiveDocumentView } from '../src/core/editor/active-document-view';
import { exportAssetGlb } from '../src/core/editor/rv-asset-glb-export';
import { initI18n, setLocale } from '../src/core/i18n';
import type { RVViewer } from '../src/core/rv-viewer';
vi.mock('../src/core/demo-package/artifacts', () => ({ loadDemoArtifacts: vi.fn() }));
beforeAll(async () => { initI18n(); await setLocale('en-US'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); resetActiveDocumentViewForTests(); });
function mount(run?: () => Promise<ArrayBuffer>) {
  const root = new Group(); root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: 0x22bb55 })));
  const camera = new PerspectiveCamera(55); camera.position.set(3, 2, 4);
  const viewer = { camera, controls: { target: new Vector3() }, currentModelRoot: root, animateCameraTo: vi.fn() } as unknown as RVViewer;
  const capability = { identity: {}, run: run ?? (() => exportAssetGlb(root, 'Fixture')) };
  const view: ActiveDocumentView = { name: 'Fixture', crumbs: [], dirty: false, busy: false, stackDirty: false, stale: false, saveVerb: 'save', sourceMode: 'editor', actions: { save: async () => ({ status: 'saved' }), exportDemo: capability } };
  setActiveDocumentView(view);
  const component = render(<DemoExportPanel viewer={viewer} capability={capability} name="Fixture" mode="editor" onClose={vi.fn()} />);
  return { ...component, viewer, view };
}
function artifacts() {
  const player = new TextEncoder().encode('/* player */'), source = new Uint8Array([80,75,3,4]);
  return { player, source, manifest: { schemaVersion: 1 as const, version: __RV_VERSION__, revision: 'test', sha256: bytesToHex(sha256(player)), sourceSha256: bytesToHex(sha256(source)) } };
}
describe('demo authoring and export lifecycle', () => {
  it('opens from the current document card and closes when its document changes', async () => {
    const initial = mount(); initial.unmount();
    render(<RVViewerProvider value={initial.viewer}><DocumentCard variant="compact" activeMode="editor" /></RVViewerProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByTestId('document-card-verb-export-demo'));
    await waitFor(() => expect(screen.getByTestId('demo-export-panel')).toBeTruthy());
    act(() => setActiveDocumentView({ ...initial.view, actions: { ...initial.view.actions, exportDemo: { identity: {}, run: async () => new ArrayBuffer(0) } } }));
    await waitFor(() => expect(screen.queryByTestId('demo-export-panel')).toBeNull());
  });
  it('captures, edits, reorders and previews shots, then exports the actual snapshot with recipe', async () => {
    vi.mocked(loadDemoArtifacts).mockResolvedValue(artifacts());
    const blobs: Blob[] = []; vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob as Blob); return 'blob:test'; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { viewer } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add current view' }));
    fireEvent.change(screen.getByLabelText('1. Shot title'), { target: { value: 'Front' } });
    viewer.camera.position.set(5, 2, 1); fireEvent.click(screen.getByRole('button', { name: 'Add current view' }));
    fireEvent.change(screen.getByLabelText('2. Shot title'), { target: { value: 'Side' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
    expect((screen.getByLabelText('1. Shot title') as HTMLInputElement).value).toBe('Side');
    fireEvent.click(screen.getAllByRole('button', { name: 'Preview shot' })[0]); expect(viewer.animateCameraTo).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Export demo HTML' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const html = await blobs[0].text(); const match = html.match(/id="rv-demo-data" type="application\/json">(.*?)<\/script>/s)!;
    const data = JSON.parse(match[1]); expect(data.recipe.steps.map((s: { title: string }) => s.title)).toEqual(['Side','Front']);
    expect(data.recipe.startCamera.position).toEqual([3,2,4]); expect(data.recipe.steps[0].camera.position).toEqual([5,2,1]); expect(data.modelBase64.length).toBeGreaterThan(100);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Demo exported'));
  });
  it.each(['cancel', 'switch', 'unmount'])('never downloads a late result after %s', async reason => {
    let resolve!: (value: ArrayBuffer) => void; const pending = new Promise<ArrayBuffer>(r => { resolve = r; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(loadDemoArtifacts).mockResolvedValue(artifacts());
    const mounted = mount(() => pending);
    fireEvent.click(screen.getByRole('button', { name: 'Export demo HTML' }));
    if (reason === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel export' }));
    else if (reason === 'switch') setActiveDocumentView({ ...mounted.view, actions: { ...mounted.view.actions, exportDemo: { identity: {}, run: async () => new ArrayBuffer(0) } } });
    else mounted.unmount();
    await act(async () => { resolve(new ArrayBuffer(0)); await pending; });
    expect(click).not.toHaveBeenCalled();
    if (reason === 'switch') await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('current document changed'));
  });
  it('shows invalid recipe durations and preflight failures without downloading', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add current view' }));
    fireEvent.change(screen.getByLabelText('Dwell (seconds)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export demo HTML' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid tour recipe'));
    expect(click).not.toHaveBeenCalled();
  });
  it('reopens a saved recipe without changing the document, and rejects invalid files', async () => {
    mount(); const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const recipe = { schemaVersion: 1, title: 'Reopened', locale: 'en-US', startCamera: { position: [6,2,1], target: [0,0,0], fov: 60 }, loop: false, steps: [] };
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(recipe)], 'tour.demo.json')] } });
    await waitFor(() => expect((screen.getByLabelText('Demo name') as HTMLInputElement).value).toBe('Reopened'));
    fireEvent.change(input, { target: { files: [new File(['not JSON'], 'bad.json')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid tour recipe'));
    expect((screen.getByLabelText('Demo name') as HTMLInputElement).value).toBe('Reopened');
  });
});
