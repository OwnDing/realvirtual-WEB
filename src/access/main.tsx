// SPDX-License-Identifier: AGPL-3.0-only
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { initI18n, rvT, setLocale, useRvTranslation, getLocale } from '../core/i18n';
import { fetchWithEgress } from '../core/deployment/egress-io';
import { accessRequest, accessWrite, consumeAccessLink, accessRoot, AccessFailure, type AccessSession, type Presentation, type Share, type Visitor, type Audit, type ShareInfo } from './client';
import type { RVEmbedViewer } from '../embed/rv-embed-viewer';
import './style.css';

// Scrub secrets before importing the engine or starting any network request.
let pendingLink = consumeAccessLink();
initI18n();
type Key = keyof typeof import('../core/i18n/catalogs/zh-CN').zhCN.shell.access;
const t = (key: Key) => rvT('shell', `access.${key}`);
function errorText(error: unknown): string {
  const code = error instanceof AccessFailure ? error.code : '';
  if (code === 'UNAUTHENTICATED') return t('invalid');
  if (code === 'SHARE_UNAVAILABLE') return t('expired');
  if (['FORBIDDEN', 'CSRF_DENIED', 'ORIGIN_DENIED'].includes(code)) return t('forbidden');
  if (['RATE_LIMITED', 'UPLOAD_BUSY'].includes(code)) return t('rate');
  if (['EXTERNAL_DEPENDENCY', 'EXECUTABLE_CONTENT'].includes(code)) return t('dependency');
  if (['TOO_LARGE', 'QUOTA_EXCEEDED'].includes(code)) return t('large');
  if (code === 'INVALID_GLB') return t('badFile');
  return t('failed');
}
const date = (time: number) => new Date(time).toLocaleString(getLocale());

function App() {
  useRvTranslation('shell');
  const [session, setSession] = useState<AccessSession | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refreshSession = async () => {
    if (pendingLink) {
      await accessWrite('/redeem', pendingLink);
      pendingLink = null;
    }
    setSession(await accessRequest<AccessSession>('/session'));
  };
  useEffect(() => {
    document.title = t('title');
    // Following another share in this tab may be a fragment-only navigation.
    // Restart the flow so the previous viewer/session UI cannot consume the new link.
    const openLink = () => { if (new URLSearchParams(location.hash.slice(1)).has('share')) location.reload(); };
    window.addEventListener('hashchange', openLink);
    refreshSession().catch(e => { if (pendingLink || !(e instanceof AccessFailure) || e.code !== 'UNAUTHENTICATED') setError(errorText(e)); }).finally(() => setLoading(false));
    return () => window.removeEventListener('hashchange', openLink);
  }, []);
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try { await accessWrite('/login', { username: data.get('username'), password: data.get('password') }); await refreshSession(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true);
    try { await accessWrite('/logout', {}, session?.csrf); setSession(null); }
    catch (e) {
      if (e instanceof AccessFailure && ['UNAUTHENTICATED', 'SHARE_UNAVAILABLE'].includes(e.code)) setSession(null);
      else setError(errorText(e));
    } finally { setBusy(false); }
  };
  return <><header><strong>{t('title')}</strong><nav><button onClick={() => void setLocale(getLocale() === 'zh-CN' ? 'en-US' : 'zh-CN')}>{t('language')}</button>{session && <button disabled={busy} onClick={() => void logout()}>{t('logout')}</button>}</nav></header>
    {error && <p role="alert" className="error">{error}</p>}
    {loading ? <p role="status">{t('loading')}</p> : !session ? <main className="signin"><h1>{t('login')}</h1><p>{t('noLink')}</p><form onSubmit={login}><label>{t('username')}<input name="username" autoComplete="username" required maxLength={64}/></label><label>{t('password')}<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label><button disabled={busy}>{t('login')}</button></form></main>
      : session.shareId ? <Viewer shareId={session.shareId} onExpired={message => { setError(message); setSession(null); }}/>
      : session.role === 'admin' ? <Admin session={session} report={setError}/> : <p>{t('noLink')}</p>}
    <footer>{t('warning')}</footer></>;
}

function Admin({ session, report }: { session: AccessSession; report: (message: string) => void }) {
  const [presentations, setPresentations] = useState<Presentation[]>([]), [shares, setShares] = useState<Share[]>([]), [users, setUsers] = useState<Visitor[]>([]), [audit, setAudit] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false), [link, setLink] = useState(''), [expiry, setExpiry] = useState('7'), [custom, setCustom] = useState('');
  const refresh = async () => {
    const [p, s, u, a] = await Promise.all([accessRequest<Presentation[]>('/presentations'), accessRequest<Share[]>('/shares'), accessRequest<Visitor[]>('/users'), accessRequest<Audit[]>('/audit')]);
    setPresentations(p); setShares(s); setUsers(u); setAudit(a);
  };
  useEffect(() => { void refresh().catch(e => report(errorText(e))); }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); report('');
    try { await action(); await refresh(); } catch (e) { report(errorText(e)); } finally { setBusy(false); }
  };
  const publish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const file = data.get('file') as File;
    void run(async () => { await accessRequest(`/presentations?name=${encodeURIComponent(String(data.get('name')))}`, { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary', 'X-CSRF-Token': session.csrf, 'Idempotency-Key': crypto.randomUUID() }, body: file, signal: AbortSignal.timeout(120000) }); form.reset(); });
  };
  return <main><h1>{t('admin')}</h1><button disabled={busy} onClick={() => void run(refresh)}>{t('refresh')}</button>
    <div className="columns"><section><h2>{t('publish')}</h2><p>{t('requirements')}</p><form onSubmit={publish}><label>{t('name')}<input name="name" required maxLength={160}/></label><label>{t('file')}<input name="file" type="file" accept=".glb" required/></label><button disabled={busy}>{busy ? t('publishing') : t('publish')}</button></form><ul>{presentations.map(p => <li key={p.id}>{p.name} · {rvT('shell', 'access.sizeKiB', { count: Math.ceil(p.size / 1024) })}</li>)}</ul></section>
    <section><h2>{t('createShare')}</h2><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(async () => { const result = await accessWrite<{url: string}>('/shares', { presentationId: data.get('presentation'), userId: data.get('user') || null, expiresAt: expiry === 'custom' ? new Date(custom).getTime() : Date.now() + Number(expiry) * 86400000 }, session.csrf); setLink(result.url); }); }}>
      <label>{t('select')}<select name="presentation" aria-label={t('select')} required><option value="">{t('select')}</option>{presentations.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>{t('recipient')}<select name="user" aria-label={t('recipient')}><option value="">{t('anyone')}</option>{users.filter(u => !u.disabled).map(u => <option value={u.id} key={u.id}>{u.username}</option>)}</select></label>
      <label>{t('expires')}<select aria-label={t('expires')} value={expiry} onChange={e => setExpiry(e.target.value)}>{[1,7,30].map(d => <option key={d} value={d}>{d} {t('days')}</option>)}<option value="custom">{t('custom')}</option></select></label>
      {expiry === 'custom' && <label>{t('expiredAt')}<input type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} required/></label>}<button disabled={busy || !presentations.length}>{t('createShare')}</button></form>
      {link && <div role="status"><p>{t('linkReady')}</p><label>{t('link')}<textarea aria-label={t('link')} readOnly value={link} onFocus={e => e.target.select()}/></label></div>}
    </section></div>
    <section><h2>{t('shares')}</h2>{shares.length ? <table><thead><tr><th>{t('name')}</th><th>{t('recipient')}</th><th>{t('expiredAt')}</th><th>{t('revoke')}</th></tr></thead><tbody>{shares.map(s => <tr key={s.id}><td>{presentations.find(p => p.id === s.presentation)?.name ?? s.id}</td><td>{users.find(u => u.id === s.user)?.username ?? t('anyone')}</td><td>{date(s.expires)}</td><td>{s.revoked ? t('revoked') : <button disabled={busy} onClick={() => void run(() => accessWrite(`/shares/${s.id}/revoke`, {}, session.csrf))}>{t('revoke')}</button>}</td></tr>)}</tbody></table> : <p>{t('empty')}</p>}</section>
    <section><h2>{t('users')}</h2><form className="inline" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await accessWrite('/users', { username: data.get('username'), password: data.get('password'), role: 'visitor' }, session.csrf); form.reset(); }); }}><label>{t('username')}<input name="username" required maxLength={64}/></label><label>{t('password')}<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password"/></label><button disabled={busy}>{t('createUser')}</button></form>
      {users.map(u => <form className="inline user" key={u.id} onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await accessWrite(`/users/${u.id}`, { password: data.get('password') }, session.csrf, 'PATCH'); form.reset(); }); }}><strong>{u.username}</strong><span>{u.disabled ? t('disabled') : t('active')}</span><button type="button" disabled={busy} onClick={() => void run(() => accessWrite(`/users/${u.id}`, { disabled: !u.disabled }, session.csrf, 'PATCH'))}>{u.disabled ? t('enable') : t('disable')}</button><label>{t('password')}<input type="password" name="password" minLength={12} maxLength={256} required autoComplete="new-password"/></label><button disabled={busy}>{t('resetPassword')}</button></form>)}
    </section><section><h2>{t('audit')}</h2><div className="records">{audit.map(a => <p key={a.id}>{date(a.time)} · {users.find(u => u.id === a.actor)?.username ?? a.actor} · {a.action} · {a.target} · {a.outcome}</p>)}</div>{audit.length >= 100 && <button disabled={busy} onClick={() => void accessRequest<Audit[]>(`/audit?before=${audit[audit.length - 1].id}`).then(a => setAudit([...audit, ...a])).catch(e => report(errorText(e)))}>{t('more')}</button>}</section>
  </main>;
}

function Viewer({ shareId, onExpired }: { shareId: string; onExpired: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<RVEmbedViewer | null>(null);
  const [info, setInfo] = useState<ShareInfo | null>(null), [ready, setReady] = useState(false), [time, setTime] = useState(Date.now());
  const onExpiredRef = useRef(onExpired); onExpiredRef.current = onExpired;
  useEffect(() => {
    const controller = new AbortController(); let stopped = false, timer: ReturnType<typeof setInterval> | undefined; let checking = false;
    const stop = (message: string) => { if (stopped) return; stopped = true; controller.abort(); engine.current?.dispose(); engine.current = null; onExpiredRef.current(message); };
    const check = async () => {
      if (checking || stopped) return; checking = true;
      try { const next = await accessRequest<ShareInfo>(`/shares/${shareId}`); if (!stopped) { setInfo(next); setTime(next.serverTime); } }
      catch (e) { stop(e instanceof AccessFailure && e.code === 'SHARE_UNAVAILABLE' ? t('expired') : t('unavailable')); }
      finally { checking = false; }
    };
    const visibility = () => { if (document.visibilityState === 'visible') void check(); };
    const resize = () => { if (canvas.current) engine.current?.resize(canvas.current.clientWidth, canvas.current.clientHeight); };
    const start = async () => {
      try {
        await check(); if (stopped) return;
        const response = await fetchWithEgress(`${accessRoot}/shares/${shareId}/model`, 'share', undefined, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new AccessFailure('ACCESS_UNAVAILABLE');
        const bytes = await response.arrayBuffer();
        const { RVEmbedViewer } = await import('../embed/rv-embed-viewer');
        if (stopped || !canvas.current) return;
        const viewer = new RVEmbedViewer({ canvas: canvas.current, signal: controller.signal, allowUntrustedLogic: false });
        engine.current = viewer; resize();
        await viewer.loadModel(`${accessRoot}/shares/${shareId}/model`, bytes);
        await check(); if (stopped) return;
        viewer.resume(); setReady(true);
      } catch { if (!stopped) stop(t('unavailable')); }
    };
    timer = setInterval(() => void check(), 15000); document.addEventListener('visibilitychange', visibility); window.addEventListener('resize', resize);
    void start();
    return () => { stopped = true; controller.abort(); clearInterval(timer); engine.current?.dispose(); engine.current = null; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', resize); };
  }, [shareId]);
  const watermark = info ? `${info.name} · ${info.identity === 'account' ? t('account') : t('visitor')} ${info.visitor} · ${date(time)}` : '';
  const snapshot = async () => {
    const frame = engine.current?.captureFrame(); if (!frame) return;
    const image = new Image(); image.src = frame; await image.decode();
    const result = document.createElement('canvas'); result.width = image.width; result.height = image.height;
    const ctx = result.getContext('2d'); if (!ctx) return; ctx.drawImage(image, 0, 0); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, result.height - 56, result.width, 56); ctx.fillStyle = 'white'; ctx.font = '16px sans-serif'; ctx.fillText(watermark, 16, result.height - 22, result.width - 32);
    const a = document.createElement('a'); a.href = result.toDataURL('image/png'); a.download = 'presentation.png'; a.click();
  };
  return <main className="viewer"><h1>{info?.name ?? t('rendering')}</h1>{!ready && <p role="status">{t('rendering')}</p>}<div className="viewport"><canvas ref={canvas}/><div className="watermark">{watermark}</div></div><button disabled={!ready} onClick={() => void snapshot()}>{t('snapshot')}</button></main>;
}

createRoot(document.getElementById('root')!).render(<App/>);
