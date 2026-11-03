// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The CONNECT embedded demo's Models panel as the target of the activity-bar
 * Projects entry (EP-E2E-001).
 *
 * The panel is a docked LEFT panel, so the gate — which centres itself in the
 * space the left slot leaves free — and the CONNECT panel share one slot rule
 * with it. Kept free of React so `main.ts` can install it without pulling the
 * panel component into its own imports.
 */

import type { ProjectsEntryRedirect } from '../../core/hmi/projects/projects-dashboard-store';

export const CONNECT_EMBED_MODELS_PANEL_ID = 'connect-embed-models';
export const CONNECT_EMBED_MODELS_PANEL_WIDTH = 280;

/** The slice of `LeftPanelManager` the redirect needs. */
export interface ModelsEntryPanels {
  open(id: string, width: number): void;
  close(id: string): void;
  getSnapshot(): { left: { activePanel: string | null } };
  subscribe(listener: () => void): () => void;
}

export function connectEmbedModelsEntry(panels: ModelsEntryPanels): ProjectsEntryRedirect {
  return {
    open: () => panels.open(CONNECT_EMBED_MODELS_PANEL_ID, CONNECT_EMBED_MODELS_PANEL_WIDTH),
    close: () => panels.close(CONNECT_EMBED_MODELS_PANEL_ID),
    isOpen: () => panels.getSnapshot().left.activePanel === CONNECT_EMBED_MODELS_PANEL_ID,
    subscribe: (listener) => panels.subscribe(listener),
  };
}
