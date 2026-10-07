// SPDX-License-Identifier: AGPL-3.0-only
import { build } from 'vite';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/demo-player');
const sourceFiles = new Set();
const dependencies = new Set();
// Build graph is the source allowlist: never archive unrelated public/, projects, env or private siblings.
await build({ configFile: resolve(root, 'vite.demo-player.config.ts'), plugins: [{
  name: 'demo-public-source-audit',
  generateBundle() {
    for (const id of this.getModuleIds()) {
      if (id.startsWith('\0')) continue;
      const path = id.split('?')[0];
      if (!path.startsWith('/')) continue;
      const rel = relative(root, path).replaceAll('\\', '/');
      if (rel.startsWith('node_modules/')) {
        const segments = rel.slice(13).split('/');
        dependencies.add(segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]);
      } else if ((rel.startsWith('src/') || rel.startsWith('schema/'))) sourceFiles.add(rel);
      else throw new Error(`Non-public player input: ${rel}`);
    }
  },
}] });
const zip = new JSZip();
const stamp = new Date('2026-01-01T00:00:00Z');
const add = async (path, name = path) => zip.file(name, await readFile(join(root, path)), { date: stamp });
// Full public source supplies erased type-only imports and editable rebuild inputs as well as the graph.
async function addSource(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Source archive does not follow symlinks');
    if (entry.isDirectory()) await addSource(path);
    else if (/\.(?:ts|tsx|js|mjs|json|css|svg|md|txt|d\.ts)$/.test(path)) await add(path);
  }
}
await addSource('src');
for (const path of sourceFiles) if (!zip.file(path)) await add(path);
for (const path of ['package.json', 'package-lock.json', 'tsconfig.json', 'LICENSE', 'vite.demo-player.config.ts', 'scripts/build-demo-player.mjs']) await add(path);
for (const name of [...dependencies].sort()) {
  for (const entry of await readdir(join(root, 'node_modules', name), { withFileTypes: true })) {
    if (entry.isFile() && /^(?:license|licence|copying|notice)(?:\.|$)/i.test(entry.name)) await add(`node_modules/${name}/${entry.name}`, `third-party/${name}/${entry.name}`);
  }
}
let revision = 'source-archive';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()) revision += '-dirty';
} catch { /* Source archive can rebuild without Git. */ }
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
zip.file('README-DEMO.txt', `XYvirtual WEB demo player ${version}\nBase revision: ${revision}\nThis archive contains the actual public source used for this build, including local edits.\nRebuild with Node 22+: npm ci --ignore-scripts; node scripts/build-demo-player.mjs\nOutput: dist/demo-player/. No private repository, model data or credentials are needed.\nAGPL-3.0-only: see LICENSE; dependency notices: third-party/.\n`, { date: stamp });
const source = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
const player = await readFile(join(output, 'demo-player.js'));
if (player.length > 16 * 1024 * 1024 || source.length > 32 * 1024 * 1024) throw new Error('Demo artifacts exceed contract limits');
await writeFile(join(output, 'demo-player-source.zip'), source);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await writeFile(join(output, 'demo-player.json'), JSON.stringify({ schemaVersion: 1, version, revision, sha256: hash(player), sourceSha256: hash(source) }, null, 2) + '\n');
console.log(`Demo player: ${player.length} bytes; public source: ${source.length} bytes`);
