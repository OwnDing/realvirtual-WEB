// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, useEffect, useState, useSyncExternalStore } from 'react';
import type { UISlotProps } from '../../rv-ui-plugin';
import { useRvTranslation } from '../../i18n';
import { LazyPanelBoundary } from '../LazyPanelBoundary';
import { getScriptEditorState, subscribeScriptEditor } from './script-editor-store';

const Panel = lazy(() => import('./ScriptEditorPanel').then(m => ({ default: m.ScriptEditorPanel })));

/** Load authoring code on first open, then preserve the editor's local state. */
export function ScriptEditorPanelHost(props: UISlotProps) {
  const { t } = useRvTranslation('authoring');
  const state = useSyncExternalStore(subscribeScriptEditor, getScriptEditorState);
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => { if (state.open) setHasOpened(true); }, [state.open]);
  if (!state.open && !hasOpened) return null;
  return <LazyPanelBoundary label={t('script.title')}><Panel {...props} /></LazyPanelBoundary>;
}
