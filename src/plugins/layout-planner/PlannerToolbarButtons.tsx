// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * PlannerToolbarButtons — Left-vertical-toolbar entries for the layout planner.
 *
 * Three button-group slot components, all rendered only while the planner
 * panel is open (i.e. planner mode is active):
 *
 *   - `PlannerGridButton`          — opens a popover with the snap master
 *                                    switch plus translation-step (mm) and
 *                                    rotation-step (°) numeric editors.
 *   - `PlannerDropToSurfaceButton` — toggles "drop newly-placed / dragged
 *                                    objects to the surface below" mode.
 *   - `PlannerDeleteButton`        — removes ALL currently selected layout
 *                                    instances. Disabled when the selection
 *                                    is empty. Shares its remove-path with
 *                                    the Delete / Backspace shortcut so a
 *                                    single SceneStore composite op rolls
 *                                    them all back on Ctrl+Z.
 *
 * These were previously in the planner side-panel footer; moving them to
 * the left toolbar frees vertical space in the panel and keeps frequently-
 * used spatial-mode toggles next to other workspace buttons.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Box,
  Divider,
  IconButton,
  Popover,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Adjust,
  AutoDelete,
  BorderOuter,
  DeleteOutline,
  GridOn,
  JoinInner,
  Link as LinkIcon,
  MenuBook,
  Redo,
  Rotate90DegreesCcw,
  SettingsEthernet,
  Straighten,
  Tag,
  Undo,
  VerticalAlignBottom,
  ViewSidebar,
} from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useSelection } from '../../hooks/use-selection';
import { useVanishMUs } from '../../core/hmi/visual-settings-store';
import { useToolButtonInteraction } from '../../hooks/use-tool-button-interaction';
import { getSceneStore } from '../../core/hmi/scene/scene-store-singleton';
import { LAYOUT_PANEL_WIDTH } from '../../core/hmi/layout-constants';
import type { SceneSnapshot } from '../../core/hmi/scene/scene-store';
import { DragNumberField } from '../../core/hmi/DragNumberField';
import type { LayoutPlannerPlugin } from './index';
import type { LayoutSnapshot } from './rv-layout-store';
import { useRvTranslation } from '../../core/i18n';

// Sane bounds for typed values — keeps the gizmo from getting micro-snap or
// >360° steps. The user can still set anything within these ranges precisely.
const MIN_TRANSLATION_MM = 0; // 0 = translation snapping off (grid not drawn)
const MAX_TRANSLATION_MM = 100_000;
const MIN_ROTATION_DEG = 0.1;
const MAX_ROTATION_DEG = 180;

// ─── Hook: planner plugin + snapshot ─────────────────────────────────────

/**
 * Get the planner plugin and its store snapshot. ButtonPanel already filters
 * these components out unless the 'planner' UI context is active (via the
 * `visibilityRule: { shownOnlyIn: ['planner'] }` on the slot entry), so we
 * don't re-check `isOpen` here. The `null` fallbacks remain as a defensive
 * boot-race guard for the brief window between viewer construction and
 * plugin registration.
 */
function usePlannerToolbarState(): {
  plugin: LayoutPlannerPlugin | null;
  snapshot: LayoutSnapshot | null;
} {
  const viewer = useViewer();
  const plugin = viewer.getPlugin<LayoutPlannerPlugin>('layout-planner') ?? null;
  const store = plugin?.store;
  // useSyncExternalStore needs stable subscribe / getSnapshot fns even when
  // there's no store yet — use no-op fallbacks. Snapshot is null in that case.
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => null as unknown as LayoutSnapshot),
  );
  return { plugin, snapshot };
}

/**
 * Clamp + sanity-check a numeric input. Returns null when input is empty or
 * NaN (caller keeps the editor in "draft" state without committing).
 */
function clampNumber(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

// ─── Grid / snap settings popover ─────────────────────────────────────────

export function PlannerGridButton() {
  const { t } = useRvTranslation('tools');
  const { plugin, snapshot } = usePlannerToolbarState();
  // Click toggles grid snap; right-click / press-and-hold opens the settings popover.
  const { anchorEl, closeMenu, buttonProps } = useToolButtonInteraction({
    onToggle: () => plugin?.toggleGrid(),
  });

  // Local "draft" state so users can type freely without each keystroke
  // committing to the store (which would drive a viewer redraw).
  // Synced from snapshot whenever the popover opens or the snapshot value
  // changes externally (e.g. preset chip clicked).
  const [transDraft, setTransDraft] = useState<string>('');
  const [rotDraft, setRotDraft] = useState<string>('');

  useEffect(() => {
    if (!snapshot) return;
    setTransDraft(String(snapshot.gridSizeMm));
    setRotDraft(String(snapshot.rotationSnapDeg));
  }, [snapshot?.gridSizeMm, snapshot?.rotationSnapDeg, anchorEl]);

  if (!plugin || !snapshot) return null;

  const enabled = snapshot.gridEnabled;
  const sizeMm = snapshot.gridSizeMm;
  const rotDeg = snapshot.rotationSnapDeg;

  /** Commit the typed translation value: clamp, store, refresh the input. */
  const commitTranslation = () => {
    const n = clampNumber(transDraft, MIN_TRANSLATION_MM, MAX_TRANSLATION_MM);
    if (n === null) {
      setTransDraft(String(sizeMm)); // revert
      return;
    }
    plugin.setGridSize(n);
    setTransDraft(String(n));
    // Typing a non-zero value implies "I want snap on". A 0 means translation
    // snapping off, so don't auto-enable the grid for it.
    if (n > 0 && !enabled) plugin.toggleGrid();
  };

  const commitRotation = () => {
    const n = clampNumber(rotDraft, MIN_ROTATION_DEG, MAX_ROTATION_DEG);
    if (n === null) {
      setRotDraft(String(rotDeg));
      return;
    }
    plugin.setRotationSnapDeg(n);
    setRotDraft(String(n));
    if (!enabled) plugin.toggleGrid();
  };

  return (
    <>
      <Tooltip
        title={enabled
          ? t('planner.snapOn', { grid: sizeMm > 0 ? `${sizeMm} mm` : t('planner.snapTranslationOff'), rot: rotDeg })
          : t('planner.snapOff')}
        placement="right"
      >
        <IconButton
          size="small"
          {...buttonProps}
          sx={{
            p: 0.75,
            color: enabled ? 'primary.main' : 'text.disabled',
          }}
          aria-label={t('planner.toggleGridSnap')}
        >
          <GridOn sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Popover
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{ paper: { sx: { ml: 1, width: 250, p: 0 } } }}
      >
        {/* Header row — title (the tool button itself is the on/off toggle) */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
          }}
        >
          <GridOn sx={{ fontSize: 18, color: enabled ? 'primary.main' : 'text.disabled' }} />
          <Typography
            variant="subtitle2"
            sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}
          >
            {t('planner.snapToGrid')}
          </Typography>
        </Box>

        <Divider />

        {/* Body — one-line rows (no section captions); fades when snap is off
            but stays interactive so the user can pre-set values then enable. */}
        <Stack
          spacing={0.5}
          sx={{
            px: 2,
            py: 1.5,
            opacity: enabled ? 1 : 0.55,
            transition: 'opacity 120ms ease',
          }}
        >
          <DragNumberField
            label={t('planner.translation')}
            icon={<Straighten sx={{ fontSize: 16 }} />}
            unit="mm"
            value={transDraft}
            onValueChange={setTransDraft}
            onCommit={commitTranslation}
            min={MIN_TRANSLATION_MM}
            max={MAX_TRANSLATION_MM}
            step={1}
            ariaLabel={t('planner.translation')}
          />
          <DragNumberField
            label={t('planner.rotation')}
            icon={<Rotate90DegreesCcw sx={{ fontSize: 16 }} />}
            unit="°"
            value={rotDraft}
            onValueChange={setRotDraft}
            onCommit={commitRotation}
            min={MIN_ROTATION_DEG}
            max={MAX_ROTATION_DEG}
            step={0.1}
            ariaLabel={t('planner.rotation')}
          />
        </Stack>
      </Popover>
    </>
  );
}

// ─── Drop-to-surface button ──────────────────────────────────────────────

export function PlannerDropToSurfaceButton() {
  const { t } = useRvTranslation('tools');
  const { plugin, snapshot } = usePlannerToolbarState();
  if (!plugin || !snapshot) return null;

  const on = snapshot.dropToSurface;
  return (
    <Tooltip title={t(on ? 'planner.dropOn' : 'planner.dropOff')} placement="right">
      <IconButton
        size="small"
        onClick={() => plugin.store.setDropToSurface(!on)}
        sx={{
          p: 0.75,
          color: on ? 'primary.main' : 'text.disabled',
        }}
        aria-label={t('planner.toggleDrop')}
      >
        <VerticalAlignBottom sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Chain-mode button ───────────────────────────────────────────────────

/**
 * Toolbar button — toggles chain mode: when on, assets connected via snap
 * points follow the dragged asset so a whole snapped line moves together.
 * Moved out of the magnetic-snap popover; it is independent of magnetic snap
 * (the snap-point plugin reads `store.chainModeEnabled` on its own).
 */
export function PlannerChainModeButton() {
  const { t } = useRvTranslation('tools');
  const { plugin, snapshot } = usePlannerToolbarState();
  if (!plugin || !snapshot) return null;

  const on = snapshot.chainModeEnabled;
  return (
    <Tooltip title={t(on ? 'planner.chainOn' : 'planner.chainOff')} placement="right">
      <IconButton
        size="small"
        onClick={() => plugin.store.setChainMode(!on)}
        sx={{
          p: 0.75,
          color: on ? 'primary.main' : 'text.disabled',
        }}
        aria-label={t('planner.toggleChain')}
      >
        <LinkIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Vanish-MUs button ───────────────────────────────────────────────────

/**
 * Toolbar button — toggles "vanish MUs at end of line". When on, an MU that
 * runs off the last transport surface (no successor belt picks it up) is
 * deleted after a short delay. State is persisted (localStorage) and pushed
 * onto the live transport manager via `viewer.setVanishMUs`.
 */
export function PlannerVanishMUsButton() {
  const { t } = useRvTranslation('tools');
  const viewer = useViewer();
  const on = useVanishMUs();

  return (
    <Tooltip title={t(on ? 'planner.vanishOn' : 'planner.vanishOff')} placement="right">
      <IconButton
        size="small"
        onClick={() => viewer.setVanishMUs(!on)}
        sx={{
          p: 0.75,
          color: on ? 'primary.main' : 'text.disabled',
        }}
        aria-label={t('planner.toggleVanish')}
      >
        <AutoDelete sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Documentation-mode button ───────────────────────────────────────────

/**
 * Toolbar button — toggles documentation mode. When on, component datasheets
 * (the standard AAS drive docs attached by the transport library components)
 * are shown on hover / selection while the planner is active; when off, the
 * planner stays clean. Outside the planner the datasheets are always visible,
 * so this toggle only matters in planner mode.
 */
export function PlannerDocModeButton() {
  const { t } = useRvTranslation('tools');
  const { plugin, snapshot } = usePlannerToolbarState();
  if (!plugin || !snapshot) return null;

  const on = snapshot.docMode;
  return (
    <Tooltip title={t(on ? 'planner.docOn' : 'planner.docOff')} placement="right">
      <IconButton
        size="small"
        onClick={() => plugin.store.setDocMode(!on)}
        sx={{
          p: 0.75,
          color: on ? 'primary.main' : 'text.disabled',
        }}
        aria-label={t('planner.toggleDoc')}
      >
        <MenuBook sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Signal-linking mode button ──────────────────────────────────────────

/**
 * Toolbar button — toggles Planner Signal Linking mode (plan-226). When on,
 * every placed element with bindable standard-signal slots shows a 3D status
 * badge; clicking a badge opens the CONNECT signal picker. When off, no badges
 * and no picker (pure layout). The whole feature is gated by the viewer's
 * `plannerSignalLinking` flag — when that flag is off there is no
 * `signalBindingManager`, so the button hides itself entirely.
 */
// ─── Delete-selection button ─────────────────────────────────────────────

/**
 * Toolbar button — removes every currently-selected layout instance. Shares
 * its remove-path (`plugin.removeSelected()`) with the Delete / Backspace
 * keyboard shortcut, so both gestures emit the same single composite op
 * (single Ctrl+Z restores the lot).
 *
 * Disabled state reactivly tracks the SelectionManager so the user gets an
 * immediate visual cue when nothing is selected.
 */
export function PlannerDeleteButton() {
  const { t } = useRvTranslation('tools');
  const { plugin } = usePlannerToolbarState();
  const selection = useSelection();
  if (!plugin) return null;

  // Spawned MUs are registered selectable scene nodes, so they appear in
  // SelectionManager paths just like layout objects — no special-casing here.
  const count = selection.selectedPaths.length;
  const disabled = count === 0;
  const tooltip = disabled
    ? 'Delete (select something first)'
    : count === 1 ? 'Delete' : `Delete ${count} items`;

  return (
    <Tooltip title={tooltip} placement="right">
      {/* Tooltip on a disabled IconButton needs a wrapping span — MUI swallows
          pointer events on disabled buttons otherwise. */}
      <span>
        <IconButton
          size="small"
          onClick={() => { void plugin.removeSelected(); }}
          disabled={disabled}
          sx={{
            p: 0.75,
            color: disabled ? 'text.disabled' : '#ef5350',
          }}
          aria-label={t('planner.deleteSelected')}
        >
          <DeleteOutline sx={{ fontSize: 18 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

// ─── Library toggle ──────────────────────────────────────────────────────

/**
 * Toolbar button — toggles the planner Library window (the right-docked parts
 * catalog). Makes the library OPTIONAL in planner mode: closing it just hides
 * the panel; the planner stays active and the workspace mode is unchanged (the
 * mode ↔ library coupling lives in the plugin's lpm subscription). Active
 * (primary) while the library is open.
 */
export function PlannerLibraryButton() {
  const { t } = useRvTranslation('tools');
  const viewer = useViewer();
  const lpm = viewer.leftPanelManager;
  const snap = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  const isOpen = snap.right.activePanel === 'layout-planner';

  return (
    <Tooltip title={t(isOpen ? 'planner.hideLibrary' : 'planner.showLibrary')} placement="right">
      <IconButton
        size="small"
        onClick={() => {
          if (isOpen) lpm.close('layout-planner');
          else lpm.open('layout-planner', LAYOUT_PANEL_WIDTH, 'right');
        }}
        sx={{ p: 0.75, color: isOpen ? 'primary.main' : 'text.disabled' }}
        aria-label={t('planner.toggleLibrary')}
      >
        <ViewSidebar sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Undo / Redo buttons ─────────────────────────────────────────────────

// Stable no-op fallbacks for useSyncExternalStore while the SceneStore singleton
// hasn't been created yet (brief boot window before planner UI shows).
const _noopSubscribe = () => () => {};
const _nullSnapshot = () => null as unknown as SceneSnapshot;

/**
 * One history button. Reuses the existing SceneStore undo/redo op-log — the
 * same store that the keyboard shortcuts (Ctrl+Z / Ctrl+Y) and the scene card
 * drive — so planner edits, deletes and placements all share one history.
 */
function HistoryButton({ kind }: { kind: 'undo' | 'redo' }) {
  const { t } = useRvTranslation('tools');
  const store = getSceneStore();
  const snap = useSyncExternalStore(
    store?.subscribe ?? _noopSubscribe,
    store?.getSnapshot ?? _nullSnapshot,
  );
  if (!store) return null;

  const enabled = (kind === 'undo' ? snap.canUndo : snap.canRedo) === true;
  const label = (kind === 'undo' ? snap.undoLabel : snap.redoLabel) ?? t(kind === 'undo' ? 'planner.undo' : 'planner.redo');
  const run = () => { void (kind === 'undo' ? store.undo() : store.redo()); };

  return (
    <Tooltip title={label} placement="right">
      {/* Tooltip on a disabled IconButton needs a wrapping span. */}
      <span>
        <IconButton
          size="small"
          onClick={run}
          disabled={!enabled}
          sx={{ p: 0.75, color: enabled ? 'text.secondary' : 'text.disabled' }}
          aria-label={t(kind === 'undo' ? 'planner.undo' : 'planner.redo')}
        >
          {kind === 'undo' ? <Undo sx={{ fontSize: 18 }} /> : <Redo sx={{ fontSize: 18 }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function PlannerUndoButton() { return <HistoryButton kind="undo" />; }
export function PlannerRedoButton() { return <HistoryButton kind="redo" />; }

// ─── Magnetic-snap settings popover ──────────────────────────────────────

// Snap-distance bounds — keep the tolerance physically meaningful.
const MIN_BBOX_TOL_MM = 1;
const MAX_BBOX_TOL_MM = 1000;
// Max auto-measure distance bounds for the neighbor-distance overlay.
const MIN_NEIGHBOR_MAX_MM = 100;
const MAX_NEIGHBOR_MAX_MM = 100_000;

/**
 * Toolbar button — opens a popover with the magnetic-snap master switch,
 * Mid / Side reference-point toggles, and the snap-distance (tolerance)
 * in millimetres. Magnetic snap aligns dragged objects' bounding-box
 * edges (Side) and centres (Mid) to placed objects within the tolerance.
 * Hold Alt during drag to temporarily suppress.
 *
 * Independent of grid snap — both can be active. Bbox snap takes priority
 * within its tolerance; grid is the fallback quantizer.
 */
export function PlannerSnapButton() {
  const { t } = useRvTranslation('tools');
  const { plugin, snapshot } = usePlannerToolbarState();
  // Click toggles magnetic snap; right-click / press-and-hold opens the settings popover.
  const { anchorEl, closeMenu, buttonProps } = useToolButtonInteraction({
    onToggle: () => plugin?.store.setBboxSnap(!snapshot?.bboxSnapEnabled),
  });
  const [tolDraft, setTolDraft] = useState<string>('');
  const [maxDistDraft, setMaxDistDraft] = useState<string>('');

  useEffect(() => {
    if (!snapshot) return;
    setTolDraft(String(snapshot.bboxSnapToleranceMm));
    setMaxDistDraft(String(snapshot.neighborDistanceMaxMm));
  }, [snapshot?.bboxSnapToleranceMm, snapshot?.neighborDistanceMaxMm, anchorEl]);

  if (!plugin || !snapshot) return null;

  const enabled = snapshot.bboxSnapEnabled;
  const mid = snapshot.bboxSnapMid;
  const side = snapshot.bboxSnapSide;
  const showDistance = snapshot.showNeighborDistances;
  const tolMm = snapshot.bboxSnapToleranceMm;
  const maxDistMm = snapshot.neighborDistanceMaxMm;

  const commitTolerance = () => {
    const n = clampNumber(tolDraft, MIN_BBOX_TOL_MM, MAX_BBOX_TOL_MM);
    if (n === null) {
      setTolDraft(String(tolMm));
      return;
    }
    plugin.store.setBboxSnapToleranceMm(n);
    setTolDraft(String(n));
    if (!enabled) plugin.store.setBboxSnap(true); // typing implies "I want snap on"
  };

  const commitMaxDist = () => {
    const n = clampNumber(maxDistDraft, MIN_NEIGHBOR_MAX_MM, MAX_NEIGHBOR_MAX_MM);
    if (n === null) {
      setMaxDistDraft(String(maxDistMm));
      return;
    }
    plugin.store.setNeighborDistanceMaxMm(n);
    setMaxDistDraft(String(n));
  };

  return (
    <>
      <Tooltip
        title={enabled
          ? t('planner.magneticOn', { tol: tolMm })
          : t('planner.magneticOff')}
        placement="right"
      >
        <IconButton
          size="small"
          {...buttonProps}
          sx={{
            p: 0.75,
            color: enabled ? 'primary.main' : 'text.disabled',
          }}
          aria-label={t('planner.toggleMagnetic')}
        >
          <JoinInner sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Popover
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{ paper: { sx: { ml: 1, width: 250, p: 0 } } }}
      >
        {/* Header — title (the tool button itself is the on/off toggle) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25 }}>
          <JoinInner sx={{ fontSize: 18, color: enabled ? 'primary.main' : 'text.disabled' }} />
          <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            {t('planner.magneticSnap')}
          </Typography>
        </Box>

        <Divider />

        {/* Body — fades when master switch is off but stays interactive so the
            user can pre-configure and then enable. */}
        {/* Body — one uniform list of single-line rows (toggles + numeric),
            no section captions. Fades when snap is off but stays interactive. */}
        <Stack
          spacing={0.5}
          sx={{
            px: 2,
            py: 1.5,
            opacity: enabled ? 1 : 0.55,
            transition: 'opacity 120ms ease',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Adjust sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 12, flex: 1 }}>{t('planner.mid')}</Typography>
            <Switch
              size="small"
              checked={mid}
              onChange={() => plugin.store.setBboxSnapMid(!mid)}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BorderOuter sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 12, flex: 1 }}>{t('planner.side')}</Typography>
            <Switch
              size="small"
              checked={side}
              onChange={() => plugin.store.setBboxSnapSide(!side)}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tag sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 12, flex: 1 }}>{t('planner.neighborDistances')}</Typography>
            <Switch
              size="small"
              checked={showDistance}
              onChange={() => plugin.store.setShowNeighborDistances(!showDistance)}
            />
          </Box>

          <DragNumberField
            label={t('planner.snapDistance')}
            icon={<SettingsEthernet sx={{ fontSize: 16 }} />}
            unit="mm"
            value={tolDraft}
            onValueChange={setTolDraft}
            onCommit={commitTolerance}
            min={MIN_BBOX_TOL_MM}
            max={MAX_BBOX_TOL_MM}
            step={1}
            ariaLabel={t('planner.snapDistance')}
          />
          <DragNumberField
            label={t('planner.maxMeasure')}
            icon={<Straighten sx={{ fontSize: 16 }} />}
            unit="mm"
            value={maxDistDraft}
            onValueChange={setMaxDistDraft}
            onCommit={commitMaxDist}
            min={MIN_NEIGHBOR_MAX_MM}
            max={MAX_NEIGHBOR_MAX_MM}
            step={50}
            ariaLabel="Max measure distance"
          />
        </Stack>
      </Popover>
    </>
  );
}
