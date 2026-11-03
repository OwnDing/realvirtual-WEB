// SPDX-License-Identifier: AGPL-3.0-only

/**
 * EP-E2E-001: in the CONNECT embedded demo the activity-bar Projects entry opens
 * the demo's Models panel. The redirect must take every open/close/toggle and
 * keep the dashboard snapshot's `open` in step with the panel, so the activity
 * bar's highlight follows it without knowing about the demo.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  closeProjectsDashboard,
  getProjectsDashboardSnapshot,
  openProjectsDashboard,
  resetProjectsDashboardForTests,
  setProjectsEntryRedirect,
  toggleProjectsDashboard,
} from '../src/core/hmi/projects/projects-dashboard-store';
import {
  CONNECT_EMBED_MODELS_PANEL_ID,
  CONNECT_EMBED_MODELS_PANEL_WIDTH,
  connectEmbedModelsEntry,
} from '../src/plugins/connect-embed/connect-embed-models-entry';

/** A minimal LeftPanelManager: one left slot, last open wins. */
function fakePanels() {
  let active: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const opened: Array<[string, number]> = [];
  return {
    opened,
    open(id: string, width: number) { opened.push([id, width]); active = id; notify(); },
    close(id: string) { if (active === id) { active = null; notify(); } },
    getSnapshot: () => ({ left: { activePanel: active } }),
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => resetProjectsDashboardForTests());

describe('Projects entry redirect (EP-E2E-001)', () => {
  it('toggle opens and closes the demo Models panel and mirrors it into the snapshot', () => {
    const panels = fakePanels();
    setProjectsEntryRedirect(connectEmbedModelsEntry(panels));

    toggleProjectsDashboard();
    expect(panels.opened).toEqual([[CONNECT_EMBED_MODELS_PANEL_ID, CONNECT_EMBED_MODELS_PANEL_WIDTH]]);
    expect(getProjectsDashboardSnapshot().open).toBe(true);

    toggleProjectsDashboard();
    expect(panels.getSnapshot().left.activePanel).toBeNull();
    expect(getProjectsDashboardSnapshot().open).toBe(false);
  });

  it('follows the panel when another left panel takes the slot', () => {
    const panels = fakePanels();
    setProjectsEntryRedirect(connectEmbedModelsEntry(panels));
    openProjectsDashboard();
    panels.open('connect', 360);
    expect(getProjectsDashboardSnapshot().open).toBe(false);
  });

  it('removing the redirect restores the dashboard and unsubscribes', () => {
    const panels = fakePanels();
    setProjectsEntryRedirect(connectEmbedModelsEntry(panels));
    expect(panels.listenerCount()).toBe(1);
    setProjectsEntryRedirect(null);
    expect(panels.listenerCount()).toBe(0);

    openProjectsDashboard();
    expect(panels.opened).toEqual([]);
    expect(getProjectsDashboardSnapshot().open).toBe(true);
    closeProjectsDashboard();
    expect(getProjectsDashboardSnapshot().open).toBe(false);
  });
});
