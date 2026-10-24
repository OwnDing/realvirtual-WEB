// SPDX-License-Identifier: AGPL-3.0-only
// Calibrate against encoded duration: Playwright starts video at the first frame,
// which can be later than the recording script starts its wall clock.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { sha } from './build.mjs';
import { webVtt } from './captions.mjs';
export async function finalizeMedia() {
  const root = resolve('docs/user/media');
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    for (const video of manifest.videos) {
      await page.goto(pathToFileURL(resolve(root, video.file)).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Number.isFinite(document.querySelector('video')?.duration));
      const duration = await page.locator('video').evaluate(video => video.duration);
      if (video.capturedDurationSeconds) {
        if (Math.abs(duration - video.durationSeconds) > 0.1) throw new Error(`Video changed without a new recording manifest: ${video.topic}`);
        continue;
      }
      video.capturedDurationSeconds = video.durationSeconds;
      video.durationSeconds = duration;
      video.recordingLeadInSeconds = Math.max(0, video.capturedDurationSeconds - duration);
      const lead = video.recordingLeadInSeconds * 1000;
      video.chapters = video.chapters.map(c => ({ ...c, start: Math.max(0, Math.round(c.start - lead)), end: Math.min(Math.round(duration * 1000), Math.round(c.end - lead)) }));
      if (video.chapters.some(c => c.end <= c.start)) throw new Error(`Re-record ${video.topic}: a chapter predates the first captured frame`);
      for (const [locale, key] of [['zh-CN', 'zh'], ['en-US', 'en']]) {
        const contents = webVtt(video.chapters, key), name = video.subtitles[locale];
        await writeFile(resolve(root, name), contents); manifest.files[name] = sha(contents);
      }
    }
    await writeFile(resolve(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await finalizeMedia();
