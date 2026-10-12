// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from 'playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pinLocale } from './helpers/pin-locale';

test('visual presentation: material edit/save/reopen, project look and local media downloads', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await pinLocale(page, 'en-US');
  await page.addInitScript(() => {
    sessionStorage.setItem('rv-storage-persist-dismissed', '1');
    sessionStorage.setItem('rv-gpu-warning-dismissed', '1');
  });
  await page.goto('/?scene=empty&mode=editor', { waitUntil: 'domcontentloaded' });
  const ready = () => page.waitForFunction(() => (window as any).__rvViewer?.getPlugin('asset-editor')?.getSnapshot().status === 'ready', null, { timeout: 90_000 });
  await ready();
  for (const id of ['welcome-dismiss', 'auto-quality-ok']) { const button = page.getByTestId(id); if (await button.isVisible()) await button.click(); }
  await page.getByTestId('smart-asset-editor-button').click();
  await page.getByTestId('smart-new-asset').click(); await ready();
  await page.getByTestId('smart-import-glb').click();
  const dialog = page.getByTestId('unified-import-dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.resolve('public/library/PaintLine/Workpiece-Bracket.glb'));
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() => (window as any).__rvViewer?.getPlugin('asset-editor')?.getSnapshot().report.meshCount > 0);
  if (await dialog.isVisible()) await dialog.locator('button').first().click();
  await page.getByTestId('smart-asset-name').fill('Visual presentation fixture');
  await page.getByTestId('smart-asset-name').press('Tab');

  // Select a concrete imported part through the same central selection API as
  // the hierarchy; the material, undo, redo and save actions below use the UI.
  const selected = await page.evaluate(async () => {
    const viewer = (window as any).__rvViewer;
    const { NodeRegistry } = await import('/src/core/engine/rv-node-registry.ts');
    let mesh: any;
    viewer.currentModelRoot.traverse((node: any) => { if (!mesh && node.isMesh && !node.name.startsWith('_')) mesh = node; });
    const nodePath = NodeRegistry.computeNodePath(mesh); viewer.selectionManager.select(nodePath);
    return { nodePath, original: mesh.material.color.getHexString() };
  });
  await page.getByTestId('presentation-button').click();
  const panel = page.getByTestId('presentation-panel');
  await panel.getByRole('tab', { name: 'Materials', exact: true }).click();
  await panel.getByRole('button', { name: 'Copper', exact: true }).click();
  await panel.getByRole('button', { name: 'Apply to selected parts', exact: true }).click();
  const color = () => page.evaluate(nodePath => (window as any).__rvViewer.registry.getNode(nodePath).material.color.getHexString(), selected.nodePath);
  await expect.poll(color).toBe('b97850');
  await panel.getByRole('button', { name: 'Undo', exact: true }).click(); await expect.poll(color).toBe(selected.original);
  await panel.getByRole('button', { name: 'Redo', exact: true }).click(); await expect.poll(color).toBe('b97850');
  page.on('dialog', prompt => prompt.accept(prompt.type() === 'prompt' ? 'Visual presentation fixture' : undefined));
  await panel.getByRole('button', { name: 'Save asset', exact: true }).click();
  await page.waitForFunction(() => { const doc = (window as any).__rvViewer.getPlugin('asset-editor').document; return doc.base.kind === 'document' && !doc.dirty; });
  const savedBase = await page.evaluate(() => (window as any).__rvViewer.getPlugin('asset-editor').document.base);

  await panel.getByRole('tab', { name: 'Scene style', exact: true }).click();
  await page.getByTestId('presentation-style-dark').click();
  await panel.getByRole('button', { name: 'Save as project default', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Saved');
  await panel.getByLabel('Template name', { exact: true }).fill('My stage');
  await panel.getByRole('button', { name: 'Save personal template', exact: true }).click();
  const templateDownload = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Export templates', exact: true }).click();
  const templateFile = await (await templateDownload).path(); expect(JSON.parse(await readFile(templateFile!, 'utf8')).templates[0].name).toBe('My stage');

  await panel.getByRole('tab', { name: 'Export', exact: true }).click();
  await expect(page.getByTestId('presentation-framing-guide')).toBeVisible();
  await page.keyboard.press('Shift+F');
  await page.screenshot({ path: testInfo.outputPath('visual-presentation.png') });
  const imageDownload = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Export image', exact: true }).click();
  const imageBytes = await readFile((await (await imageDownload).path())!);
  expect([imageBytes.readUInt32BE(16), imageBytes.readUInt32BE(20)]).toEqual([1920, 1080]);

  await panel.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Stop and download', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/Recording \d/)).toBeVisible();
  const videoDownload = page.waitForEvent('download', { timeout: 60_000 }); await panel.getByRole('button', { name: 'Stop and download', exact: true }).click({ timeout: 60_000 });
  const video = await videoDownload; expect(video.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  expect((await readFile((await video.path())!)).length).toBeGreaterThan(100);
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  // Explicitly reopen the saved document via its public editor command so the
  // test does not depend on which dashboard resume mode the user prefers.
  await page.evaluate(async base => {
    const viewer = (window as any).__rvViewer;
    await viewer.modes.requestMode('viewer');
    const { setPendingAssetOpen } = await import('/src/core/editor/pending-asset-open.ts');
    setPendingAssetOpen(base); await viewer.modes.requestMode('editor');
  }, savedBase);
  await ready();
  await expect.poll(() => page.evaluate(() => (window as any).__rvViewer.getPlugin('visual-presentation').getSnapshot().look.style)).toBe('dark');
  expect(await page.evaluate(() => { let found = false; (window as any).__rvViewer.currentModelRoot.traverse((n: any) => { if (n.isMesh && n.material?.color?.getHexString() === 'b97850') found = true; }); return found; })).toBe(true);
  expect(errors.filter(error => !error.includes('ResizeObserver'))).toEqual([]);
});
