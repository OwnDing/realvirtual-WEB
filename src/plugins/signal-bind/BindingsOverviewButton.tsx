// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

/**
 * BindingsOverviewButton — the activity-bar entry to the bindings table
 * (plan-425 F7).
 *
 * The panel itself is behind `lazy()` and, crucially, is not even referenced
 * until the button is pressed: `Suspense` renders nothing while the chunk
 * arrives. The table pulls the whole binding inventory behind it, and this
 * button ships in every workspace that can bind at all — a viewer that never
 * opens it should not carry it.
 */

import { Suspense, lazy, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import { useRvTranslation } from '../../core/i18n';

const BindingsOverviewPanel = lazy(() =>
  import('./BindingsOverviewPanel').then((m) => ({ default: m.BindingsOverviewPanel })));

export function BindingsOverviewButton({ viewer }: UISlotProps) {
  const { t } = useRvTranslation('authoring');
  const [open, setOpen] = useState(false);
  if (!viewer.signalBindingManager) return null;

  return (
    <>
      <Tooltip title={t('signalBind.overviewTooltip')} placement="right">
        <IconButton
          size="small"
          data-testid="bindings-overview-toggle"
          aria-label={t('signalBind.openOverview')}
          onClick={() => setOpen(true)}
          sx={{ p: 0.75, color: open ? 'primary.main' : 'text.disabled' }}
        >
          <AccountTreeIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      {open && (
        <Suspense fallback={null}>
          <BindingsOverviewPanel viewer={viewer} open onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
