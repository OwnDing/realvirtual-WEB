// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Presentation-only login adapter. Authorization is always enforced by the server. */
import { useState, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Box, Typography, TextField, Button, Paper } from '@mui/material';
import { RVViewerProvider } from '../hooks/use-viewer';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry } from '../core/rv-ui-plugin';
import { useRvTranslation } from '../core/i18n';
import { accessRequest, accessWrite, type AccessSession } from '../access/client';

export interface LoginGateConfig {
  title?: string;
  subtitle?: string;
  accentColor?: string;
  footer?: string;
  /** @deprecated Client-side credentials are rejected; migrate to Appliance access accounts. */
  userB64?: string;
  /** @deprecated Client-side credentials are rejected; migrate to Appliance access accounts. */
  passB64?: string;
  /** @deprecated Browser storage is never authentication state. */
  sessionKey?: string;
  /** @deprecated Model selection cannot be used to escape the access gate. */
  showModelPicker?: boolean;
}

export class LoginGatePlugin implements RVViewerPlugin {
  readonly id = 'login-gate';
  readonly slots: UISlotEntry[];
  private root: Root | null = null;
  private element: HTMLElement | null = null;
  private release: (() => void) | null = null;
  private disposed = false;
  private generation = 0;
  private readonly legacy: boolean;

  constructor(private readonly config: LoginGateConfig = {}) {
    this.legacy = config.userB64 !== undefined || config.passB64 !== undefined;
    const plugin = this;
    function Overlay() {
      const { t } = useRvTranslation('shell');
      const [user, setUser] = useState(''), [pass, setPass] = useState('');
      const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
      const [error, setError] = useState(plugin.legacy ? 'migration' : '');
      useEffect(() => {
        let active = true;
        if (!plugin.legacy) void plugin.check().then(ok => { if (active && ok) { setDone(true); plugin.unlock(); } }).catch(() => {});
        return () => { active = false; };
      }, []);
      if (done) return null;
      return <Box sx={{ position: 'fixed', inset: 0, zIndex: 21000, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,.9)', backdropFilter: 'blur(calc(12px * var(--rv-ui-blur-scale, 1)))' }}>
        <Paper sx={{ p: 4, width: 360 }}><form onSubmit={async event => {
          event.preventDefault(); if (plugin.legacy) return;
          setBusy(true); setError('');
          try { await accessWrite('/login', { username: user, password: pass }); if (!await plugin.check()) throw new Error('denied'); setDone(true); plugin.unlock(); }
          catch { setError('invalid'); } finally { setPass(''); setBusy(false); }
        }}>
          {config.title && <Typography variant="h6">{config.title}</Typography>}
          {config.subtitle && <Typography>{config.subtitle}</Typography>}
          <TextField fullWidth margin="normal" label={t('login.username')} autoComplete="username" value={user} onChange={e => setUser(e.target.value)}/>
          <TextField fullWidth margin="normal" label={t('login.password')} type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)}/>
          {error && <Typography role="alert" color="error">{error === 'migration' ? t('access.migration') : t('access.invalid')}</Typography>}
          <Button type="submit" fullWidth disabled={busy || plugin.legacy} variant="contained" sx={{ bgcolor: config.accentColor }}>{t('login.signIn')}</Button>
          {config.footer && <Typography variant="caption">{config.footer}</Typography>}
        </form></Paper>
      </Box>;
    }
    this.slots = [{ slot: 'overlay', component: Overlay, order: -1000 }];
  }
  private async check(): Promise<boolean> {
    if (this.legacy || this.disposed) return false;
    const session = await accessRequest<AccessSession>('/session');
    return session.role === 'admin' && !session.shareId;
  }
  private unlock(): void {
    if (this.disposed || this.legacy) return;
    this.release?.(); this.release = null;
    this.teardown();
  }
  installGate(viewer: RVViewer): void {
    const generation = ++this.generation;
    viewer.loadGate = new Promise<void>(resolve => { this.release = resolve; });
    void this.check().then(ok => { if (ok && !this.disposed && generation === this.generation) this.unlock(); }).catch(() => {});
    if (typeof document === 'undefined' || this.root) return;
    this.element = document.createElement('div'); this.element.id = 'rv-login-gate-root';
    document.body.appendChild(this.element); this.root = createRoot(this.element);
    const Overlay = this.slots[0].component;
    this.root.render(<RVViewerProvider value={viewer}><Overlay viewer={viewer}/></RVViewerProvider>);
  }
  private teardown(): void {
    const root = this.root, element = this.element; this.root = null; this.element = null;
    if (root) queueMicrotask(() => { root.unmount(); element?.remove(); });
  }
  dispose(): void { this.disposed = true; this.generation++; this.release = null; this.teardown(); }
}
