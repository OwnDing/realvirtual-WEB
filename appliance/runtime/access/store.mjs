// SPDX-License-Identifier: AGPL-3.0-only
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const id = () => randomBytes(16).toString('hex');
export class AccessError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export function requireValue(condition, status, code) {
  if (!condition) throw new AccessError(status, code);
}

// OWASP scrypt profile: N=2^14, r=8, p=5; bounded concurrent work in HTTP layer.
const derive = promisify(scrypt);
const params = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
export async function hashPassword(password) {
  requireValue(typeof password === 'string' && password.length >= 12 && Buffer.byteLength(password) <= 256, 422, 'PASSWORD_POLICY');
  const salt = randomBytes(16).toString('hex');
  return `scrypt1:${salt}:${(await derive(password, salt, 32, params)).toString('hex')}`;
}
export async function checkPassword(password, encoded) {
  const [, salt, hash] = (encoded ?? `scrypt1:${'0'.repeat(32)}:${'0'.repeat(64)}`).split(':');
  const actual = await derive(password, salt, 32, params);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class AccessStore {
  constructor(root, { now = Date.now, retentionDays = 90 } = {}) {
    this.root = root;
    this.now = now;
    this.retentionDays = retentionDays;
    mkdirSync(join(root, 'blobs'), { recursive: true, mode: 0o700 });
    const path = join(root, 'access.sqlite');
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('Unsupported access database version'); }
    if (version === 0) this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','visitor')), disabled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE presentations (id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, operation TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE shares (id TEXT PRIMARY KEY, presentation TEXT NOT NULL REFERENCES presentations(id), token TEXT NOT NULL, user TEXT REFERENCES users(id), expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user TEXT REFERENCES users(id), share TEXT REFERENCES shares(id), csrf TEXT NOT NULL, visitor TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE audit (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, outcome TEXT NOT NULL);
      CREATE INDEX audit_time ON audit(time); CREATE INDEX sessions_expiry ON sessions(expires);
      PRAGMA user_version=1; COMMIT;`);
    this.prune();
  }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(actor, action, target = '', outcome = 'ok') {
    this.run('INSERT INTO audit(time,actor,action,target,outcome) VALUES(?,?,?,?,?)', this.now(), actor, action, target, outcome);
  }
  prune() {
    this.run('DELETE FROM sessions WHERE expires<=?', this.now());
    this.run('DELETE FROM audit WHERE time<?', this.now() - this.retentionDays * 86400000);
  }
  session(raw) {
    const session = raw && this.get(`SELECT s.*,u.username,u.role,u.disabled FROM sessions s LEFT JOIN users u ON s.user=u.id WHERE s.token=?`, digest(raw));
    requireValue(session && session.expires > this.now() && !session.disabled, 401, 'UNAUTHENTICATED');
    if (session.share) this.share(session.share, session);
    return session;
  }
  share(shareId, session) {
    const share = this.get('SELECT s.*,p.name,p.size,p.sha256 FROM shares s JOIN presentations p ON p.id=s.presentation WHERE s.id=?', shareId);
    requireValue(share && session.share === shareId, 404, 'NOT_FOUND');
    requireValue(!share.revoked && share.expires > this.now(), 410, 'SHARE_UNAVAILABLE');
    requireValue(!share.user || share.user === session.user, 403, 'FORBIDDEN');
    return share;
  }
  mintSession(user = null, share = null, expires = this.now() + 8 * 3600000) {
    const token = randomToken();
    const session = { token, user, share, csrf: randomToken(), visitor: id().slice(0, 12), expires: Math.min(expires, this.now() + 8 * 3600000) };
    this.run('INSERT INTO sessions(token,user,share,csrf,visitor,expires) VALUES(?,?,?,?,?,?)', digest(token), user, share, session.csrf, session.visitor, session.expires);
    return session;
  }
  async createUser(username, password, role, actor = 'local-cli', authorize = () => {}) {
    requireValue(typeof username === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username) && ['admin', 'visitor'].includes(role), 422, 'INVALID_USER');
    const normalized = username.toLowerCase();
    requireValue(!this.get('SELECT id FROM users WHERE username=?', normalized), 409, 'USER_EXISTS');
    const encoded = await hashPassword(password);
    return this.transaction(() => {
      authorize();
      requireValue(!this.get('SELECT id FROM users WHERE username=?', normalized), 409, 'USER_EXISTS');
      const userId = id();
      this.run('INSERT INTO users(id,username,password,role) VALUES(?,?,?,?)', userId, normalized, encoded, role);
      this.audit(actor, 'user.create', userId);
      return { id: userId, username: normalized, role, disabled: 0 };
    });
  }
  invalidateRestoredShares() {
    this.transaction(() => {
      this.run('DELETE FROM sessions'); this.run('UPDATE shares SET revoked=1');
      this.audit('local-cli', 'restore.invalidate');
    });
  }
  close() { this.db.close(); }
}
