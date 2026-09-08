// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

/** Production bytes only; no Vite transform, proxy, source imports or SPA fallback. */
export async function startOfflineServer(distDir) {
  const root = resolve(distDir);
  const headers = JSON.parse(await readFile(resolve(root, 'deployment-headers.json'), 'utf8'));
  let configOverride;
  const hits = [];
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      hits.push(path);
      if (path === '/__offline/canary.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Network detector canary</title>');
        return;
      }
      if (path === '/__offline/worker.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end("fetch('http://127.0.0.3:54321/worker').catch(() => {}).finally(() => postMessage('started'));");
        return;
      }
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      res.setHeader('Cache-Control', 'no-store');
      if (path === '/__offline/strict-worker.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end("fetch('http://127.0.0.6:54321/worker').catch(() => {}).finally(() => postMessage('started'));");
        return;
      }
      if (path === '/__offline/redirect.glb') {
        res.writeHead(302, { Location: 'http://127.0.0.2:54321/redirected.glb' });
        res.end(); return;
      }
      if (path === '/__offline/external-buffer.gltf') {
        res.setHeader('Content-Type', 'model/gltf+json');
        res.end(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
          buffers: [{ uri: 'http://127.0.0.2:54321/vertices.bin', byteLength: 36 }],
          bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        })); return;
      }
      if (path === '/settings.json' && configOverride !== undefined) {
        if (configOverride === null) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', 'application/json'); res.end(configOverride); return;
      }
      const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    hits,
    setConfig(value) { configOverride = value; },
    async close() { server.closeAllConnections(); await new Promise((done) => server.close(done)); },
  };
}
