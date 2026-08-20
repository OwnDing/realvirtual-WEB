// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The sender's dialog (plan-386 §3.2).
 *
 * ## The warning sits where the mistake happens
 *
 * "Whoever has the link can see the model" is printed **directly above** the
 * consent box, not in small print and not behind a link. The expensive mistake
 * with a share button is never the deliberate upload — it is the absent-minded
 * one, by somebody who has NDA geometry on screen and is thinking about
 * something else. A warning two clicks away would be documentation; here it is
 * the last thing read before the box is ticked.
 *
 * For the same reason the word in this UI is **unlisted**, never "private".
 * v1 is public-but-unguessable, and calling that "private" would be the
 * sentence somebody quotes after sharing something they should not have. Real
 * confidentiality is encryption, and that is plan-223.
 *
 * ## Two targets, two rule sets
 *
 * | Target | Login | Terms | Expiry |
 * |--------|-------|-------|--------|
 * | upload to us | **required** (F9) | **required** (F9c) | offered, default *never* |
 * | your own URL | none | none | none |
 *
 * The asymmetry is not an oversight but Finding 14: where we host nothing there
 * is nothing to attribute, nothing to take down and nothing to expire. Demanding
 * a login for a link the user could have typed by hand would be theatre.
 *
 * ## The round trip
 *
 * Signing in means leaving the page. Before the mail is requested the form is
 * written to the draft store, and re-opening the dialog restores it — author,
 * licence, expiry, download switch and the ticked consent (unless the terms
 * changed meanwhile, in which case consent is asked again, because consent to a
 * text that has since changed is not consent). The geometry is the one thing
 * that cannot be stored, so the caller re-supplies it; that is why `getBytes`
 * is a callback and not a prop of bytes.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ContentCopy, Check, Link as LinkIcon } from '@mui/icons-material';

import {
  SHARE_TERMS_VERSION,
  clearShareDraft,
  describeShareApiError,
  getShareSession,
  loadShareDraft,
  requestMagicLink,
  saveShareDraft,
  signOutShare,
  subscribeShareSession,
  type MagicLinkSession,
  type ShareExpiry,
  type ShareTermsAcceptance,
} from './rv-share-session';
import { uploadSharedGlb, type ShareUploadPhase } from './rv-share-upload';
import { buildOwnUrlShareLink, buildShareViewerLink } from './rv-share-target';
import { MySharesPanel } from './MySharesPanel';
import { RV_SHARE_VERSION, type RvShareLevel, type RvShareMeta } from './rv-share-meta';
import { Trans } from 'react-i18next';
import { getLocale, rvT, useRvTranslation, type RVTranslationKey } from '../i18n';

const LICENSES = [
  '', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'MIT', 'Apache-2.0', 'All rights reserved',
];

/**
 * The workspace the receiver lands in (plan-423 F5).
 *
 * Until now a shared link carried no mode at all, so the receiver was dropped
 * into whatever his own localStorage last remembered — usually the operator HMI
 * of a machine he has never seen. `viewer` is the default because most links
 * are sent to be LOOKED at; `commissioning` is for the integrator who is meant
 * to connect the model to his own PLC.
 */
// Keys, not text: this table is built at module load, before a language
// preference exists. The radio row resolves both halves at render.
const RECIPIENT_MODES: ReadonlyArray<{ value: string; labelKey: RVTranslationKey<'assets'>; hintKey: RVTranslationKey<'assets'> }> = [
  { value: 'viewer', labelKey: 'share.modeViewer', hintKey: 'share.modeViewerHint' },
  { value: 'commissioning', labelKey: 'share.modeCommissioning', hintKey: 'share.modeCommissioningHint' },
];

const EXPIRY_LABELS: ReadonlyArray<{ value: ShareExpiry; labelKey: RVTranslationKey<'assets'> }> = [
  { value: 'never', labelKey: 'share.expiryNever' },
  { value: '7d', labelKey: 'share.expiry7d' },
  { value: '30d', labelKey: 'share.expiry30d' },
  { value: '90d', labelKey: 'share.expiry90d' },
];

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Produces the GLB, stamped with the metadata the user just typed.
   *
   * The meta is handed IN rather than applied afterwards because the block
   * belongs inside the file (§2.4): the receiver has one URL and nothing else,
   * so author, licence and level have to travel in the bytes. A caller that
   * cannot stamp may ignore the argument — the link still works, the card just
   * falls back to the filename.
   */
  getBytes: (meta: RvShareMeta) => ArrayBuffer | Promise<ArrayBuffer>;
  suggestedName?: string;
  /** Only for the header line; the real size is the buffer's. */
  sizeBytes?: number;
  level?: RvShareLevel;
  defaultAuthor?: string;
  /** Test seam: overrides `location` as the base of the produced link. */
  linkBase?: string;
}

type View = 'form' | 'signin' | 'mail-sent' | 'uploading' | 'done' | 'shares';

export function ShareDialog({
  open,
  onClose,
  getBytes,
  suggestedName = 'Shared model',
  sizeBytes,
  level,
  defaultAuthor = '',
  linkBase,
}: ShareDialogProps) {
  const { t } = useRvTranslation('assets');
  const session = useSyncExternalStore(subscribeShareSession, getShareSession, getShareSession);

  const [view, setView] = useState<View>('form');
  const [name, setName] = useState(suggestedName);
  const [author, setAuthor] = useState(defaultAuthor);
  const [license, setLicense] = useState('');
  const [target, setTarget] = useState<'upload' | 'own-url'>('upload');
  const [recipientMode, setRecipientMode] = useState('viewer');
  const [ownUrl, setOwnUrl] = useState('');
  const [expiry, setExpiry] = useState<ShareExpiry>('never');
  const [allowDownload, setAllowDownload] = useState(true);
  const [terms, setTerms] = useState<ShareTermsAcceptance | undefined>(undefined);

  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<ShareUploadPhase>('creating');
  const [link, setLink] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Restore whatever the sender left behind on the way to his mailbox.
  useEffect(() => {
    if (!open) return;
    const draft = loadShareDraft();
    if (!draft) return;
    if (draft.name) setName(draft.name);
    if (draft.author) setAuthor(draft.author);
    if (draft.license) setLicense(draft.license);
    setTarget(draft.target);
    if (draft.ownUrl) setOwnUrl(draft.ownUrl);
    setExpiry(draft.expiry);
    setAllowDownload(draft.allowDownload);
    setTerms(draft.terms);
  }, [open]);

  const persistDraft = useCallback(() => {
    saveShareDraft({ name, author, license, target, ownUrl, expiry, allowDownload, terms });
  }, [name, author, license, target, ownUrl, expiry, allowDownload, terms]);

  const meta = useMemo<RvShareMeta>(() => ({
    // plan-413: writers emit the current version exclusively. Leaving a literal
    // `1` here would label a block that already carries the v2 level spellings.
    v: RV_SHARE_VERSION,
    ...(name.trim() ? { name: name.trim() } : {}),
    ...(author.trim() ? { author: author.trim() } : {}),
    ...(license.trim() ? { license: license.trim() } : {}),
    ...(level ? { level } : {}),
    allowDownload,
  }), [name, author, license, level, allowDownload]);

  const canShare = target === 'own-url'
    ? ownUrl.trim().length > 0
    : Boolean(terms);

  /**
   * Link options for BOTH builders — one always-present object rather than the
   * `linkBase ? {…} : undefined` each call site used to build for itself.
   * With two independent settings in play, the conditional form is how one of
   * them silently goes missing on the path nobody re-read.
   */
  const linkOptions = useMemo(
    () => ({ ...(linkBase ? { base: linkBase } : {}), mode: recipientMode }),
    [linkBase, recipientMode],
  );

  const doUpload = useCallback(async (
    active: MagicLinkSession,
    accepted: ShareTermsAcceptance,
  ) => {
    setError(null);
    setView('uploading');
    setBusy(true);
    try {
      const bytes = await getBytes(meta);
      const result = await uploadSharedGlb(bytes, meta, {
        session: active,
        terms: accepted,
        expiry,
        allowDownload,
        filename: name,
        onProgress: p => setPhase(p.phase),
      });
      setLink(buildShareViewerLink(result.id, linkOptions));
      setExpiresAt(result.expiresAt);
      clearShareDraft();
      setView('done');
    } catch (e) {
      setError(describeShareApiError(e));
      setView('form');
    } finally {
      setBusy(false);
    }
  }, [getBytes, meta, expiry, allowDownload, name, linkOptions]);

  const handleShare = useCallback(async () => {
    setError(null);

    if (target === 'own-url') {
      // Nothing is hosted, so nothing is gated: build the link and be done.
      try {
        setLink(buildOwnUrlShareLink(ownUrl, linkOptions));
        setExpiresAt(undefined);
        clearShareDraft();
        setView('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    const accepted = terms;
    if (!accepted) return;          // button is disabled; belt and braces (F9c)

    const active = getShareSession();
    if (!active) {
      // The gate runs BEFORE the upload, not after it (F9). Keep the form so
      // the mail round trip returns to a filled dialog.
      persistDraft();
      setView('signin');
      return;
    }
    await doUpload(active, accepted);
  }, [target, ownUrl, terms, persistDraft, doUpload, linkOptions]);

  const handleRequestMail = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      persistDraft();
      await requestMagicLink(email);
      setView('mail-sent');
    } catch (e) {
      setError(describeShareApiError(e));
    } finally {
      setBusy(false);
    }
  }, [email, persistDraft]);

  const handleCopy = useCallback(() => {
    // Same shape as MultiuserPanel.copyShareLink — a two-second confirmation
    // and nothing else. Deliberately not extended (§5.3).
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setError(t('share.copyFailed')));
  }, [link]);

  const handleClose = useCallback(() => {
    setView('form');
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth data-testid="share-dialog">
      <DialogTitle sx={{ pb: 0.5 }}>
        {t(view === 'shares' ? 'share.mySharesTitle' : 'share.title')}
        {view !== 'shares' && (
          <Typography component="span" sx={{ float: 'right', fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
            {formatSize(sizeBytes)}{level ? ` · ${level}` : ''}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1.5 }} data-testid="share-error">{error}</Alert>}

        {view === 'shares' && session && (
          <MySharesPanel session={session} />
        )}

        {view === 'form' && (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label={t('share.name')} size="small" value={name}
              onChange={e => setName(e.target.value)}
              inputProps={{ 'data-testid': 'share-name' }}
            />
            <TextField
              label={t('share.author')} size="small" value={author}
              onChange={e => setAuthor(e.target.value)}
              inputProps={{ 'data-testid': 'share-author' }}
            />
            <TextField
              select label={t('share.licence')} size="small" value={license}
              onChange={e => setLicense(e.target.value)}
              SelectProps={{ native: false }}
            >
              {LICENSES.map(l => (
                <MenuItem key={l || 'none'} value={l}>{l || t('share.licenceNone')}</MenuItem>
              ))}
            </TextField>

            <Divider />

            <FormControl>
              <FormLabel sx={{ fontSize: 12 }}>{t('share.whereFileLives')}</FormLabel>
              <RadioGroup
                value={target}
                onChange={e => setTarget(e.target.value as 'upload' | 'own-url')}
              >
                <FormControlLabel
                  value="upload" control={<Radio size="small" inputProps={{ 'data-testid': 'share-target-upload' } as never} />}
                  label={t('share.uploadToRv')}
                />
                <FormControlLabel
                  value="own-url" control={<Radio size="small" inputProps={{ 'data-testid': 'share-target-own' } as never} />}
                  label={t('share.useOwnUrl')}
                />
              </RadioGroup>
              {target === 'own-url' && (
                <TextField
                  size="small" placeholder="https://…/model.glb" value={ownUrl}
                  onChange={e => setOwnUrl(e.target.value)}
                  inputProps={{ 'data-testid': 'share-own-url' }}
                  helperText={t('share.ownUrlHelper')}
                />
              )}
            </FormControl>

            <FormControl>
              <FormLabel sx={{ fontSize: 12 }}>{t('share.recipientView')}</FormLabel>
              <RadioGroup
                value={recipientMode}
                onChange={e => setRecipientMode(e.target.value)}
              >
                {RECIPIENT_MODES.map(o => (
                  <FormControlLabel
                    key={o.value} value={o.value}
                    control={<Radio size="small" inputProps={{ 'data-testid': `share-mode-${o.value}` } as never} />}
                    label={(
                      <Typography sx={{ fontSize: 13 }}>
                        {t(o.labelKey)}
                        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {t('share.modeHintSuffix', { hint: t(o.hintKey) })}
                        </Typography>
                      </Typography>
                    )}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {target === 'upload' && (
              <>
                <FormControl>
                  <FormLabel sx={{ fontSize: 12 }}>{t('share.deleteAutomatically')}</FormLabel>
                  <RadioGroup
                    row value={expiry}
                    onChange={e => setExpiry(e.target.value as ShareExpiry)}
                  >
                    {EXPIRY_LABELS.map(o => (
                      <FormControlLabel
                        key={o.value} value={o.value}
                        control={<Radio size="small" inputProps={{ 'data-testid': `share-expiry-${o.value}` } as never} />}
                        label={t(o.labelKey)}
                      />
                    ))}
                  </RadioGroup>
                </FormControl>

                <FormControlLabel
                  control={(
                    <Switch
                      size="small" checked={allowDownload}
                      onChange={e => setAllowDownload(e.target.checked)}
                      slotProps={{ input: { 'data-testid': 'share-allow-download' } as never }}
                    />
                  )}
                  label={t('share.allowDownload')}
                />
              </>
            )}

            <Divider />

            {/* The warning, immediately above the box it is about. */}
            <Alert severity="warning" icon={false} sx={{ py: 0.5, fontSize: 12 }} data-testid="share-nda-warning">
              <Trans ns="assets" i18nKey="share.ndaWarning" components={[<strong key="unlisted" />]} />
            </Alert>

            {target === 'upload' && (
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={Boolean(terms)}
                    onChange={e => setTerms(e.target.checked
                      ? { version: SHARE_TERMS_VERSION, acceptedAt: new Date().toISOString() }
                      : undefined)}
                    inputProps={{ 'data-testid': 'share-terms' } as never}
                  />
                )}
                label={(
                  <Typography sx={{ fontSize: 12 }}>
                    {t('share.terms')}
                  </Typography>
                )}
              />
            )}
          </Stack>
        )}

        {view === 'signin' && (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 13 }}>
              {t('share.signinIntro')}
            </Typography>
            <TextField
              label={t('share.email')} size="small" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              inputProps={{ 'data-testid': 'share-email' }}
            />
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
              {t('share.signinHelper')}
            </Typography>
          </Stack>
        )}

        {view === 'mail-sent' && (
          <Stack spacing={1} sx={{ mt: 1 }} data-testid="share-mail-sent">
            <Typography sx={{ fontSize: 13 }}>
              <Trans ns="assets" i18nKey="share.mailSent" values={{ email }} components={[<strong key="email" />]} />
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {t('share.mailSentHint')}
            </Typography>
          </Stack>
        )}

        {view === 'uploading' && (
          <Stack spacing={1.5} sx={{ mt: 2 }} data-testid="share-uploading">
            <Typography sx={{ fontSize: 13 }}>{phaseLabel(phase)}</Typography>
            <LinearProgress />
          </Stack>
        )}

        {view === 'done' && (
          <Stack spacing={1.5} sx={{ mt: 1 }} data-testid="share-done">
            <Typography sx={{ fontSize: 13 }}>{t('share.linkReady')}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <LinkIcon sx={{ fontSize: 16, opacity: 0.6 }} />
              <TextField
                size="small" fullWidth value={link}
                InputProps={{ readOnly: true }}
                inputProps={{ 'data-testid': 'share-link' }}
              />
              <Button
                size="small" onClick={handleCopy}
                startIcon={copied ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
                data-testid="share-copy"
              >
                {t(copied ? 'share.copied' : 'share.copy')}
              </Button>
            </Stack>
            {expiresAt && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }} data-testid="share-expires">
                {t('share.expiresOn', { date: new Date(expiresAt).toLocaleDateString(getLocale()) })}
              </Typography>
            )}
            {session && (
              <Box>
                <Button size="small" onClick={() => setView('shares')} data-testid="share-open-myshares">
                  {t('share.mySharesTitle')}
                </Button>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }} data-testid="share-identity">
          {session ? t('share.signedInAs', { email: session.email }) : ''}
          {session && (
            <Button size="small" sx={{ ml: 1, fontSize: 11 }} onClick={() => void signOutShare()}>
              {t('share.signOut')}
            </Button>
          )}
        </Typography>

        <Stack direction="row" spacing={1}>
          <Button onClick={handleClose} size="small">{t('share.close')}</Button>

          {view === 'form' && (
            <Button
              variant="contained" size="small" disabled={!canShare || busy}
              onClick={() => void handleShare()}
              data-testid="share-submit"
            >
              {t('share.title')}
            </Button>
          )}

          {view === 'signin' && (
            <Button
              variant="contained" size="small" disabled={busy || !email.trim()}
              onClick={() => void handleRequestMail()}
              data-testid="share-send-mail"
              startIcon={busy ? <CircularProgress size={12} /> : undefined}
            >
              {t('share.sendLink')}
            </Button>
          )}

          {view === 'shares' && (
            <Button size="small" onClick={() => setView('done')}>{t('share.back')}</Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

function phaseLabel(phase: ShareUploadPhase): string {
  switch (phase) {
    case 'creating': return rvT('assets', 'share.phaseCreating');
    case 'uploading': return rvT('assets', 'share.phaseUploading');
    case 'confirming': return rvT('assets', 'share.phaseConfirming');
    default: return rvT('assets', 'share.phaseDone');
  }
}

function formatSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
