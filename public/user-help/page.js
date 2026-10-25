// SPDX-License-Identifier: AGPL-3.0-only
// Static scripts also work when the complete help directory is opened using file://.
(() => {
  const search = document.getElementById('search'), results = document.getElementById('results');
  const locale = document.documentElement.lang;
  search.addEventListener('input', () => {
    results.replaceChildren(); const query = search.value.trim().toLocaleLowerCase(locale).slice(0, 160);
    if (!query) return;
    const terms = query.split(/\s+/);
    const matches = window.rvHelpIndex.filter(page => page.locale === locale && terms.every(term => (page.title + ' ' + page.text).toLocaleLowerCase(locale).includes(term))).slice(0, 20);
    if (!matches.length) results.textContent = results.dataset.empty;
    for (const page of matches) { const a = document.createElement('a'); a.href = `../${page.id}/index.html`; a.textContent = page.title; results.append(a); }
  });
  document.getElementById('print').addEventListener('click', () => window.print());
  const language = document.getElementById('language');
  language.addEventListener('click', () => { language.hash = location.hash; });
  // Chromium treats sibling file:// VTT files as different origins. Add the
  // same versioned cues directly, without fetch, for both hosted and local use.
  const video = document.querySelector('video');
  if (video) {
    for (const lang of ['zh-CN', 'en-US']) {
      const track = video.addTextTrack('subtitles', lang === 'zh-CN' ? '中文' : 'English', lang);
      for (const cue of window.rvHelpCaptions[video.dataset.topic][lang]) track.addCue(new VTTCue(cue.start, cue.end, cue.text));
      track.mode = lang === locale ? 'showing' : 'disabled';
    }
  }
})();
