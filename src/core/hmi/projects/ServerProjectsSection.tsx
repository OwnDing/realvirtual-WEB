// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ServerProjectsSection — Appliance projects stored in Forgejo (ADR-0024).
 * Renders nothing where the deployment does not offer server projects.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { CloudQueue } from '@mui/icons-material';
import { useRvTranslation } from '../../i18n';
import { useHmiCan } from '../../../hooks/use-hmi-session';
import { getProjectStore } from '../../project/project-store';
import {
  createServerProject, listServerProjects, serverProjectIdOf, serverProjectsBaseUrl, type ServerProjectSummary,
} from '../../project/server-projects-client';

export function ServerProjectsSection() {
  const { t } = useRvTranslation('shell');
  const base = serverProjectsBaseUrl();
  const maySave = useHmiCan('save-server-projects');
  const [rows, setRows] = useState<ServerProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setRows(await listServerProjects()); setError(null); } catch { setError(t('account.serverLoadFailed')); }
  }, [t]);
  useEffect(() => { if (base) void refresh(); }, [base, refresh]);

  if (!base) return null;

  const open = async (id: string, createIfMissing = false, displayName?: string) => {
    setBusy(true);
    try { await getProjectStore().openServerProject(id, { baseUrl: base, createIfMissing, name: displayName }); } finally { setBusy(false); }
  };
  const create = async () => {
    const id = serverProjectIdOf(name);
    if (!id) return;
    setBusy(true);
    try {
      await createServerProject(id, name.trim());
      setName('');
      await refresh();
      await open(id, true, name.trim());
    } catch (e) {
      setError(t('account.serverCreateFailed', { code: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 1, p: 1.5, mb: 2 }} data-testid="server-projects">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <CloudQueue fontSize="small" />
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t('account.serverProjects')}</Typography>
      </Box>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1 }}>
        {maySave ? t('account.serverProjectsHelp') : t('account.serverReadOnly')}
      </Typography>
      {error && <Typography role="alert" sx={{ fontSize: 12, color: 'error.main', mb: 1 }}>{error}</Typography>}
      {rows && rows.length === 0 && <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 1 }}>{t('account.serverEmpty')}</Typography>}
      <Stack spacing={0.5}>
        {rows?.map((row) => (
          <Box key={row.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, flex: 1 }} noWrap>{row.name}</Typography>
            <Button size="small" disabled={busy} onClick={() => { void open(row.id); }} sx={{ textTransform: 'none' }}>
              {t('account.serverOpen')}
            </Button>
          </Box>
        ))}
      </Stack>
      {maySave && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField size="small" value={name} onChange={(e) => setName(e.target.value)} label={t('account.serverNewName')} sx={{ flex: 1 }} inputProps={{ maxLength: 200 }} />
          <Button size="small" variant="contained" disabled={busy || !serverProjectIdOf(name)} onClick={() => { void create(); }} sx={{ textTransform: 'none' }}>
            {t('account.serverCreate')}
          </Button>
        </Box>
      )}
    </Box>
  );
}
