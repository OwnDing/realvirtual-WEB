// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * SceneConfirmDialog — "Unsaved changes" modal raised when the user is about
 * to switch models (or close the workspace) while the active working scene
 * has unsaved edits. Offers Save / Discard / Cancel.
 *
 * For working scenes that have no saved id yet, the primary action becomes
 * "Save as…" (since there is no saved id to overwrite).
 */

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useRvTranslation } from '../../i18n';

interface SceneConfirmDialogProps {
  open: boolean;
  sceneName: string;
  /** True when the active working scene has a saved id (Save overwrites).
   *  False for unsaved working scenes (Save becomes Save as…). */
  canSave: boolean;
  /**
   * Further unsaved documents to NAME, beyond `sceneName` (plan-703 §2.7.3).
   *
   * A project switch can leave more than one document behind — every frame of
   * the document stack has its own dirty bit — and "Discard" that silently
   * covered documents the dialog never mentioned would be the data loss the
   * guard exists to prevent. Empty on every path that has only a scene.
   */
  alsoUnsaved?: readonly string[];
  onSave: () => void;
  onSaveAs: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SceneConfirmDialog({
  open,
  sceneName,
  canSave,
  alsoUnsaved,
  onSave,
  onSaveAs,
  onDiscard,
  onCancel,
}: SceneConfirmDialogProps) {
  const { t } = useRvTranslation('authoring');
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 14, fontWeight: 600 }}>{t('doc.confirmTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 13 }}>
          {t('doc.confirmBody')} <b>"{sceneName}"</b>. {t('doc.confirmQuestion')}
        </DialogContentText>
        {alsoUnsaved && alsoUnsaved.length > 0 && (
          <DialogContentText sx={{ fontSize: 13, mt: 1 }}>
            {alsoUnsaved.length === 1
              ? t('doc.alsoUnsavedOne')
              : t('doc.alsoUnsavedMany', { count: alsoUnsaved.length })}
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {alsoUnsaved.map((name, i) => (
                <li key={`${name}:${i}`}><b>{name}</b></li>
              ))}
            </Box>
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onCancel} sx={{ textTransform: 'none', mr: 'auto' }}>
          {t('doc.cancel')}
        </Button>
        <Button size="small" color="error" onClick={onDiscard} sx={{ textTransform: 'none' }}>
          {t('doc.discard')}
        </Button>
        {canSave ? (
          <Button size="small" variant="contained" onClick={onSave} sx={{ textTransform: 'none' }}>
            {t('doc.save')}
          </Button>
        ) : (
          <Button size="small" variant="contained" onClick={onSaveAs} sx={{ textTransform: 'none' }}>
            {t('doc.saveAs')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
