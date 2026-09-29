// SPDX-License-Identifier: AGPL-3.0-only
// Real production payload + Node + Caddy HTTPS. Only test-created resources are removed.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, expect } from 'playwright/test';
import { createControlServer } from '../appliance/runtime/control-plane.mjs';
import { AccessStore } from '../appliance/runtime/access/store.mjs';
import { renderTemplate } from '../appliance/runtime/lib/config.mjs';

const root = await mkdtemp(join(tmpdir(), 'rv-access-e2e-'));
const artifacts = resolve('test-results/access'); await mkdir(artifacts, { recursive: true });
const containerName = `rv-access-test-${process.pid}`;
const image = process.env.RV_ACCESS_CADDY_IMAGE ?? 'caddy:2.11.4-alpine';
const unusedPort = async () => {
  const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
};
const httpsPort = await unusedPort(), httpPort = await unusedPort(), origin = `https://127.0.0.1:${httpsPort}`;
let control, caddy, browser;
const failures = [];
const run = (args, options = {}) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`Docker test command failed: ${result.stderr}`);
  return result.stdout.trim();
};
function model() {
  const binary = Buffer.alloc(36);
  [-1,0,0, 1,0,0, 0,2,0].forEach((v,i) => binary.writeFloatLE(v, i*4));
  const metadata = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'ProtectedTriangle', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.2,0.7,1,1], metallicFactor: 0 } }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1,0,0], max: [1,2,0] }] };
  const text = Buffer.from(JSON.stringify(metadata)), json = Buffer.alloc(Math.ceil(text.length/4)*4, 32); text.copy(json);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+binary.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,binary]);
}
try {
  await readFile(resolve('dist/present/index.html'));
  const dataRoot = join(root, 'data');
  const store = new AccessStore(dataRoot); await store.createUser('admin', 'test-only-password-2026', 'admin'); store.close();
  control = createControlServer({ schemaVersion: 1, version: 'test', installId: '12345678-1234-1234-1234-123456789abc', bundleRoot: root, services: [], access: { root: dataRoot, origin } });
  await new Promise(r => control.listen(0, '127.0.0.1', r));
  const upstream = `127.0.0.1:${control.address().port}`;
  const passwordHash = run(['run','--rm','--network','none','-i',image,'caddy','hash-password','--algorithm','argon2id'], { input: 'test-operator-password\n' });
  let config = renderTemplate(await readFile(resolve('appliance/config/Caddyfile.template'),'utf8'), {
    HOSTNAME: '127.0.0.1', INFLUX_HOSTNAME: 'localhost', LISTEN_HTTP_PORT: httpPort, LISTEN_HTTPS_PORT: httpsPort, HTTPS_PORT_SUFFIX: `:${httpsPort}`,
    TLS_DIRECTIVE: 'tls internal', OPERATOR_USER: 'operator', OPERATOR_PASSWORD_HASH: passwordHash,
    CONTROL_UPSTREAM: upstream, CONNECT_UPSTREAM: upstream, FORGEJO_UPSTREAM: upstream, INFLUX_UPSTREAM: upstream,
    WEB_ROOT: '/web', PRESENT_ROOT: '/web/present', LICENSE_ROOT: '/license',
  });
  config = config.replace('admin 127.0.0.1:2019', 'admin off\n\tdefault_bind 127.0.0.1');
  await writeFile(join(root,'Caddyfile'),config);
  caddy = spawn('docker', ['run','--rm','--name',containerName,'--network','host','--tmpfs','/data','--tmpfs','/config','-v',`${join(root,'Caddyfile')}:/etc/caddy/Caddyfile:ro`,'-v',`${resolve('dist')}:/web:ro`,image,'caddy','run','--config','/etc/caddy/Caddyfile'], { stdio: ['ignore','pipe','pipe'] });
  let caddyLogs = ''; caddy.stdout.on('data', b => { caddyLogs += b; }); caddy.stderr.on('data', b => { caddyLogs += b; });
  browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const admin = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1000 } });
  await expect.poll(async () => { try { return (await admin.request.get(origin+'/present/')).status(); } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  const page = await admin.newPage();
  page.on('pageerror', e => failures.push(e.message));
  page.on('response', async r => { if(r.status() >= 400 && new URL(r.url()).pathname.startsWith('/api/access/')) console.log('API failure',r.status(),new URL(r.url()).pathname,await r.text().catch(()=>'')); });
  await page.goto(origin+'/present/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password (at least 12 characters)', { exact: true }).fill('test-only-password-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading',{name:'Presentation management'})).toBeVisible();
  await page.getByLabel('Presentation name',{exact:true}).fill('Protected fixture');
  await page.getByLabel('Self-contained GLB file',{exact:true}).setInputFiles({ name: 'fixture.glb', mimeType:'model/gltf-binary', buffer:model() });
  await page.getByRole('button',{name:'Publish presentation',exact:true}).click();
  await expect(page.getByRole('option',{name:'Protected fixture'})).toBeAttached({timeout:15000});
  await page.getByLabel('Choose a presentation',{exact:true}).selectOption({label:'Protected fixture'});
  await page.getByRole('button',{name:'Create link',exact:true}).click();
  await expect(page.getByLabel('Share link',{exact:true})).toBeVisible();
  const link = await page.getByLabel('Share link',{exact:true}).inputValue();
  const shareId = new URLSearchParams(new URL(link).hash.slice(1)).get('share');
  const guest = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},acceptDownloads:true});
  const view = await guest.newPage();
  view.on('pageerror',e=>failures.push(e.message));
  const origins = new Set(); view.on('request', req => { if (/^https?:/.test(req.url())) origins.add(new URL(req.url()).origin); });
  await view.addInitScript(() => { localStorage.setItem('rv-login-auth','1'); });
  assert.equal((await guest.request.get(origin+`/api/access/v1/shares/${shareId}/model`)).status(),401);
  await view.goto(link);
  await expect(view.locator('.watermark')).toContainText('Protected fixture',{timeout:30000});
  await expect(view.getByRole('button',{name:'保存带水印截图'})).toBeEnabled({timeout:60000});
  assert.equal(new URL(view.url()).hash,'');
  assert.equal(await view.evaluate(()=>document.cookie.includes('__Host-rv-access')),false);
  for(const path of ['/settings.json','/models.json','/connect/health','/mcp','/git/','/api/v2/buckets','/appliance/api/info','/present/../settings.json']) assert.equal((await guest.request.get(origin+path)).status(),401,path);
  for(const path of ['/present/settings.json','/present/models.json','/present/access.sqlite','/present/%252e%252e/settings.json']) assert.equal((await guest.request.get(origin+path)).status(),404,path);
  assert.equal((await guest.request.get(origin+`/api/access/v1/shares/${shareId}/model`,{headers:{Range:'bytes=0-3'}})).status(),206);
  assert.equal((await guest.request.get(origin+'/api/access/v1/users')).status(),403);
  const downloadEvent = view.waitForEvent('download'); await view.getByRole('button',{name:'保存带水印截图'}).click(); const download = await downloadEvent; await download.saveAs(join(artifacts,'watermarked.png'));
  await view.screenshot({path:join(artifacts,'visitor.png')});
  await page.getByRole('button',{name:'Revoke',exact:true}).click();
  await expect(page.getByRole('cell',{name:'Revoked',exact:true})).toBeVisible();
  assert.equal((await guest.request.get(origin+`/api/access/v1/shares/${shareId}/model`)).status(),410);
  await expect(view.locator('.viewport')).toHaveCount(0,{timeout:20000});
  await expect(view.getByRole('alert')).toBeVisible();

  // Designated-account flow, refresh recovery, and a network failure after loading.
  await page.getByLabel('Username',{exact:true}).fill('customer');
  await page.locator('form').filter({has:page.getByRole('button',{name:'Create visitor',exact:true})}).getByLabel('Password (at least 12 characters)',{exact:true}).fill('customer-test-password');
  await page.getByRole('button',{name:'Create visitor',exact:true}).click();
  await expect(page.getByRole('option',{name:'customer',exact:true})).toBeAttached();
  await page.getByLabel('Recipient',{exact:true}).selectOption({label:'customer'});
  await page.getByRole('button',{name:'Create link',exact:true}).click();
  await expect(page.getByLabel('Share link',{exact:true})).not.toHaveValue(link);
  const accountLink = await page.getByLabel('Share link',{exact:true}).inputValue();
  await view.goto(accountLink);
  await view.getByRole('button',{name:'English',exact:true}).click();
  await view.getByLabel('Username',{exact:true}).fill('customer');
  await view.getByLabel('Password (at least 12 characters)',{exact:true}).fill('customer-test-password');
  await view.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(view.locator('.watermark')).toContainText('Account customer');
  await expect(view.getByRole('button',{name:'Save watermarked image'})).toBeEnabled({timeout:30000});
  await view.reload();
  await expect(view.getByRole('button',{name:'Save watermarked image'})).toBeEnabled({timeout:30000});
  await view.route('**/api/access/v1/shares/**',route=>route.abort('failed'));
  await expect(view.locator('.viewport')).toHaveCount(0,{timeout:20000});
  await expect(view.getByRole('alert')).toContainText('presentation was cleared');
  assert.deepEqual([...origins],[origin]); assert.deepEqual(failures,[]);
  await page.screenshot({path:join(artifacts,'admin.png')});
  await writeFile(join(artifacts,'result.json'),JSON.stringify({passed:true,checks:['publish','cookie-httpOnly','localStorage-bypass-denied','scope','operator-isolation','range','watermarked-screenshot','revoke-existing-session','visitor-cleared','designated-account','refresh-session','network-failure-clears','same-origin-only'],engine:'RVEmbedViewer',edge:image},null,2));
  await writeFile(join(artifacts,'caddy.log'),caddyLogs);
  console.log('Protected presentations: real Caddy HTTPS + Node + Chromium journey passed.');
} catch(error) {
  if(browser) for(const context of browser.contexts()) for(const page of context.pages()) {
    await page.screenshot({path:join(artifacts,'failure.png')}).catch(()=>{});
  }
  await writeFile(join(artifacts,'failure.txt'),String(error.stack??error));
  throw error;
} finally {
  if(browser)await browser.close();
  if(caddy){spawnSync('docker',['stop','--time','2',containerName],{stdio:'ignore'});}
  if(control)await new Promise(r=>control.close(r));
  await rm(root,{recursive:true,force:true});
}
