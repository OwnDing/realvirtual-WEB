// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AccessStore, AccessError, requireValue, id, randomToken, digest, checkPassword, hashPassword } from './store.mjs';
import { validatePresentationGlb } from './glb.mjs';

const ROOT = '/api/access/v1';
const COOKIE = '__Host-rv-access';
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (res, status, value) => { res.writeHead(status, headers); res.end(JSON.stringify(value)); };
const cookie = (req) => /(?:^|;\s*)__Host-rv-access=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
function setSession(res, session) {
  res.setHeader('Set-Cookie', `${COOKIE}=${session?.token ?? ''}; Path=/; Secure; HttpOnly; SameSite=Strict${session ? '' : '; Max-Age=0'}`);
}
async function body(req, limit, asJson = true) {
  requireValue(!req.headers['content-encoding'], 415, 'UNSUPPORTED_ENCODING');
  if (asJson) requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', 415, 'JSON_REQUIRED');
  if (Number(req.headers['content-length'] ?? 0) > limit) { req.resume(); throw new AccessError(413, 'TOO_LARGE'); }
  const data = await new Promise((resolve, reject) => {
    const chunks = []; let length = 0;
    const cleanup = () => { req.off('data', receive); req.off('end', end); req.off('error', fail); req.off('aborted', aborted); };
    const fail = error => { cleanup(); reject(error); };
    const aborted = () => fail(new AccessError(400, 'UPLOAD_ABORTED'));
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const receive = chunk => {
      length += chunk.length;
      if (length > limit) { cleanup(); req.resume(); reject(new AccessError(413, 'TOO_LARGE')); return; }
      chunks.push(chunk);
    };
    req.on('data', receive); req.on('end', end); req.on('error', fail); req.on('aborted', aborted);
  });
  if (!asJson) return data;
  try {
    const value = JSON.parse(data.toString('utf8'));
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 400, 'BAD_JSON');
    return value;
  } catch { throw new AccessError(400, 'BAD_JSON'); }
}
export function createAccessHandler(config, dependencies = {}) {
  const origin = new URL(config.origin);
  requireValue(origin.protocol === 'https:' && origin.origin === config.origin, 500, 'INVALID_ACCESS_ORIGIN');
  const maxBytes = config.maxBytes ?? 128 * 1024 * 1024;
  const quotaBytes = config.quotaBytes ?? 2 * 1024 * 1024 * 1024;
  requireValue(Number.isSafeInteger(maxBytes) && maxBytes > 0 && Number.isSafeInteger(quotaBytes) && quotaBytes >= maxBytes && Number.isInteger(config.retentionDays ?? 90) && (config.retentionDays ?? 90) > 0, 500, 'INVALID_ACCESS_LIMITS');
  const store = dependencies.store ?? new AccessStore(config.root, { retentionDays: config.retentionDays ?? 90 });
  const rates = new Map(); let hashing = 0; let uploading = false;
  let lastPrune = store.now();
  const rate = (key, maximum) => {
    const now = store.now();
    for (const [k, v] of rates) if (now - v.start > 300000) rates.delete(k);
    requireValue(rates.size < 2048 || rates.has(key), 429, 'RATE_LIMITED');
    const value = rates.get(key) ?? { start: now, count: 0 };
    rates.set(key, value); value.count++;
    requireValue(value.count <= maximum, 429, 'RATE_LIMITED');
  };
  const boundedHash = async (fn) => {
    requireValue(hashing < 4, 429, 'RATE_LIMITED'); hashing++;
    try { return await fn(); } finally { hashing--; }
  };
  async function handle(req, res) {
    if (!(req.url === ROOT || req.url?.startsWith(`${ROOT}/`) || req.url?.startsWith(`${ROOT}?`))) return false;
    let actor = 'anonymous';
    try {
      // Do not normalize untrusted paths into valid endpoints.
      requireValue(!/[%\\]/.test(req.url.split('?')[0]) && !req.url.split('?')[0].split('/').some(p => p === '.' || p === '..'), 404, 'NOT_FOUND');
      const url = new URL(req.url, config.origin);
      const path = url.pathname.slice(ROOT.length);
      const method = req.method;
      if (store.now() - lastPrune > 60000) { store.prune(); lastPrune = store.now(); }
      requireValue(['GET', 'HEAD', 'POST', 'PATCH'].includes(method), 405, 'METHOD_NOT_ALLOWED');
      const write = method === 'POST' || method === 'PATCH';
      if (write) requireValue(req.headers.origin === config.origin, 403, 'ORIGIN_DENIED');
      if (path === '/login' && method === 'POST') {
        rate('login:global', 100);
        const input = await body(req, 16384);
        requireValue(typeof input.username === 'string' && input.username.length <= 64 && typeof input.password === 'string' && Buffer.byteLength(input.password) <= 256, 401, 'UNAUTHENTICATED');
        rate(`login:${digest(input.username.toLowerCase())}`, 10);
        const user = store.get('SELECT * FROM users WHERE username=?', input.username.toLowerCase());
        const good = await boundedHash(() => checkPassword(input.password, user?.password));
        const current = user && store.get('SELECT password,disabled FROM users WHERE id=?', user.id);
        if (!good || !current || current.disabled || current.password !== user.password) { store.audit('anonymous', 'login', '', 'denied'); throw new AccessError(401, 'UNAUTHENTICATED'); }
        const session = store.transaction(() => {
          if (cookie(req)) store.run('DELETE FROM sessions WHERE token=?', digest(cookie(req)));
          store.audit(user.id, 'login'); return store.mintSession(user.id);
        });
        setSession(res, session); json(res, 200, { csrf: session.csrf }); return true;
      }
      if (path === '/redeem' && method === 'POST') {
        rate('redeem:global', 200);
        const input = await body(req, 16384);
        requireValue(typeof input.id === 'string' && /^[a-f0-9]{32}$/.test(input.id) && typeof input.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.token), 404, 'NOT_FOUND');
        const share = store.get('SELECT * FROM shares WHERE id=? AND token=?', input.id, digest(input.token));
        requireValue(share, 404, 'NOT_FOUND');
        requireValue(!share.revoked && share.expires > store.now(), 410, 'SHARE_UNAVAILABLE');
        let user = null;
        if (share.user) { user = store.session(cookie(req)).user; requireValue(user === share.user, 403, 'FORBIDDEN'); }
        const session = store.transaction(() => {
          const created = store.mintSession(user, share.id, share.expires);
          if (cookie(req)) store.run('DELETE FROM sessions WHERE token=?', digest(cookie(req)));
          store.audit(user ?? created.visitor, 'share.redeem', share.id); return created;
        });
        setSession(res, session); json(res, 200, { csrf: session.csrf, shareId: share.id }); return true;
      }
      const session = store.session(cookie(req));
      actor = session.user ?? session.visitor;
      if (write) requireValue(req.headers['x-csrf-token'] === session.csrf, 403, 'CSRF_DENIED');
      if (path === '/session' && method === 'GET') {
        json(res, 200, { username: session.username ?? null, role: session.share ? 'visitor' : session.role, shareId: session.share, csrf: session.csrf, expiresAt: session.expires }); return true;
      }
      if (path === '/logout' && method === 'POST') {
        store.transaction(() => { store.run('DELETE FROM sessions WHERE token=?', session.token); store.audit(actor, 'logout'); });
        setSession(res, null); json(res, 200, { loggedOut: true }); return true;
      }
      const resource = /^\/shares\/([a-f0-9]{32})(\/model)?$/.exec(path);
      if (resource && (method === 'GET' || method === 'HEAD')) {
        const share = store.share(resource[1], session);
        if (!resource[2]) {
          json(res, 200, { id: share.id, name: share.name, expiresAt: share.expires, serverTime: store.now(), visitor: session.username ?? session.visitor, identity: session.user ? 'account' : 'link', size: share.size }); return true;
        }
        const bytes = await readFile(join(store.root, 'blobs', `${share.presentation}.glb`));
        // Recheck after async I/O; revoke/expiry/disable may have occurred meanwhile.
        store.share(share.id, store.session(cookie(req)));
        requireValue(bytes.length === share.size && digest(bytes) === share.sha256, 503, 'RESOURCE_UNAVAILABLE');
        let start = 0, end = bytes.length - 1, status = 200;
        if (req.headers.range) {
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          requireValue(range && (range[1] || range[2]), 416, 'INVALID_RANGE');
          start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
          end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
          requireValue(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < bytes.length, 416, 'INVALID_RANGE');
          status = 206;
        }
        store.audit(actor, 'resource.read', share.id, method === 'HEAD' ? 'head' : 'delivered');
        res.writeHead(status, { ...headers, 'content-type': 'model/gltf-binary', 'content-length': end - start + 1, 'accept-ranges': 'bytes', ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}) });
        res.end(method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return true;
      }
      requireValue(session.role === 'admin' && !session.share, 403, 'FORBIDDEN');
      if (path === '/users' && method === 'GET') { json(res, 200, store.all('SELECT id,username,role,disabled FROM users ORDER BY username')); return true; }
      if (path === '/users' && method === 'POST') {
        const input = await body(req, 16384);
        store.session(cookie(req));
        const user = await boundedHash(() => store.createUser(input.username, input.password, input.role ?? 'visitor', actor, () => store.session(cookie(req))));
        json(res, 201, user); return true;
      }
      const userPath = /^\/users\/([a-f0-9]{32})$/.exec(path);
      if (userPath && method === 'PATCH') {
        const input = await body(req, 16384);
        store.session(cookie(req));
        const target = store.get('SELECT * FROM users WHERE id=?', userPath[1]);
        requireValue(target, 404, 'NOT_FOUND');
        requireValue(input.disabled === undefined || typeof input.disabled === 'boolean', 422, 'INVALID_USER');
        requireValue(input.password !== undefined || input.disabled !== undefined, 422, 'INVALID_USER');
        const password = input.password === undefined ? undefined : await boundedHash(() => hashPassword(input.password));
        store.session(cookie(req));
        store.transaction(() => {
          // Hashing yields: preserve concurrent updates to fields absent from this request.
          const current = store.get('SELECT * FROM users WHERE id=?', target.id);
          if (input.disabled && current.role === 'admin' && !current.disabled) requireValue(store.get("SELECT count(*) AS n FROM users WHERE role='admin' AND disabled=0").n > 1, 409, 'LAST_ADMIN');
          store.run('UPDATE users SET password=?,disabled=? WHERE id=?', password ?? current.password, input.disabled === undefined ? current.disabled : Number(input.disabled), target.id);
          store.run('DELETE FROM sessions WHERE user=?', target.id); store.audit(actor, 'user.update', target.id);
        });
        json(res, 200, { id: target.id, updated: true }); return true;
      }
      if (path === '/presentations' && method === 'GET') { json(res, 200, store.all('SELECT * FROM presentations ORDER BY created DESC')); return true; }
      if (path === '/presentations' && method === 'POST') {
        requireValue(!uploading, 429, 'UPLOAD_BUSY'); uploading = true;
        let temporary, finalPath, committed = false;
        try {
          const operation = req.headers['idempotency-key'];
          requireValue(typeof operation === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(operation), 400, 'OPERATION_ID_REQUIRED');
          const name = url.searchParams.get('name');
          requireValue(name && name.length <= 160 && !/[\u0000-\u001f]/.test(name), 422, 'INVALID_NAME');
          requireValue(req.headers['content-type'] === 'model/gltf-binary', 415, 'GLB_REQUIRED');
          const bytes = await body(req, maxBytes, false);
          store.session(cookie(req));
          const hash = digest(bytes);
          const existing = store.get('SELECT * FROM presentations WHERE operation=?', operation);
          if (existing) { requireValue(existing.sha256 === hash && existing.name === name, 409, 'OPERATION_CONFLICT'); json(res, 200, existing); return true; }
          validatePresentationGlb(bytes);
          requireValue(store.get('SELECT coalesce(sum(size),0) AS size FROM presentations').size + bytes.length <= quotaBytes, 413, 'QUOTA_EXCEEDED');
          const presentation = { id: id(), name, size: bytes.length, sha256: hash, operation, created: store.now() };
          temporary = join(store.root, 'blobs', `${presentation.id}.pending`);
          const file = await open(temporary, 'wx', 0o600);
          try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
          finalPath = join(store.root, 'blobs', `${presentation.id}.glb`);
          await rename(temporary, finalPath); temporary = null;
          store.session(cookie(req));
          store.transaction(() => {
            store.run('INSERT INTO presentations(id,name,size,sha256,operation,created) VALUES(?,?,?,?,?,?)', presentation.id, name, bytes.length, hash, operation, presentation.created);
            store.audit(actor, 'presentation.publish', presentation.id);
          });
          committed = true;
          json(res, 201, presentation); return true;
        } finally { uploading = false; if (temporary) await unlink(temporary).catch(() => {}); if (finalPath && !committed) await unlink(finalPath).catch(() => {}); }
      }
      if (path === '/shares' && method === 'GET') { json(res, 200, store.all('SELECT id,presentation,user,expires,revoked,created FROM shares ORDER BY created DESC')); return true; }
      if (path === '/shares' && method === 'POST') {
        const input = await body(req, 16384);
        store.session(cookie(req));
        requireValue(typeof input.presentationId === 'string' && store.get('SELECT id FROM presentations WHERE id=?', input.presentationId), 404, 'NOT_FOUND');
        const expires = input.expiresAt ?? store.now() + 7 * 86400000;
        requireValue(Number.isSafeInteger(expires) && expires > store.now() && expires <= store.now() + 90 * 86400000, 422, 'INVALID_EXPIRY');
        const user = input.userId ?? null;
        if (user !== null) requireValue(typeof user === 'string' && store.get('SELECT id FROM users WHERE id=? AND disabled=0', user), 422, 'INVALID_USER');
        const shareId = id(), token = randomToken();
        store.transaction(() => {
          store.run('INSERT INTO shares(id,presentation,token,user,expires,created) VALUES(?,?,?,?,?,?)', shareId, input.presentationId, digest(token), user, expires, store.now());
          store.audit(actor, 'share.create', shareId);
        });
        json(res, 201, { id: shareId, expiresAt: expires, url: `${config.origin}/present/#share=${shareId}&token=${token}` }); return true;
      }
      const revoke = /^\/shares\/([a-f0-9]{32})\/revoke$/.exec(path);
      if (revoke && method === 'POST') {
        store.transaction(() => {
          requireValue(store.get('SELECT id FROM shares WHERE id=?', revoke[1]), 404, 'NOT_FOUND');
          store.run('UPDATE shares SET revoked=1 WHERE id=?', revoke[1]); store.audit(actor, 'share.revoke', revoke[1]);
        });
        json(res, 200, { id: revoke[1], revoked: true }); return true;
      }
      if (path === '/audit' && method === 'GET') {
        const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
        requireValue(Number.isSafeInteger(before) && before > 0, 400, 'BAD_CURSOR');
        store.prune(); json(res, 200, store.all('SELECT * FROM audit WHERE id<? ORDER BY id DESC LIMIT 100', before)); return true;
      }
      throw new AccessError(404, 'NOT_FOUND');
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 503;
      const code = error instanceof AccessError ? error.code : 'ACCESS_UNAVAILABLE';
      try { store.audit(actor, 'request.denied', '', code); } catch { /* A broken database must still deny. */ }
      if (!res.headersSent) json(res, status, { error: { code } }); else res.destroy();
      return true;
    }
  }
  return { handle, store, close: () => store.close() };
}
