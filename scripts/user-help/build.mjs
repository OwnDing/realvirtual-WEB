// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tutorialSources } from './media-sources.mjs';
import { webVtt } from './captions.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => readFileSync(resolve(root, path), 'utf8');
export function stripMetadata(text) { return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim(); }
export function headingId(text) { return text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-'); }
export function safeUrl(value) {
  if (/^(?:javascript|data|vbscript):/i.test(value) || /[\x00-\x20\\"<>]/.test(value) || value.startsWith('//')) throw new Error('UNSAFE_DOC_URL');
  if (/^[a-z]+:/i.test(value) && !/^https?:/i.test(value)) throw new Error('UNSAFE_DOC_URL');
  return value;
}
/** Escape all author HTML. Only this small Markdown vocabulary is executable by the build. */
export function renderMarkdown(source, resolveLink = value => value) {
  const anchors = new Set(), links = [];
  const inline = text => {
    const held = [];
    const token = html => { held.push(html); return `\u0001${held.length - 1}\u0002`; };
    let input = text.replace(/`([^`]+)`/g, (_, text) => token(`<code>${escapeHtml(text)}</code>`));
    input = input.replace(/(!?)\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_, image, label, url) => {
      safeUrl(url); const target = resolveLink(url, !!image); safeUrl(target); links.push(target);
      return token(image ? `<img loading="lazy" src="${escapeHtml(target)}" alt="${escapeHtml(label)}">` : `<a href="${escapeHtml(target)}"${target.endsWith('.glb') ? ' download' : ''}${/^https?:/.test(target) ? ' rel="noopener noreferrer" target="_blank"' : ''}>${escapeHtml(label)}</a>`);
    });
    return escapeHtml(input).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\u0001(\d+)\u0002/g, (_, id) => held[Number(id)]);
  };
  let html = '', list = '', code = false, table = false;
  const closeList = () => { if (list) { html += `</${list}>\n`; list = ''; } };
  const closeTable = () => { if (table) { html += '</tbody></table></div>\n'; table = false; } };
  for (const line of stripMetadata(source).split(/\r?\n/)) {
    if (line.startsWith('```')) { closeList(); closeTable(); html += code ? '</code></pre>\n' : '<pre><code>'; code = !code; continue; }
    if (code) { html += escapeHtml(line) + '\n'; continue; }
    if (!line.trim()) { closeList(); closeTable(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { closeList(); closeTable(); const explicit = /^(.*) \{#([a-z][a-z0-9-]*)\}$/.exec(heading[2]); const title = explicit ? explicit[1] : heading[2]; let id = explicit ? explicit[2] : headingId(title); const base = id; let n = 2; while (anchors.has(id)) id = `${base}-${n++}`; anchors.add(id); html += `<h${heading[1].length} id="${id}">${inline(title)}</h${heading[1].length}>\n`; continue; }
    if (line.startsWith('|')) {
      closeList(); if (/^\|[\s:|\-]+\|$/.test(line)) continue;
      const cells = line.replace(/^\||\|$/g, '').split('|');
      if (!table) { html += '<div class="table"><table><tbody>'; table = true; }
      html += `<tr>${cells.map(c => `<td>${inline(c.trim())}</td>`).join('')}</tr>\n`; continue;
    }
    closeTable(); const item = /^(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
    if (item) { const kind = item[1] ? 'ul' : 'ol'; if (kind !== list) { closeList(); html += `<${kind}>`; list = kind; } html += `<li>${inline(item[2])}</li>\n`; continue; }
    closeList(); html += `<p>${inline(line.replace(/^>\s*/, ''))}</p>\n`;
  }
  if (code) throw new Error('UNCLOSED_DOC_FENCE'); closeList(); closeTable();
  return { html, anchors: [...anchors], links };
}
const labels = {
  'zh-CN': { home: '用户手册', search: '搜索本地帮助', empty: '没有匹配主题。请尝试模型、保存、导览或诊断。', skip: '跳到正文', print: '打印', videos: '操作视频', references: '客户 IT 参考', version: '文档版本', notice: '离线可用 · 无自动上传', transcript: '文字步骤', missing: '主题未收录，请选择下方相关主题。' },
  'en-US': { home: 'User guide', search: 'Search local help', empty: 'No matching topic. Try model, save, tour or diagnostics.', skip: 'Skip to content', print: 'Print', videos: 'Tutorial videos', references: 'Customer IT references', version: 'Documentation version', notice: 'Available offline · No automatic upload', transcript: 'Written steps', missing: 'This topic is not covered. Choose a related topic below.' },
};
export function generateFiles({ mediaRequired = true } = {}) {
  const manifest = JSON.parse(read('docs/user/manifest.json'));
  if (JSON.stringify(manifest.locales) !== JSON.stringify(['zh-CN', 'en-US'])) throw new Error('DOC_LOCALES_INVALID');
  if (manifest.schemaVersion !== 1 || manifest.topics.length !== 12 || new Set(manifest.topics.map(t => t.id)).size !== 12 || [...manifest.topics, ...manifest.references].some(t => !/^[a-z][a-z0-9-]*$/.test(t.id))) throw new Error('DOC_TOPICS_INVALID');
  const files = new Map(), inputs = new Map();
  const input = path => { const text = readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n'); inputs.set(path, sha(text)); return text; };
  input('docs/user/manifest.json'); input('scripts/user-help/build.mjs'); input('scripts/user-help/media-sources.mjs'); input('scripts/user-help/captions.mjs');
  const version = JSON.parse(input('package.json')).version;
  const routes = {};
  const addRoutes = (topic, slugs) => slugs.forEach(slug => { routes[slug] = topic; });
  addRoutes('overview', ['', 'odt', 'des/overview', 'planner/overview', 'hmi/overview', 'hmi/signals-and-alarms', 'development/overview']);
  addRoutes('navigation', ['viewer/interface', 'getting-started/navigation']);
  addRoutes('models', ['viewer/scenes-and-models', 'getting-started/opening-a-twin', 'editor/overview']);
  addRoutes('support', ['hmi/ai-diagnosis']);
  const helpSource = input('src/core/hmi/help-topics.ts');
  const knownSlugs = [...helpSource.match(/KNOWN_DOC_SLUGS = \[([\s\S]*?)\] as const/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
  for (const slug of knownSlugs) if (!(slug in routes)) routes[slug] = slug.includes('licens') ? 'licensing' : slug.includes('troubleshoot') || slug.startsWith('connect/') ? 'support' : 'delivery';
  for (const topic of manifest.topics) { routes[topic.id] = topic.id; for (const path of topic.sources) input(path); }
  const pageData = [];
  for (const locale of manifest.locales) {
    for (const topic of manifest.topics) {
      const path = `docs/user/${locale}/${topic.id}.md`, text = input(path);
      if (!topic.titles[locale] || stripMetadata(text).length < 250) throw new Error(`INCOMPLETE_DOC:${path}`);
      if (topic.id === 'faq' && [...text.matchAll(/^## \d+\./gm)].length < 20) throw new Error('FAQ_TOO_SHORT');
      const rendered = renderMarkdown(text, (href, image) => {
        if (href === '../../../public/library/PalletHandling/RollConveyor-3m.glb') return '../../examples/roll-conveyor.glb';
        if (image) { if (!href.startsWith('../media/')) throw new Error('DOC_IMAGE_PATH'); return '../../media/' + href.slice(9); }
        const [target, anchor] = href.split('#');
        if (!target) return href;
        const id = target.replace(/\.md$/, '');
        if (!manifest.topics.some(t => t.id === id)) throw new Error(`UNKNOWN_DOC_LINK:${href}`);
        return `../${id}/index.html${anchor ? '#' + anchor : ''}`;
      });
      pageData.push({ locale, id: topic.id, title: topic.titles[locale], ...rendered, text: stripMetadata(text) });
    }
    // References are source-faithful appendices. Local cross references are rendered as text labels;
    // users never follow repository-only paths or mistake them for translated customer instructions.
    for (const ref of manifest.references) {
      const text = input(ref.sources[locale]);
      const sanitized = stripMetadata(text).replace(/\[([^\]]+)\]\((?!https?:)[^)]+\)/g, '$1');
      pageData.push({ locale, id: `it-${ref.id}`, title: ref.titles[locale], ...renderMarkdown(sanitized), text: sanitized });
    }
  }
  const example = readFileSync(resolve(root, 'public/library/PalletHandling/RollConveyor-3m.glb'));
  files.set('examples/roll-conveyor.glb', example); inputs.set('public/library/PalletHandling/RollConveyor-3m.glb', sha(example));
  let media = { videos: [] };
  if (existsSync(resolve(root, 'docs/user/media/manifest.json'))) {
    media = JSON.parse(input('docs/user/media/manifest.json'));
    if (media.schemaVersion !== 1 || media.productVersion !== version) throw new Error('DOC_MEDIA_VERSION');
    if (media.videos.length !== 3 || new Set(media.videos.map(v => v.topic)).size !== 3 || !['navigation','tours','support'].every(id => media.videos.some(v => v.topic === id))) throw new Error('DOC_VIDEO_COUNT');
    for (const video of media.videos) {
      if (video.durationSeconds < 120 || video.durationSeconds > 260) throw new Error('DOC_VIDEO_DURATION');
      for (const path of tutorialSources[video.topic]) if (sha(input(path)) !== video.sourceDigests?.[path]) throw new Error(`DOC_VIDEO_UI_DRIFT:${video.topic}:${path}`);
      for (const name of [video.file, video.poster, ...Object.values(video.subtitles)]) {
        if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('DOC_MEDIA_PATH');
        const bytes = readFileSync(resolve(root, 'docs/user/media', name));
        if (sha(bytes) !== media.files[name]) throw new Error(`DOC_MEDIA_DIGEST:${name}`);
        files.set(`media/${name}`, bytes); inputs.set(`docs/user/media/${name}`, sha(bytes));
      }
      for (const locale of manifest.locales) {
        const caption = files.get(`media/${video.subtitles[locale]}`)?.toString();
        if (caption !== webVtt(video.chapters, locale === 'zh-CN' ? 'zh' : 'en')) throw new Error('DOC_SUBTITLES_MISSING_OR_DRIFTED');
      }
    }
  } else if (mediaRequired) throw new Error('DOC_MEDIA_MISSING');
  for (const name of ['page.js', 'page.css', 'redirect.js']) files.set(name, input(`scripts/user-help/${name}`));
  const captions = {};
  for (const video of media.videos) {
    captions[video.topic] = {};
    for (const [locale, key] of [['zh-CN', 'zh'], ['en-US', 'en']]) {
      if (video.chapters.length < 6 || video.chapters.some(c => !c[key] || c.start < 0 || c.end <= c.start || c.end > video.durationSeconds * 1000 + 10)) throw new Error('DOC_CAPTIONS_INVALID');
      captions[video.topic][locale] = video.chapters.map(c => ({ start: c.start / 1000, end: c.end / 1000, text: c[key] }));
    }
  }
  files.set('captions.js', `// Generated from the recorded chapter timestamps; no file:// cross-origin fetch.\nwindow.rvHelpCaptions = ${JSON.stringify(captions).replaceAll('<', '\\u003c')};\n`);
  const contentDigest = sha(JSON.stringify([...inputs].sort(([a], [b]) => a.localeCompare(b))));
  const stamp = `${version} · ${manifest.revision} · ${contentDigest.slice(0, 12)}`;
  for (const page of pageData) {
    const { locale, id, title } = page, t = labels[locale], other = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    const nav = manifest.topics.map(topic => `<a${topic.id === id ? ' aria-current="page"' : ''} href="../${topic.id}/index.html">${escapeHtml(topic.titles[locale])}</a>`).join('');
    const references = manifest.references.map(ref => `<a href="../it-${ref.id}/index.html">${escapeHtml(ref.titles[locale])}</a>`).join('');
    const video = media.videos.find(v => v.topic === id);
    const videoHtml = video ? `<section><h2>${t.videos}</h2><video data-topic="${video.topic}" controls preload="none" poster="../../media/${video.poster}" width="1920" height="1080"><source src="../../media/${video.file}" type="video/webm"></video><p><a href="../../media/${video.file}" download>${t.videos} · WebM</a> · ${video.durationSeconds.toFixed(0)} s · ${manifest.locales.map(l => `<a href="../../media/${video.subtitles[l]}" download>${l} VTT</a>`).join(' · ')}</p><details><summary>${t.transcript}</summary><ol>${video.chapters.map(c => `<li>${Math.floor(c.start / 60000)}:${String(Math.floor(c.start / 1000) % 60).padStart(2, '0')} — ${escapeHtml(c[locale === 'zh-CN' ? 'zh' : 'en'])}</li>`).join('')}</ol></details></section>` : '';
    const body = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)} · XYvirtual WEB</title><link rel="stylesheet" href="../../page.css"><script src="../../search-index.js" defer></script><script src="../../captions.js" defer></script><script src="../../page.js" defer></script></head><body><a class="skip" href="#content">${t.skip}</a><header><a href="../overview/index.html">XYvirtual WEB / ${t.home}</a><span>${t.notice}</span><a id="language" href="../../${other}/${id}/index.html" lang="${other}">${other === 'en-US' ? 'English' : '中文'}</a><button id="print">${t.print}</button></header><div class="layout"><aside><label for="search">${t.search}</label><input id="search" type="search" autocomplete="off"><div id="results" role="status" data-empty="${t.empty}"></div><nav aria-label="${t.home}">${nav}<h2>${t.references}</h2>${references}</nav></aside><main id="content" tabindex="-1"><p class="breadcrumb"><a href="../overview/index.html">${t.home}</a> / ${escapeHtml(title)}</p>${page.html}${videoHtml}<footer>${t.version}: <span>${stamp}</span></footer></main></div></body></html>\n`;
    files.set(`${locale}/${id}/index.html`, '<!-- Generated by scripts/user-help/build.mjs; edit docs/user sources. -->\n' + body);
  }
  files.set('search-index.js', `// Generated; edit docs/user sources.\nwindow.rvHelpIndex = ${JSON.stringify(pageData.map(p => ({ locale: p.locale, id: p.id, title: p.title, text: p.text }))).replaceAll('<', '\\u003c')};\n`);
  for (const [slug, target] of Object.entries(routes)) {
    const depth = slug ? slug.split('/').length : 0, base = '../'.repeat(depth) || './';
    files.set(`${slug ? slug + '/' : ''}index.html`, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XYvirtual WEB — Help</title><script src="${base}redirect.js" defer></script></head><body data-base="${base}" data-topic="${target}"><p><a href="${base}zh-CN/${target}/index.html">中文</a> · <a href="${base}en-US/${target}/index.html">English</a></p></body></html>\n`);
  }
  files.set('manifest.json', JSON.stringify({ schemaVersion: 1, productVersion: version, revision: manifest.revision, contentDigest, inputs: Object.fromEntries([...inputs].sort()), pages: pageData.map(({ locale, id, anchors }) => ({ locale, id, anchors })), routes, media }, null, 2) + '\n');
  // Validate every generated local destination including anchors and media.
  for (const [name, body] of files) if (name.endsWith('.html')) {
    for (const match of body.toString().matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1]; if (/^https?:/.test(href)) continue;
      const [target, anchor] = href.split('#'), resolved = relative('/help', resolve('/help', dirname(name), target || name.split('/').at(-1))).replaceAll('\\', '/');
      if (target && !files.has(resolved)) { if (!mediaRequired && resolved.startsWith('media/')) continue; throw new Error(`DOC_LINK_MISSING:${name}:${href}`); }
      if (anchor && !files.get(resolved)?.toString().includes(`id="${anchor}"`)) throw new Error(`DOC_ANCHOR_MISSING:${name}:${href}`);
    }
  }
  return files;
}
export function buildHelp({ check = false, output = resolve(root, 'public/user-help'), mediaRequired = true } = {}) {
  const files = generateFiles({ mediaRequired });
  for (const [name, body] of files) {
    const target = resolve(output, name);
    if (check) { if (!existsSync(target) || !Buffer.from(body).equals(readFileSync(target))) throw new Error(`DOC_GENERATED_DRIFT:${name}`); }
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body); }
  }
  if (check) {
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [relative(output, join(dir, e.name)).replaceAll('\\', '/')]);
    for (const path of walk(output)) if (!files.has(path)) throw new Error(`DOC_STALE_OUTPUT:${path}`);
  }
  return files.size;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(`[user-help] ${buildHelp({ check: process.argv.includes('--check'), mediaRequired: !process.argv.includes('--without-media') })} validated files`);
