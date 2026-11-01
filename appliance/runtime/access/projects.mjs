// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Server-side projects (ADR-0024): /api/projects/v1 on the Appliance control plane.
 *
 * Forgejo holds one repository per project (owner = the Appliance's built-in
 * `appliance` account); every save is one commit authored by the signed-in user.
 * The Forgejo token never leaves this process. The access session decides:
 * viewer and above read, engineer and above write (Origin + CSRF required).
 * A file's Forgejo blob SHA is its revision; a stale base revision is a 409.
 */
import { readFileSync } from 'node:fs';
import { AccessError, requireValue, roleAtLeast } from './store.mjs';
import { body, cookie } from './http.mjs';

const ROOT = '/api/projects/v1';
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,127}$/;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const json = (res, status, value) => { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(value)); };

/** Validate a project-relative file path; returns its segments. */
export function projectPath(raw) {
  requireValue(typeof raw === 'string' && raw.length > 0 && raw.length <= 512, 400, 'BAD_PATH');
  const segments = raw.split('/');
  requireValue(segments.length <= 8 && segments.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..'), 400, 'BAD_PATH');
  return segments;
}

export function createProjectsHandler(config, dependencies) {
  const { store, origin } = dependencies;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const forgejo = String(config.forgejoUrl).replace(/\/$/, '');
  const owner = config.owner;
  let token = null;
  const serviceToken = () => {
    if (token) return token;
    try { token = readFileSync(config.tokenFile, 'utf8').trim() || null; } catch { token = null; }
    requireValue(token, 503, 'PROJECTS_UNAVAILABLE');
    return token;
  };
  const api = async (path, init = {}) => {
    const response = await fetchImpl(`${forgejo}/api/v1${path}`, {
      ...init,
      headers: { authorization: `token ${serviceToken()}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => { throw new AccessError(502, 'FORGEJO_UNREACHABLE'); });
    const text = await response.text();
    let value = null;
    try { value = text ? JSON.parse(text) : null; } catch { value = null; }
    return { status: response.status, value };
  };
  const repoPath = (id, rest = '') => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(id)}${rest}`;
  const contentsPath = (id, segments) => repoPath(id, `/contents/${segments.map(encodeURIComponent).join('/')}`);
  const author = (session) => ({ name: session.username, email: `${session.username}@users.xyvirtual.invalid` });

  async function handle(req, res) {
    const rawUrl = req.url ?? '';
    if (!(rawUrl === ROOT || rawUrl.startsWith(`${ROOT}/`) || rawUrl.startsWith(`${ROOT}?`))) return false;
    try {
      serviceToken();
      // Never decode untrusted percent-escapes into a path (`%2e%2e` stays an error).
      const pathname = rawUrl.split('?')[0];
      requireValue(!/[%\\]/.test(pathname), 400, 'BAD_PATH');
      const path = pathname.slice(ROOT.length);
      const method = req.method;
      const session = store.session(cookie(req));
      requireValue(!session.share && roleAtLeast(session.role, 'viewer'), 403, 'FORBIDDEN');
      const write = method !== 'GET' && method !== 'HEAD';
      if (write) {
        requireValue(req.headers.origin === origin, 403, 'ORIGIN_DENIED');
        requireValue(req.headers['x-csrf-token'] === session.csrf, 403, 'CSRF_DENIED');
        requireValue(roleAtLeast(session.role, 'engineer'), 403, 'FORBIDDEN');
      }
      const actor = session.user;

      if (path === '/projects' && method === 'GET') {
        const { status, value } = await api('/user/repos?limit=50');
        requireValue(status === 200 && Array.isArray(value), 502, 'FORGEJO_FAILED');
        json(res, 200, value.filter((r) => PROJECT_ID.test(r.name)).map((r) => ({ id: r.name, name: r.description || r.name, updatedAt: r.updated_at ?? null })));
        return true;
      }
      if (path === '/projects' && method === 'POST') {
        const input = await body(req, 4096);
        requireValue(typeof input.id === 'string' && PROJECT_ID.test(input.id) && typeof input.name === 'string' && input.name.trim() && input.name.length <= 200, 422, 'INVALID_PROJECT');
        const { status } = await api('/user/repos', { method: 'POST', body: JSON.stringify({ name: input.id, description: input.name.trim(), private: true, auto_init: true, default_branch: 'main' }) });
        requireValue(status !== 409, 409, 'PROJECT_EXISTS');
        requireValue(status === 201, 502, 'FORGEJO_FAILED');
        store.audit(actor, 'project.create', input.id, 'ok', JSON.stringify({ name: input.name.trim() }));
        json(res, 201, { id: input.id, name: input.name.trim() });
        return true;
      }
      const match = /^\/projects\/([^/]+)(\/tree|\/files\/(.+))$/.exec(path);
      requireValue(match, 404, 'NOT_FOUND');
      const id = match[1];
      requireValue(PROJECT_ID.test(id), 400, 'BAD_PROJECT');
      if (match[2] === '/tree') {
        requireValue(method === 'GET', 405, 'METHOD_NOT_ALLOWED');
        const { status, value } = await api(repoPath(id, '/git/trees/main?recursive=true&per_page=10000'));
        if (status === 404) { json(res, 200, []); return true; } // empty repository: no branch yet
        requireValue(status === 200 && Array.isArray(value?.tree), 502, 'FORGEJO_FAILED');
        json(res, 200, value.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, size: e.size, revision: e.sha })));
        return true;
      }
      const segments = projectPath(match[3]);
      const file = segments.join('/');
      if (method === 'GET' || method === 'HEAD') {
        const { status, value } = await api(`${contentsPath(id, segments)}?ref=main`);
        requireValue(status !== 404, 404, 'NOT_FOUND');
        requireValue(status === 200 && value?.type === 'file' && typeof value.sha === 'string', 502, 'FORGEJO_FAILED');
        const bytes = Buffer.from(value.content ?? '', 'base64');
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-rv-revision': value.sha, 'content-length': bytes.length });
        res.end(method === 'HEAD' ? undefined : bytes);
        return true;
      }
      const base = req.headers['x-rv-base-revision'];
      requireValue(base === undefined || /^[0-9a-f]{40,64}$/.test(base), 400, 'BAD_REVISION');
      if (method === 'PUT') {
        const bytes = await body(req, MAX_FILE_BYTES, false);
        const payload = { content: bytes.toString('base64'), branch: 'main', message: `Save ${file} (${session.username})`, author: author(session), committer: author(session), ...(base ? { sha: base } : {}) };
        const { status, value } = await api(contentsPath(id, segments), { method: base ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        // Forgejo: 409 = sha mismatch, 422 = "file already exists" when creating.
        requireValue(status !== 409 && status !== 422, 409, 'REVISION_CONFLICT');
        requireValue(status !== 404, 404, 'NOT_FOUND');
        requireValue((status === 200 || status === 201) && typeof value?.content?.sha === 'string', 502, 'FORGEJO_FAILED');
        store.audit(actor, 'project.save', `${id}/${file}`, 'ok', JSON.stringify({ commit: value.commit?.sha ?? null, revision: value.content.sha, bytes: bytes.length }));
        json(res, base ? 200 : 201, { revision: value.content.sha, commit: value.commit?.sha ?? null });
        return true;
      }
      if (method === 'DELETE') {
        requireValue(base, 428, 'REVISION_REQUIRED');
        const { status, value } = await api(contentsPath(id, segments), { method: 'DELETE', body: JSON.stringify({ sha: base, branch: 'main', message: `Delete ${file} (${session.username})`, author: author(session), committer: author(session) }) });
        requireValue(status !== 409 && status !== 422, 409, 'REVISION_CONFLICT');
        requireValue(status !== 404, 404, 'NOT_FOUND');
        requireValue(status === 200, 502, 'FORGEJO_FAILED');
        store.audit(actor, 'project.delete', `${id}/${file}`, 'ok', JSON.stringify({ commit: value?.commit?.sha ?? null }));
        json(res, 200, { commit: value?.commit?.sha ?? null });
        return true;
      }
      throw new AccessError(405, 'METHOD_NOT_ALLOWED');
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 503;
      const code = error instanceof AccessError ? error.code : 'PROJECTS_UNAVAILABLE';
      if (!res.headersSent) json(res, status, { error: { code } }); else res.destroy();
      return true;
    }
  }
  return { handle };
}
