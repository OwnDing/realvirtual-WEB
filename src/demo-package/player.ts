// SPDX-License-Identifier: AGPL-3.0-only
import { PerspectiveCamera } from 'three';
import { RVEmbedViewer } from '../embed/rv-embed-viewer';
import type { RVEmbedDirectorStep } from '../embed/rv-embed-director';
import { DemoPackageError, parseDemoRecipe, demoFileName, type DemoCamera } from '../core/demo-package/recipe';
import { fromBase64, MAX_DEMO_SOURCE_BYTES, type DemoPayload } from '../core/demo-package/html';
import { preflightDemoGlb, MAX_DEMO_MODEL_BYTES } from '../core/demo-package/preflight';
import { demoMessages } from '../core/i18n/catalogs/demo-package';

const status = document.querySelector<HTMLElement>('#status')!;
const lifecycle = new AbortController();
let viewer: RVEmbedViewer | undefined;
const urls: string[] = [];
let messages = demoMessages(document.documentElement.lang);
const cleanup = () => { lifecycle.abort(); viewer?.dispose(); urls.forEach(url => URL.revokeObjectURL(url)); };
window.addEventListener('pagehide', cleanup, { once: true });
// Returning from bfcache must recreate the disposed WebGL context and listeners.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
async function start(): Promise<void> {
  const data = JSON.parse(document.getElementById('rv-demo-data')!.textContent!) as DemoPayload;
  if (data.schemaVersion !== 1 || data.license !== 'AGPL-3.0-only') throw new DemoPackageError('recipe');
  const recipe = parseDemoRecipe(data.recipe); messages = demoMessages(recipe.locale);
  const bytes = fromBase64(data.modelBase64, MAX_DEMO_MODEL_BYTES); preflightDemoGlb(bytes);
  document.title = recipe.title; document.querySelector('h1')!.textContent = recipe.title;
  const download = (id: string, bytes: Uint8Array, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type })); urls.push(url);
    const link = document.getElementById(id) as HTMLAnchorElement; link.href = url; link.download = name;
  };
  download('recipe', new TextEncoder().encode(JSON.stringify(recipe, null, 2)), `${demoFileName(recipe.title)}.demo.json`, 'application/json');
  download('source', fromBase64(data.sourceBase64, MAX_DEMO_SOURCE_BYTES), 'demo-player-source.zip', 'application/zip');
  const caption = document.querySelector<HTMLElement>('#caption')!;
  const play = document.querySelector<HTMLButtonElement>('#play')!;
  let playing = false, index = -1;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const buttonState = (active: boolean) => { playing = active; play.textContent = active ? messages.stop : messages.play; play.setAttribute('aria-pressed', String(active)); };
  const stop = () => { viewer?.takeOver(); buttonState(false); };
  const show = (i: number) => {
    index = i; const step = recipe.steps[i];
    caption.textContent = step ? `${i + 1} / ${recipe.steps.length} · ${step.title}\n${step.description}` : '';
    if (step) setFov(step.camera);
  };
  const setFov = (pose: DemoCamera) => { const camera = viewer!.controls.object as PerspectiveCamera; camera.fov = pose.fov; camera.updateProjectionMatrix(); };
  const pose = (camera: DemoCamera, duration = 0) => { setFov(camera); viewer!.camera.tween(camera, duration); };
  viewer = new RVEmbedViewer({ canvas: document.querySelector('canvas')!, width: innerWidth, height: innerHeight, allowUntrustedLogic: false, signal: lifecycle.signal,
    directorEvents: { action: event => {
      if (event.type !== 'overlay') return;
      if (event.event === 'demo-shot') show(Number(event.detail));
      if (event.event === 'demo-finished') buttonState(false);
    }, error: () => { stop(); status.textContent = messages.error_unknown; } },
  });
  await viewer.loadModel('demo.glb', bytes.slice().buffer);
  if (lifecycle.signal.aborted) return;
  pose(recipe.startCamera); viewer.play();
  // Reduced motion suppresses automatic simulation until an explicit play action.
  if (reduceMotion.matches) viewer.pause();
  const visibility = () => viewer!.setPaused('demo-hidden', document.hidden);
  document.addEventListener('visibilitychange', visibility, { signal: lifecycle.signal }); visibility();
  window.addEventListener('resize', () => viewer!.resize(innerWidth, innerHeight), { signal: lifecycle.signal });
  viewer.controls.addEventListener('start', stop);
  lifecycle.signal.addEventListener('abort', () => viewer?.controls.removeEventListener('start', stop), { once: true });
  play.disabled = recipe.steps.length === 0;
  play.addEventListener('click', () => {
    if (playing) { stop(); return; }
    viewer!.play(); buttonState(true);
    const steps: RVEmbedDirectorStep[] = recipe.steps.flatMap((step, i) => [
      { overlay: { event: 'demo-shot', detail: i } },
      { camera: step.camera, duration: reduceMotion.matches ? 0 : step.durationMs },
      { wait: step.dwellMs },
    ]);
    if (!recipe.loop) steps.push({ overlay: { event: 'demo-finished' } });
    viewer!.director.run({ steps, loop: recipe.loop });
  }, { signal: lifecycle.signal });
  for (const [id, direction] of [['previous', -1], ['next', 1]] as const) {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`)!; button.disabled = !recipe.steps.length;
    button.addEventListener('click', () => { stop(); const next = index < 0 ? (direction > 0 ? 0 : recipe.steps.length - 1) : (index + direction + recipe.steps.length) % recipe.steps.length; show(next); pose(recipe.steps[next].camera); }, { signal: lifecycle.signal });
  }
  const reset = document.querySelector<HTMLButtonElement>('#reset')!; reset.disabled = false;
  reset.addEventListener('click', () => { stop(); show(-1); pose(recipe.startCamera); }, { signal: lifecycle.signal });
  status.textContent = ''; document.body.dataset.demoReady = 'true';
}
void start().catch(error => {
  cleanup(); status.setAttribute('role', 'alert'); status.textContent = error instanceof DemoPackageError ? messages[`error_${error.code}`] : messages.error_unknown;
});
