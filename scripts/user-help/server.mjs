// SPDX-License-Identifier: AGPL-3.0-only
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { offlineProfile } from '../offline-profile.mjs';
export async function helpTestServer(dist = 'dist') {
  const root = resolve(dist), base = '/training/', requests = [];
  const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.glb':'model/gltf-binary', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.webm':'video/webm', '.vtt':'text/vtt' };
  let origin;
  const server = createServer(async (req,res) => {
    try {
      const url = new URL(req.url, origin); requests.push(url.pathname);
      if (!url.pathname.startsWith(base)) { res.writeHead(404).end(); return; }
      let path = decodeURIComponent(url.pathname.slice(base.length)); if (!path || path.endsWith('/')) path += 'index.html';
      const file = resolve(root,path); if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      let bytes = await readFile(file);
      if (path === 'settings.json') { const config=offlineProfile(JSON.parse(bytes)); config.services={...config.services,documentation:{baseUrl:origin+base+'user-help/'}}; config.defaults={...config.defaults,locale:'en-US'}; bytes=Buffer.from(JSON.stringify(config)); }
      res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
      if (req.headers.range) {
        const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range); if (!match) { res.writeHead(416).end(); return; }
        const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):bytes.length-1,bytes.length-1);
        if(start>end){res.writeHead(416).end();return;}res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.statusCode=206;bytes=bytes.subarray(start,end+1);
      }
      res.setHeader('Content-Length',bytes.length);res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);}); origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,base,url:origin+base,requests,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
