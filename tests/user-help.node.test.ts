// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateFiles, renderMarkdown, safeUrl, buildHelp } from '../scripts/user-help/build.mjs';
import { checkErrorBoundaries, errorSites, validateTriage, type Review } from '../scripts/user-help/errors.mjs';
import { userHelpChinese, userHelpEnglish } from '../src/core/i18n/catalogs/user-help';
describe('versioned offline user documentation', () => {
  // Repository-wide AST inventory is suite setup, as in i18n-inventory.node.test.ts.
  // A scanner/boundary failure still fails collection; every assertion below remains active.
  const counts = checkErrorBoundaries();
  it('ships all paired topics, appendix resources and checked production outputs', () => {
    const files = generateFiles();
    const manifest = JSON.parse(String(files.get('manifest.json')));
    expect(manifest.pages.filter((p: {id: string}) => !p.id.startsWith('it-'))).toHaveLength(24);
    expect(manifest.media.videos).toHaveLength(3);
    expect(buildHelp({ check: true })).toBe(files.size);
    expect(files.has('viewer/interface/index.html')).toBe(true);
    for (const locale of ['zh-CN', 'en-US']) expect(String(files.get(`${locale}/navigation/index.html`))).toContain('id="hierarchy"');
  });
  it('never executes author HTML and rejects executable URL schemes and broken fences', () => {
    expect(renderMarkdown('<script>alert(1)</script>').html).toContain('&lt;script&gt;');
    for (const url of ['javascript:alert', 'data:text/html,x', '//outside.test/a', 'x\\a']) expect(() => safeUrl(url)).toThrow('UNSAFE_DOC_URL');
    expect(() => renderMarkdown('[bad](javascript:alert)')).toThrow();
    expect(() => renderMarkdown('```js\nx')).toThrow('UNCLOSED_DOC_FENCE');
  });
  it('gives repeated headings distinct targets and preserves quoted code safely', () => {
    const rendered = renderMarkdown('# Same\n\n## Same\n\n`<img>`');
    expect(rendered.anchors).toEqual(['same','same-2']);
    expect(rendered.html).toContain('<code>&lt;img&gt;</code>');
    expect(renderMarkdown('## 层级 {#hierarchy}').html).toContain('id="hierarchy">层级</h2>');
  });
  it('enables only the explicitly selected delivery copy and preserves network policy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyvirtual-help-config-'));
    try {
      mkdirSync(join(dir, 'user-help'));
      writeFileSync(join(dir, 'user-help/manifest.json'), JSON.stringify({ schemaVersion: 1 }));
      const config = { schemaVersion: 2, egress: { mode: 'deny-external', allow: [] }, services: { documentation: null, analytics: null } };
      writeFileSync(join(dir, 'settings.json'), JSON.stringify(config));
      execFileSync(process.execPath, ['scripts/user-help/configure.mjs', '--dist', dir, '--page-url', 'https://delivery.example/team/']);
      const result = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
      expect(result.services.documentation).toEqual({ baseUrl: 'https://delivery.example/team/user-help/' });
      expect(result.egress).toEqual(config.egress); expect(result.services.analytics).toBeNull();
      expect(() => execFileSync(process.execPath, ['scripts/user-help/configure.mjs', '--dist', 'public', '--page-url', 'https://delivery.example/'], { stdio: 'pipe' })).toThrow();
      expect(() => execFileSync(process.execPath, ['scripts/user-help/configure.mjs', '--dist', dir, '--page-url', 'https://user:secret@delivery.example/'], { stdio: 'pipe' })).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps helper translations complete', () => {
    expect(Object.keys(userHelpEnglish).sort()).toEqual(Object.keys(userHelpChinese).sort());
    for (const value of Object.values(userHelpEnglish)) expect(value.trim().length).toBeGreaterThan(0);
  });
  it('requires exact reviewed sites, including additions, removals and evidence ownership', () => {
    const registry=JSON.parse(readFileSync('scripts/user-help/error-triage.json','utf8')) as {sites: Review[]};
    expect(Object.values(counts).reduce((a,b)=>a+b,0)).toBeGreaterThan(400);
    expect(validateTriage(registry.sites, registry)).toEqual([]);
    const added=errorSites([{file:'src/new.ts',category:'error-message',text:'new unchecked error'}]);
    expect(validateTriage([...registry.sites,...added],registry).some(e=>e.startsWith('untriaged:'))).toBe(true);
    expect(validateTriage(registry.sites.slice(1),registry).some(e=>e.startsWith('stale:'))).toBe(true);
    const broken=structuredClone(registry); broken.sites[0].evidence=[];
    expect(validateTriage(registry.sites,broken).some(e=>e.startsWith('incomplete:'))).toBe(true);
  });
});
