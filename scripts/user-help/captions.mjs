// SPDX-License-Identifier: AGPL-3.0-only
const time = value => {
  const ms = Math.max(0, Math.round(value));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
export function webVtt(chapters, language) {
  return 'WEBVTT\n\n' + chapters.map((c, i) => `${i + 1}\n${time(c.start)} --> ${time(c.end)}\n${c[language]}\n`).join('\n');
}
