// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/** Floating definition manager for the code-free rv-agent/v1 schema. */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ContentCopy, Delete, Edit, MoreVert, PlayArrow, PowerSettingsNew } from '@mui/icons-material';
import { FloatingPanel } from '../../core/hmi/FloatingPanel';
import type { AgentBackendsStatus, AgentDefinition, AgentProvider } from './agent-provider';
import { AGENT_SCHEMA_V1, createDefaultAgentDefinition, V1_AGENT_TOOLS } from './agent-provider';
import { rvT, useRvTranslation, type RVTranslationKey } from '../../core/i18n';

// Keys, not text: this table is built at module load, before a language
// preference exists. The checkbox row resolves it at render.
const TOOL_LABEL_KEYS: Record<string, RVTranslationKey<'tools'>> = {
  signal_list: 'agent.toolSignalList',
  signal_read: 'agent.toolSignalRead',
  interfaces_status: 'agent.toolInterfacesStatus',
  health: 'agent.toolHealth',
  signal_docs: 'agent.toolSignalDocs',
  historian_query_aggregated: 'agent.toolHistorian',
  rag_search: 'agent.toolRag',
};

export interface AgentManagerPanelProps {
  open: boolean;
  onClose: () => void;
  provider: AgentProvider;
  onRunStarted: (runId: string) => void;
}

export function AgentManagerPanel({ open, onClose, provider, onRunStarted }: AgentManagerPanelProps) {
  const { t } = useRvTranslation('tools');
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [backendStatus, setBackendStatus] = useState<AgentBackendsStatus | null>(null);
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; agent: AgentDefinition } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentDefinition | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAgents, nextBackendStatus] = await Promise.all([
        provider.listAgents(),
        provider.getBackendStatus(),
      ]);
      setAgents(nextAgents);
      setBackendStatus(nextBackendStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open, provider]);

  const validationError = useMemo(() => draft ? validateDraft(draft) : null, [draft]);

  const startRun = async (agent: AgentDefinition) => {
    setRunning(agent.name);
    setError(null);
    try {
      const run = await provider.runAgent(agent.name);
      onRunStarted(run.runId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(null);
    }
  };

  const save = async () => {
    if (!draft || validationError) return;
    setSaving(true);
    setError(null);
    try {
      await provider.saveAgent(draft);
      if (originalName && originalName !== draft.name) await provider.deleteAgent(originalName);
      setDraft(null);
      setOriginalName(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (agent: AgentDefinition) => {
    setMenu(null);
    setError(null);
    try {
      await provider.saveAgent({ ...agent, enabled: !agent.enabled });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await provider.deleteAgent(deleteTarget.name);
      if (draft?.name === deleteTarget.name) setDraft(null);
      setDeleteTarget(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const newAgent = () => {
    const definition = createDefaultAgentDefinition(uniqueSlug('new-agent', agents));
    setDraft(definition);
    setOriginalName(null);
  };

  const edit = (agent: AgentDefinition) => {
    setMenu(null);
    setDraft(cloneAgent(agent));
    setOriginalName(agent.name);
  };

  const duplicate = (agent: AgentDefinition) => {
    setMenu(null);
    const name = uniqueSlug(`${agent.name}-copy`, agents);
    setDraft({ ...cloneAgent(agent), name, displayName: `${agent.displayName} copy`, enabled: false });
    setOriginalName(null);
  };

  return (
    <>
      <FloatingPanel
        open={open}
        onClose={onClose}
        title={t('agent.title')}
        panelId="agents-manager"
        defaultWidth={720}
        defaultHeight={620}
        minWidth={480}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
            <Button size="small" variant="contained" startIcon={<Add />} onClick={newAgent} sx={{ textTransform: 'none' }}>
              {t('agent.new')}
            </Button>
            <Typography sx={{ ml: 'auto', fontSize: 11, color: 'text.secondary', fontFamily: 'monospace' }}>
              {loading ? t('agent.loading') : t('agent.count', { count: agents.length })}
            </Typography>
          </Box>
          {error && <Alert severity="error" sx={{ mx: 1.5, mb: 1 }}>{error}</Alert>}
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5 }}>
            {!draft ? (
              <AgentList
                agents={agents}
                backendStatus={backendStatus}
                running={running}
                onRun={(agent) => void startRun(agent)}
                onMenu={(anchor, agent) => setMenu({ anchor, agent })}
              />
            ) : (
              <AgentEditor draft={draft} onChange={setDraft} validationError={validationError} backendStatus={backendStatus} />
            )}
          </Box>
          {draft && (
            <>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 1.5, py: 1 }}>
                <Button size="small" onClick={() => { setDraft(null); setOriginalName(null); }} sx={{ textTransform: 'none' }}>{t('agent.cancel')}</Button>
                <Button size="small" variant="contained" disabled={!!validationError || saving} onClick={() => void save()} sx={{ textTransform: 'none' }}>
                  {t(saving ? 'agent.saving' : 'agent.save')}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </FloatingPanel>

      <Menu anchorEl={menu?.anchor ?? null} open={!!menu} onClose={() => setMenu(null)}>
        {menu && [
          <MenuItem key="edit" sx={{ fontSize: 12, gap: 1 }} onClick={() => edit(menu.agent)}><Edit sx={{ fontSize: 14 }} /> {t('agent.edit')}</MenuItem>,
          <MenuItem key="duplicate" sx={{ fontSize: 12, gap: 1 }} onClick={() => duplicate(menu.agent)}><ContentCopy sx={{ fontSize: 14 }} /> {t('agent.duplicate')}</MenuItem>,
          <MenuItem key="toggle" sx={{ fontSize: 12, gap: 1 }} onClick={() => void toggleEnabled(menu.agent)}>
            <PowerSettingsNew sx={{ fontSize: 14 }} /> {t(menu.agent.enabled ? 'agent.disable' : 'agent.enable')}
          </MenuItem>,
          <Divider key="divider" />,
          <MenuItem key="delete" sx={{ fontSize: 12, gap: 1, color: 'error.main' }} onClick={() => { setDeleteTarget(menu.agent); setMenu(null); }}>
            <Delete sx={{ fontSize: 14 }} /> {t('agent.delete')}
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('agent.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13 }}>
            {t('agent.deleteBody', { name: deleteTarget?.displayName ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('agent.cancel')}</Button>
          <Button color="error" onClick={() => void remove()}>{t('agent.deleteConfirm')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function AgentList({
  agents,
  backendStatus,
  running,
  onRun,
  onMenu,
}: {
  agents: AgentDefinition[];
  backendStatus: AgentBackendsStatus | null;
  running: string | null;
  onRun: (agent: AgentDefinition) => void;
  onMenu: (anchor: HTMLElement, agent: AgentDefinition) => void;
}) {
  const { t } = useRvTranslation('tools');
  if (agents.length === 0) {
    return (
      <Box sx={{ py: 5, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t('agent.empty')}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
          {t('agent.emptyHint')}
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {agents.map((agent) => (
        <Box
          key={agent.name}
          sx={{
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: agent.enabled ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 600 }}>{agent.displayName}</Typography>
            <Typography noWrap sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>
              {t('agent.listMeta', { name: agent.name, class: agent.agentClass, backend: resolvedBackendLabel(agent, backendStatus), count: agent.tools.length })}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PlayArrow sx={{ fontSize: 15 }} />}
            disabled={!agent.enabled || running === agent.name}
            onClick={() => onRun(agent)}
            sx={{ minWidth: 64, textTransform: 'none', fontSize: 11 }}
          >
            {t(running === agent.name ? 'agent.starting' : 'agent.run')}
          </Button>
          <Tooltip title={t('agent.actions')}>
            <IconButton size="small" aria-label={t('agent.actionsFor', { name: agent.displayName })} onClick={(event) => onMenu(event.currentTarget, agent)} sx={{ p: 0.35, color: 'text.secondary' }}>
              <MoreVert sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  );
}

function AgentEditor({
  draft,
  onChange,
  validationError,
  backendStatus,
}: {
  draft: AgentDefinition;
  onChange: (next: AgentDefinition) => void;
  validationError: string | null;
  backendStatus: AgentBackendsStatus | null;
}) {
  const { t } = useRvTranslation('tools');
  const set = <K extends keyof AgentDefinition>(key: K, value: AgentDefinition[K]) => onChange({ ...draft, [key]: value });
  const toggleTool = (tool: string, checked: boolean) => set(
    'tools',
    checked ? [...draft.tools, tool] : draft.tools.filter((candidate) => candidate !== tool),
  );
  return (
    <Box component="form" onSubmit={(event) => event.preventDefault()} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{t(draft.name ? 'agent.definition' : 'agent.new')}</Typography>
      {validationError && <Alert severity="warning" variant="outlined" sx={{ py: 0 }}>{validationError}</Alert>}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField size="small" label={t('agent.schema')} value={AGENT_SCHEMA_V1} disabled sx={{ width: 150 }} />
        <TextField
          size="small"
          label={t('agent.name')}
          value={draft.name}
          onChange={(event) => set('name', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          inputProps={{ maxLength: 63, 'aria-describedby': 'agent-name-help' }}
          fullWidth
        />
      </Box>
      <Typography id="agent-name-help" sx={{ mt: -1, fontSize: 10, color: 'text.secondary' }}>{t('agent.nameHelp')}</Typography>
      <TextField size="small" label={t('agent.displayName')} value={draft.displayName} inputProps={{ maxLength: 120 }} onChange={(event) => set('displayName', event.target.value)} fullWidth />
      <TextField size="small" label={t('agent.description')} value={draft.description} inputProps={{ maxLength: 500 }} onChange={(event) => set('description', event.target.value)} fullWidth />
      <TextField
        size="small"
        label={t('agent.instructions')}
        value={draft.instructions}
        onChange={(event) => set('instructions', event.target.value)}
        inputProps={{ maxLength: 16_000 }}
        minRows={5}
        multiline
        fullWidth
        helperText={t('agent.instructionsHelp')}
      />

      <Box component="fieldset" sx={{ m: 0, p: 1, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px' }}>
        <Typography component="legend" sx={{ px: 0.5, fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>{t('agent.allowedTools')}</Typography>
        <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 1 }}>
          {V1_AGENT_TOOLS.map((tool) => (
            <FormControlLabel
              key={tool}
              control={<Checkbox size="small" checked={draft.tools.includes(tool)} onChange={(event) => toggleTool(tool, event.target.checked)} />}
              label={<Typography sx={{ fontSize: 11 }}>{t(TOOL_LABEL_KEYS[tool])}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <FormControl size="small" sx={{ width: 190, flexShrink: 0 }}>
          <InputLabel id="agent-class-label">{t('agent.agentClass')}</InputLabel>
          <Select
            labelId="agent-class-label"
            label={t('agent.agentClass')}
            value={draft.agentClass}
            onChange={(event) => set('agentClass', event.target.value as AgentDefinition['agentClass'])}
          >
            <MenuItem value="report">{t('agent.classReport')}</MenuItem>
            <MenuItem value="authoring" disabled>{t('agent.classAuthoring')}</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label={t('agent.permissionTier')} value="read-only" disabled fullWidth helperText={t('agent.permissionHelp')} />
        <TextField size="small" label={t('agent.trigger')} value="manual" disabled fullWidth />
        <FormControl size="small" fullWidth>
          <InputLabel id="agent-output-label">{t('agent.output')}</InputLabel>
          <Select labelId="agent-output-label" label={t('agent.output')} value={draft.outputFormat} onChange={(event) => set('outputFormat', event.target.value as AgentDefinition['outputFormat'])}>
            <MenuItem value="report">{t('agent.outputReport')}</MenuItem>
            <MenuItem value="chat">{t('agent.outputChat')}</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Typography sx={{ mt: -1, fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>
        {t('agent.backend', { name: resolvedBackendLabel(draft, backendStatus) })}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField size="small" type="number" label={t('agent.maxTurns')} value={draft.maxTurns} inputProps={{ min: 1, max: 16 }} onChange={(event) => set('maxTurns', Number(event.target.value))} fullWidth />
        <TextField size="small" type="number" label={t('agent.tokenBudget')} value={draft.maxBudget.tokens} inputProps={{ min: 1024, max: 2_000_000, step: 1000 }} onChange={(event) => set('maxBudget', { tokens: Number(event.target.value) })} fullWidth />
        <FormControlLabel control={<Checkbox checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} />} label={<Typography sx={{ fontSize: 12 }}>{t('agent.enabled')}</Typography>} />
      </Box>
    </Box>
  );
}

function validateDraft(draft: AgentDefinition): string | null {
  if (draft.agentClass !== 'report' && draft.agentClass !== 'authoring') return rvT('tools', 'agent.errClass');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(draft.name)) return rvT('tools', 'agent.errName');
  if (!draft.displayName.trim()) return rvT('tools', 'agent.errDisplayName');
  if (!draft.instructions.trim()) return rvT('tools', 'agent.errInstructions');
  if (draft.tools.length === 0) return rvT('tools', 'agent.errTools');
  if (!Number.isInteger(draft.maxTurns) || draft.maxTurns < 1 || draft.maxTurns > 16) return rvT('tools', 'agent.errMaxTurns');
  if (!Number.isInteger(draft.maxBudget.tokens) || draft.maxBudget.tokens < 1024 || draft.maxBudget.tokens > 2_000_000) return rvT('tools', 'agent.errBudget');
  return null;
}

function resolvedBackendLabel(agent: AgentDefinition, status: AgentBackendsStatus | null): string {
  const mapping = status?.classes.find(item => item.agentClass === agent.agentClass);
  if (mapping?.backend) return `${mapping.backend.backendId} / ${mapping.backend.model}`;
  return mapping?.error ?? rvT('tools', 'agent.backendUnavailable');
}

function cloneAgent(agent: AgentDefinition): AgentDefinition {
  return { ...agent, tools: [...agent.tools], trigger: { ...agent.trigger }, maxBudget: { ...agent.maxBudget } };
}

function uniqueSlug(base: string, agents: AgentDefinition[]): string {
  const names = new Set(agents.map((agent) => agent.name));
  const clean = base.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'agent';
  if (!names.has(clean)) return clean.length >= 2 ? clean : `${clean}-agent`;
  for (let index = 2; index < 100; index++) {
    const candidate = `${clean}-${index}`.slice(0, 63);
    if (!names.has(candidate)) return candidate;
  }
  return `agent-${Date.now().toString(36)}`;
}
