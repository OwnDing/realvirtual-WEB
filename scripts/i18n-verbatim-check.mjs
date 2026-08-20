// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Proof that the English catalog was MOVED, not rewritten (ADR-0001 §3, §7).
 *
 * The ADR fixes the migration direction: the upstream English wording goes into
 * `en-US` verbatim, and `zh-CN` is translated FROM it. The failure mode that
 * makes worth guarding against is silent and expensive — an English string
 * re-derived by translating the Chinese back reads fine in review, matches no
 * screenshot in `docs/images/`, no wording in the root `doc-*.md` files, and no
 * existing test assertion, and nobody can tell afterwards which strings drifted.
 *
 * So the check is mechanical: every `en-US` value must still be findable, word
 * for word, in the PRE-MIGRATION source. Interpolation is the one allowance —
 * `Refresh {{source}}` has to match the template literal `Refresh ${src.label}`
 * it replaced — so a `{{name}}` matches any run of characters and nothing else
 * is relaxed.
 *
 *   node scripts/i18n-verbatim-check.mjs [--ref <git-ref>]
 *
 * Exit 0 = every value traces back. Exit 1 = at least one does not, listed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The commit the migration started from.
 *
 * Pinned rather than "HEAD~1": the baseline is a FACT about when the strings
 * were extracted, and a moving ref would quietly re-baseline the check the first
 * time somebody edits an English value and commits it.
 */
export const MIGRATION_BASE_REF = 'd1949a5';

/** Files the golden slice took its English from. */
export const MIGRATED_SOURCES = [
  // Golden slice (Milestone 3)
  'src/core/hmi/projects/ProjectsDashboardHost.tsx',
  'src/core/engine/rv-error-visual.ts',
  'src/plugins/annotation-plugin.ts',
  'src/main.ts',
  'index.html',
  // Rest of the Projects flow (Milestone 4, batch 1)
  'src/core/hmi/projects/ProjectsList.tsx',
  'src/core/hmi/projects/ProjectsDashboard.tsx',
  'src/core/hmi/projects/ProjectsDetailPane.tsx',
  'src/core/hmi/projects/DocumentHeroSection.tsx',
  'src/core/hmi/projects/DocumentFilterBar.tsx',
  'src/core/hmi/projects/ProjectTree.tsx',
  'src/core/hmi/projects/ProjectFolderContents.tsx',
  'src/core/hmi/projects/ClassificationEditor.tsx',
  'src/core/hmi/projects/AssetPromptDialog.tsx',
  'src/core/hmi/projects/SceneNameDialog.tsx',
  'src/core/hmi/projects/TransferTargetDialog.tsx',
  'src/core/hmi/projects/DestructiveConfirmDialog.tsx',
  'src/core/hmi/projects/document-filter.ts',
  'src/core/hmi/ConfirmActionDialog.tsx',
  // Settings panel (Milestone 4b, batch 2)
  'src/core/hmi/SettingsPanel.tsx',
  'src/core/hmi/settings/ModelTab.tsx',
  'src/core/hmi/settings/WorkfolderMigrationSection.tsx',
  'src/core/hmi/settings/MouseTab.tsx',
  'src/core/hmi/settings/VisualTab.tsx',
  'src/core/hmi/settings/SimulationTab.tsx',
  'src/core/hmi/settings/InterfacesTab.tsx',
  'src/core/hmi/settings/MultiuserTab.tsx',
  'src/core/hmi/settings/McpTab.tsx',
  'src/core/hmi/settings/RagStatusSection.tsx',
  'src/core/hmi/settings/rag-status.ts',
  'src/core/hmi/settings/DevToolsTab.tsx',
  'src/core/hmi/settings/TestsTab.tsx',
  'src/core/hmi/settings/GroupsTab.tsx',
  'src/core/hmi/settings/CameraStartTab.tsx',
  'src/core/rv-render-modes.ts',
  'src/plugins/camera-startpos-plugin.tsx',
  // Always-visible HMI shell (Milestone 4b, batch 3)
  'src/core/hmi/App.tsx',
  'src/core/hmi/TopBar.tsx',
  'src/core/hmi/BottomBar.tsx',
  'src/core/hmi/ActivityBar.tsx',
  'src/core/hmi/ButtonPanel.tsx',
  'src/core/hmi/CameraBar.tsx',
  'src/core/hmi/ModeDropdown.tsx',
  'src/core/hmi/LeftPanel.tsx',
  'src/core/hmi/FloatingPanel.tsx',
  'src/core/hmi/LazyPanelBoundary.tsx',
  'src/core/hmi/WelcomeModal.tsx',
  'src/core/hmi/LicenseSection.tsx',
  'src/core/hmi/license-store.ts',
  'src/core/hmi/CommissioningTrustBanner.tsx',
  'src/core/hmi/SharedViewBanner.tsx',
  'src/core/hmi/GPUWarningBanner.tsx',
  'src/core/hmi/StorageNoticeBanner.tsx',
  'src/core/hmi/SigWarningBanner.tsx',
  'src/core/hmi/consent-gate.tsx',
  'src/core/hmi/password-gate.tsx',
  'src/core/hmi/ProjectCodeConsentDialog.tsx',
  'src/core/hmi/AiBridgeGate.tsx',
  'src/core/hmi/NewsDialog.tsx',
  'src/core/hmi/ServeSessionBadge.tsx',
  'src/core/hmi/AiActivityOverlay.tsx',
  'src/core/hmi/AskAiButton.tsx',
  'src/core/hmi/SearchAiDialog.tsx',
  'src/core/hmi/AutoQualityDialog.tsx',
  'src/core/hmi/MessagePanel.tsx',
  'src/core/hmi/InstructionLayer.tsx',
  'src/core/hmi/ConnectUpdateNotice.tsx',
  // realvirtual CONNECT flow (Milestone 4b, batch 4)
  'src/core/hmi/ConnectPanel.tsx',
  'src/core/hmi/ConnectOptionsWindow.tsx',
  'src/core/hmi/connect-store.ts',
  'src/core/hmi/rv-connections-section.tsx',
  'src/core/hmi/ConnectUpdateSection.tsx',
  'src/plugins/connect-embed/ConnectEmbedGate.tsx',
  // Operator runtime surface (Milestone 4b, batch 5)
  'src/core/hmi/MachineControlPanel.tsx',
  'src/core/hmi/MaintenancePanel.tsx',
  'src/core/hmi/HistorianTrendPanel.tsx',
  'src/core/hmi/SensorHistoryPanel.tsx',
  'src/core/hmi/MeasurementPanel.tsx',
  'src/core/hmi/MultiuserPanel.tsx',
  'src/core/hmi/GroupsListContent.tsx',
  'src/core/hmi/GroupsOverlay.tsx',
  'src/core/hmi/ClippingPanel.tsx',
  'src/core/hmi/ProblemsPanel.tsx',
  'src/core/hmi/problems-store.ts',
  'src/core/hmi/AnnotationPanel.tsx',
  'src/core/hmi/AnnotationEditModal.tsx',
  'src/core/hmi/DocViewerOverlay.tsx',
  'src/core/hmi/pdf-viewer-store.tsx',
  'src/core/hmi/MobileSelectionSheet.tsx',
  'src/core/hmi/tooltip/ProcessingUnitTooltipContent.tsx',
  'src/core/hmi/tooltip/PumpTooltipContent.tsx',
  'src/core/hmi/tooltip/TankTooltipContent.tsx',
  'src/core/hmi/tooltip/PipeTooltipContent.tsx',
  'src/core/hmi/tooltip/DriveTooltipContent.tsx',
  'src/core/hmi/tooltip/LampTooltipContent.tsx',
  'src/core/hmi/tooltip/WebSensorTooltipContent.tsx',
  'src/core/hmi/tooltip/MetadataTooltipContent.tsx',
  'src/core/hmi/tooltip/PdfTooltipSection.tsx',
  'src/core/hmi/tooltip/SignalBadgeTooltipContent.tsx',
  // Authoring & inspector workspace (Milestone 4b, batch 6)
  'src/core/hmi/DragNumberField.tsx',
  'src/core/hmi/ForceConfirmDialog.tsx',
  'src/core/hmi/HierarchyNodeRow.tsx',
  'src/core/hmi/IKTargetQuickEdit.tsx',
  'src/core/hmi/ReorderableList.tsx',
  'src/core/hmi/SetPositionDialog.tsx',
  'src/core/hmi/SignalEditDialog.tsx',
  'src/core/hmi/SignalSearchOverlay.tsx',
  'src/core/hmi/hierarchy-badge-components.tsx',
  'src/core/hmi/rv-add-component-section.tsx',
  'src/core/hmi/rv-component-section.tsx',
  'src/core/hmi/rv-custom-runtime-instruction-field-renderer.tsx',
  'src/core/hmi/rv-extras-editor.tsx',
  'src/core/hmi/rv-field-row.tsx',
  'src/core/hmi/rv-hierarchy-browser.tsx',
  'src/core/hmi/rv-ik-path-field-renderer.tsx',
  'src/core/hmi/rv-property-inspector.tsx',
  'src/core/hmi/rv-reference-display.tsx',
  'src/core/hmi/rv-signal-badge.tsx',
  'src/core/hmi/rv-signal-slot-row.tsx',
  'src/core/hmi/scene/DocumentCard.tsx',
  'src/core/hmi/scene/DocumentCrumbs.tsx',
  'src/core/hmi/scene/rv-scene-confirm-dialog.tsx',
  'src/core/hmi/scene/rv-scene-edits.ts',
  'src/core/hmi/scene/rv-scene-live-sync.ts',
  'src/core/hmi/scene/scene-document-view.ts',
  'src/core/hmi/script/ScriptEditorPanel.tsx',
  'src/core/hmi/script/ScriptToolbarButton.tsx',
  'src/core/hmi/script/rv-script-save-pipeline.ts',
  'src/core/hmi/signal-vocabulary.ts',
  // Asset lifecycle: project / library / share / import (Milestone 4b, batch 7)
  'src/core/library/AddLibraryDialog.tsx',
  'src/core/library/AssetCard.tsx',
  'src/core/library/library-asset-ops.ts',
  'src/core/project/ProjectCreateDialogs.tsx',
  'src/core/project/rv-project-conflict-dialog.tsx',
  'src/core/project/rv-project-create.ts',
  'src/core/project/rv-project-transport.ts',
  'src/core/share/MySharesPanel.tsx',
  'src/core/share/ShareDialog.tsx',
  'src/core/share/SharedGlbInfoCard.tsx',
  'src/plugins/unified-import/ImportProgressTile.tsx',
  'src/plugins/unified-import/UnifiedImportButton.tsx',
  'src/plugins/unified-import/UnifiedImportDialog.tsx',
  'src/plugins/unified-import/glb-file-provider.tsx',
  'src/plugins/unified-import/import-job-store.ts',
  'src/plugins/unified-import/import-ui.tsx',
  // Discrete-event simulation and material flow (Milestone 4b, batch 8)
  'src/plugins/des/des-workspace-plugin.tsx',
  'src/plugins/order-manager-plugin.tsx',
  'src/plugins/sim-controller/DESControllerToolbar.tsx',
  'src/plugins/sim-controller/DESExperimentMatrixPanel.tsx',
  'src/plugins/sim-controller/ModeSwitchNotice.tsx',
  'src/plugins/sim-controller/SimControllerToolbar.tsx',
  'src/plugins/sim-controller/SimModeToggle.tsx',
  'src/plugins/sim-controller/des-experiments-helpers.ts',
  'src/plugins/sim-controller/des-matrix-helpers.ts',
  // Demo HMI, alarms and storage notices (Milestone 4b, batch 9)
  'src/core/overlay-visibility-store.ts',
  'src/core/storage/rv-opfs-blobs.ts',
  'src/plugins/demo/CycleTimeChart.tsx',
  'src/plugins/demo/DriveChartOverlay.tsx',
  'src/plugins/demo/EnergyChart.tsx',
  'src/plugins/demo/OeeChart.tsx',
  'src/plugins/demo/PartsChart.tsx',
  'src/plugins/demo/SensorChartOverlay.tsx',
  'src/plugins/demo/demo-hmi-plugin.tsx',
  'src/plugins/demo/perf-test-plugin.ts',
  'src/plugins/demo/robot-alarm/AlarmHistoryDialog.tsx',
  'src/plugins/demo/robot-alarm/AskAiDialog.tsx',
  'src/plugins/demo/robot-alarm/RobotContactForceAlarm.tsx',
  'src/plugins/demo/robot-alarm/alarm-seed-data.ts',
  'src/plugins/demo/test-axes-plugin.tsx',
  'src/plugins/models/DemoRealvirtualWeb/demo-kiosk-tour.ts',
  'src/plugins/models/DemoRealvirtualWeb/model-options.ts',
  // AI agents and the layout planner (Milestone 4b, batch 10)
  'src/plugins/agents/AgentManagerPanel.tsx',
  'src/plugins/agents/AgentReportView.tsx',
  'src/plugins/agents/AgentRunPanel.tsx',
  'src/plugins/layout-planner/CatalogBrowser.tsx',
  'src/plugins/layout-planner/LayoutLibraryPanel.tsx',
  'src/plugins/layout-planner/LayoutLibraryPanelHost.tsx',
  'src/plugins/layout-planner/LibrarySelector.tsx',
  'src/plugins/layout-planner/MobileLibraryTab.tsx',
  'src/plugins/layout-planner/PendingLoadMessage.tsx',
  'src/plugins/layout-planner/PlannerToolbarButtons.tsx',
  'src/plugins/layout-planner/index.ts',
  // AAS, runtime instructions and signal binding (Milestone 4b, batch 11)
  'src/core/engine/rv-binding-slot-resolver.ts',
  'src/plugins/aas-link-plugin.tsx',
  'src/plugins/custom-runtime-instruction-plugin.tsx',
  'src/plugins/signal-bind/BindingsOverviewButton.tsx',
  'src/plugins/signal-bind/BindingsOverviewPanel.tsx',
  'src/plugins/signal-bind/InlineSignalSlots.tsx',
  'src/plugins/signal-bind/SignalBindPopover.tsx',
  'src/plugins/signal-bind/SignalLinkModeButton.tsx',
  'src/plugins/signal-bind/component-bulk-actions.ts',
  'src/plugins/signal-bind/first-link-notice.ts',
  'src/plugins/signal-bind/plc-signal-context-menu.ts',
  'src/plugins/signal-bind/signal-bind-target.ts',
  // Remaining plugin, loading and WebXR surfaces (Milestone 4b, batch 12)
  'src/plugins/collision-alert-plugin.tsx',
  'src/plugins/docs-browser-plugin.tsx',
  'src/plugins/fpv-plugin.tsx',
  'src/plugins/gaussian-splat-plugin.tsx',
  'src/plugins/historian-trend-plugin.tsx',
  'src/plugins/kiosk-plugin.tsx',
  'src/plugins/login-gate-plugin.tsx',
  'src/plugins/measurement-plugin.tsx',
  'src/plugins/opener-message-plugin.tsx',
  'src/plugins/pipe-coloring-plugin.tsx',
  'src/plugins/processing-unit-mode-plugin.tsx',
  'src/plugins/rv-clipping-plugin.tsx',
  'src/plugins/tank-fill-history-plugin.tsx',
  'src/plugins/web-sensor-plugin.tsx',
  'src/plugins/webxr-plugin.ts',
];

/**
 * Keys the base ref cannot contain verbatim, each with a reason.
 *
 * What ADR-0001 §3 forbids is re-deriving English WORDING. Restructuring how a
 * sentence is assembled is a different thing and sometimes unavoidable, but it
 * still has to be declared here rather than waved through by loosening the
 * matcher — that way the exceptions stay countable and reviewable.
 */
const PLURAL_SPLICE = 'English plural inflection spliced into the expression, not into words: '
  + 'the source wrote `entr${n === 1 ? "y" : "ies"}` / `object${n !== 1 ? "s" : ""}`, so neither '
  + 'inflected form exists as a run of characters anywhere. i18next resolves `_one`/`_other` '
  + 'per language instead, which is also the only shape zh-CN (one form) and en-US (two) can share. '
  + 'Same words, different seam.';

const CAPITALISED_AT_RENDER = 'Produced by `id.charAt(0).toUpperCase() + id.slice(1)` over the '
  + 'option id, so the capitalised word was never in the source text — only the lowercase id was. '
  + 'Moving the capitalisation into the catalog is what lets the label be translated at all.';

const GERMAN_PLANNER = 'There is no English original to move: the layout planner\'s pending-load '
  + 'message and the thumbnail-generation error shipped GERMAN copy ("Assets werden geladen", '
  + '"Lade …", "… konnte nicht geladen werden", "Wiederholen", "Entfernen", "Preview konnte nicht '
  + 'erzeugt werden — Schreibrechte verweigert oder GLB-Ladefehler") in an otherwise English '
  + 'product. This is the THIRD German leftover found by this migration (Milestone 3 in '
  + '`LayoutLibraryPanel.tsx`, batch 3 in `NewsDialog.tsx`), and like those the English is newly '
  + 'written and the German is gone from the source.';

const GERMAN_SOURCE = 'There is no English original to move: `NewsDialog.tsx` shipped GERMAN copy '
  + '("Neu in realvirtual WEB", "News schließen", "Mehr erfahren", "Weiter", "Schließen", "N von M") '
  + 'in an otherwise English product. The English here is therefore newly written, and the German is '
  + 'gone from the source. Listed in full — including the values that happen to match a word used '
  + 'elsewhere — because the fact worth recording is that this whole dialog had no English, not '
  + 'whether a three-letter button label collides with another file.';

const GERMAN_SIGNAL_NOTICE = 'There is no English original to move: the first-link notice shipped '
  + 'GERMAN copy ("Externes Signal verknüpft — interne Steuerung nun nicht mehr aktiv.") in an '
  + 'otherwise English signal-binding flow. The English catalog value is newly written, and the '
  + 'German is gone from the source.';

const NESTED_TEMPLATE = 'The separator lived INSIDE a nested ternary — `Browse${iface ? ` — ${type}` : \'\'}` '
  + 'and `CONNECTIONS${n > 0 ? ` (${n})` : \'\'}` — so the joined form never existed as one run of '
  + 'characters in the source. Both halves are unchanged; joining them is what makes the title one '
  + 'translatable string instead of a stem a translator cannot reorder.';

export const NEW_STRING_EXEMPTIONS = new Map([
  ['connect.browse.titleTyped', NESTED_TEMPLATE],
  ['connect.connections.sectionCount', NESTED_TEMPLATE],
  ['shell.news.eyebrow', GERMAN_SOURCE],
  ['shell.news.close', GERMAN_SOURCE],
  ['shell.news.learnMore', GERMAN_SOURCE],
  ['shell.news.progress', GERMAN_SOURCE],
  ['shell.news.next', GERMAN_SOURCE],
  ['shell.news.done', GERMAN_SOURCE],
  ['projects.status.moved', 'Sentence-frame split. The source built one string with the verb interpolated '
    + '(`"${doc.name}" ${mode === "move" ? "moved" : "copied"} to "${ws.name}".`), which hands a '
    + 'translator a frame they cannot inflect. The English words are unchanged; only the seam moved.'],
  ['projects.status.copied', 'The other half of the same split — see `projects.status.moved`.'],
  ['settings.backup.clearLegacyConfirm_one', PLURAL_SPLICE],
  ['settings.backup.clearLegacyConfirm_other', PLURAL_SPLICE],
  ['settings.groups.objectCount_other', PLURAL_SPLICE],
  ['authoring.hierarchy.overrides_other', PLURAL_SPLICE],
  ['authoring.signal.showUnfit_one', PLURAL_SPLICE],
  ['authoring.signal.showUnfit_other', PLURAL_SPLICE],
  ['authoring.doc.estimateOccurrences_other', PLURAL_SPLICE],
  ['assets.share.embedded_other', PLURAL_SPLICE],
  ['assets.import.rejected_one', PLURAL_SPLICE],
  ['assets.import.rejected_other', PLURAL_SPLICE],
  ['demo.alarm.historyTitle_one', PLURAL_SPLICE],
  ['demo.alarm.historyTitle_other', PLURAL_SPLICE],
  ['tools.planner.previewFailed', GERMAN_PLANNER],
  ['tools.planner.loadingAssets', GERMAN_PLANNER],
  ['tools.planner.loadingItem', GERMAN_PLANNER],
  ['tools.planner.loadFailedItem', GERMAN_PLANNER],
  ['tools.planner.retry', GERMAN_PLANNER],
  ['tools.planner.remove', GERMAN_PLANNER],
  ['authoring.signalBind.firstLinkNotice', GERMAN_SIGNAL_NOTICE],
  ['settings.cameraStart.savedUserAt', 'The date suffix was a template literal NESTED inside another '
    + '(`Saved (user)${savedAt ? ` — ${…}` : ""}`), so "Saved (user) — " never existed as one run of '
    + 'characters. Both halves are unchanged; joining them is what makes the line one translatable '
    + 'sentence instead of two fragments a translator cannot reorder.'],
  ['settings.visual.toneMapping.option.linear', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.reinhard', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.cineon', CAPITALISED_AT_RENDER],
  ['settings.visual.toneMapping.option.neutral', CAPITALISED_AT_RENDER],
  ['settings.visual.lighting.quality.medium', CAPITALISED_AT_RENDER],
  ['operator.xr.pointAndPlace', 'The English wording is unchanged, but the source encoded the middle dot as the JavaScript escape `\\u00b7`; the catalog contains its decoded display character so translators see the punctuation users see.'],
  ['operator.xr.replace', 'The English wording is unchanged, but the source encoded the leading circular arrow as the JavaScript escape `\\u21BB`; the catalog contains its decoded display character so translators see the glyph users see.'],
  ['operator.xr.enterVr', 'This label was previously owned by Three.js VRButton inside the installed dependency, not by a tracked repository source. The plugin now overrides that upstream English label so it can switch languages in place.'],
  ['operator.xr.exitVr', 'The session-active counterpart of operator.xr.enterVr; it was likewise generated inside Three.js VRButton and had no tracked repository source to move from.'],
]);

function flatten(node, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value, path));
    else out[path] = String(value);
  }
  return out;
}

/** The pre-migration text of every migrated source, concatenated. */
export function readBaseSources(ref = MIGRATION_BASE_REF, root = ROOT) {
  return MIGRATED_SOURCES.map((path) => {
    try {
      return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' });
    } catch {
      return ''; // A file that did not exist then cannot have contributed strings.
    }
  }).join('\n');
}

/**
 * A matcher for one catalog value.
 *
 * Three, and only three, differences are tolerated — each one a mechanical
 * consequence of moving a string out of JSX rather than a change of wording:
 *
 *   - `{{name}}` spans the `${…}` expression it replaced;
 *   - `<0>`/`</0>` span the JSX element they replaced (a `<code>` span, say),
 *     since a `<Trans>` key numbers its children instead of naming them. The
 *     marker also absorbs whitespace on both sides: a `<Link>` with props wraps
 *     across lines, so its content starts on the NEXT line while the catalog
 *     holds the sentence flat;
 *   - a character that JSX often spells as an HTML entity (`'`, `&`, `—`, `©`)
 *     also matches that entity, because `&apos;` and `'` are the same character
 *     once rendered — the catalog holds what the user reads;
 *   - a run of spaces matches any whitespace OR one of the three things that
 *     RENDER as whitespace but are not: a JavaScript concatenation seam
 *     (`' + '` or a backtick seam), because long messages were wrapped across
 *     source lines and the catalog holds them flat; a JSX space expression
 *     `{' '}`; and an `&nbsp;` entity.
 *
 * Everything else is escaped, so no rewording slips through.
 *
 * Both ends are word-anchored when they can be. Without that a one-word value is
 * a bare substring test, and short labels pass on coincidence: `Low` matches
 * `Lower`, `Linear` matches `LinearProgress`, `High` matches `HighlightStyle`.
 * A check that accepts a word because another word contains it is not checking
 * anything. The anchor is conditional because `\b` is meaningless next to a
 * non-word character, and plenty of labels start with `·` or end with `.`.
 */
/**
 * Characters JSX commonly writes as an entity, and the entities that spell them.
 * One pass over the escaped string, so an entity's own `&` is never re-expanded.
 */
const ENTITY_FORMS = new Map([
  ["'", '&apos;|&#39;'],
  ['&', '&amp;'],
  ['"', '&quot;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['—', '&mdash;'],
  ['–', '&ndash;'],
  ['©', '&copy;'],
  ['…', '&hellip;'],
]);

/** Placeholder for a `<Trans>` slot while the entity pass runs — see verbatimPattern. */
const SLOT = '\u0000slot\u0000';

export function verbatimPattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Order matters. The `<0>` markers are lifted out FIRST, because `<` and `>`
  // are themselves entity-able: expanding them in place would rewrite the marker
  // (and, a step later, the `<[^>]*>` it turns into) into something that matches
  // no tag at all.
  // Each run of spaces becomes an ATOMIC group — `(?=(X+))\\1` — not a plain
  // `X+`. Plain `+` over an alternation is a backtracking bomb: on a value that
  // very nearly matches, an N-space value gives the engine exponentially many
  // ways to split the whitespace, at every candidate offset in every source
  // file. That does not make the check WRONG, it makes it never finish — so a
  // genuine regression would hang CI instead of failing it, and the only
  // outcome anyone would ever observe is a pass. Atomic groups take the longest
  // run and never give it back, which is the only behaviour these alternatives
  // were ever meant to have. (No alternative can swallow a following literal:
  // each one consumes whitespace, or a quote-PLUS-quote splice. The quote
  // class covers ' " and ` — a fragment ending in a double quote is the
  // shape a sentence containing an apostrophe takes.)
  //
  // The backreference is wrapped in `(?:…)` because the next character is
  // often a digit: bare `\\2` before `3D` reads as backreference 23, which
  // JS silently reinterprets as an octal escape rather than rejecting.
  let group = 0;
  const body = escaped
    .replace(/<\/?\d>/g, SLOT)
    .replace(/\\\{\\\{\w+\\\}\\\}/g, '[\\s\\S]*?')
    // A non-ASCII character has THREE spellings in source: the character, an
    // HTML entity, and a `\uXXXX` escape. The third is the one an author reaches
    // for when the literal would be invisible in review — `\u2014` for an em
    // dash — so a value that moved verbatim can still look rewritten here.
    .replace(/['&"<>—–©…]/g, (char) => {
      const forms = [char.replace(/[&]/g, '\\&'), ENTITY_FORMS.get(char)];
      const code = char.codePointAt(0);
      if (code > 0x7f) forms.push(`\\\\u${code.toString(16).padStart(4, '0')}`);
      return `(?:${forms.join('|')})`;
    })
    .split(SLOT).join('\\s*<[^>]*>\\s*')
    .replace(/ +/g, () => `(?=((?:\\s|['\`"]\\s*\\+\\s*['\`"]|\\{' '\\}|&nbsp;)+))(?:\\${++group})`);
  // `\n` in a template literal is two SOURCE characters, so `\nBranch:` has no
  // word boundary before `Branch` in the text this check reads — even though the
  // rendered string does. An escape sequence counts as a boundary.
  // A wildcard at either END matches the empty string, so it accepts exactly
  // what the rest of the pattern accepts — but as a LEADING unanchored `.*?` it
  // makes every miss quadratic in file length, and a value that opens with
  // `{{count}}` then takes minutes per run instead of milliseconds. Dropping it
  // is semantics-preserving and is the difference between a gate that reports a
  // regression and one that hangs before it can.
  const trimmed = body
    .replace(/^(?:\[\\s\\S\]\*\?)+/, '')
    .replace(/(?:\[\\s\\S\]\*\?)+$/, '');
  const lead = /^\w/.test(value) ? '(?:\\b|\\\\[nrt])' : '';
  const tail = /\w$/.test(value) ? '\\b' : '';
  return new RegExp(lead + trimmed + tail);
}

/**
 * Flatten a hand-written catalog module to `namespace.a.b` -> value.
 *
 * A brace-depth walk rather than a single regex: the path is what makes a value
 * addressable, and only nesting knows the path.
 */
export function readCatalogValues(catalogText) {
  const values = {};
  const stack = [];
  for (const line of catalogText.split('\n')) {
    const open = /^\s{2,}([A-Za-z][\w]*): \{\s*$/.exec(line);
    if (open) { stack.push(open[1]); continue; }
    if (/^\s{2,}\},?\s*$/.test(line)) { stack.pop(); continue; }
    const leaf = /^\s{4,}([A-Za-z][\w]*): '((?:[^'\\]|\\.)*)',$/.exec(line);
    if (leaf && stack.length > 0) {
      const path = [...stack, leaf[1]].join('.');
      values[path] = leaf[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
  }
  return values;
}

export function checkVerbatim(ref = MIGRATION_BASE_REF, root = ROOT) {
  const source = readBaseSources(ref, root);
  // Both halves: ADR-0001 R1 moved the non-startup namespaces into their own
  // module so they leave the entry chunk. A check that only read one of them
  // would quietly stop covering two thirds of the catalog.
  const catalogText = ['en-US.ts', 'en-US.deferred.ts']
    .map((name) => readFileSync(new URL(`../src/core/i18n/catalogs/${name}`, import.meta.url), 'utf8'))
    .join('\n');
  // Read the values out of the module text rather than importing it: this script
  // has to run under plain node with no TypeScript loader.
  //
  // Keyed by the FULL dotted path. Leaf names alone collide badly once the
  // catalog has more than one namespace — `section`, `intensity` and `color`
  // each occur a dozen times — and a collision does not fail loudly, it
  // silently drops every value but the last from the check.
  const values = readCatalogValues(catalogText);
  const missing = [];
  for (const [key, value] of Object.entries(values)) {
    if (NEW_STRING_EXEMPTIONS.has(key)) continue;
    if (!verbatimPattern(value).test(source)) missing.push({ key, value });
  }
  return { checked: Object.keys(values).length, missing };
}

const invoked = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (invoked.endsWith('scripts/i18n-verbatim-check.mjs')) {
  const refIndex = process.argv.indexOf('--ref');
  const ref = refIndex > 0 ? process.argv[refIndex + 1] : MIGRATION_BASE_REF;
  const { checked, missing } = checkVerbatim(ref);
  if (missing.length === 0) {
    console.log(`${checked} en-US values all trace back verbatim to ${ref}.`);
  } else {
    console.error(`${missing.length} of ${checked} en-US values are NOT in ${ref}:`);
    for (const { key, value } of missing) console.error(`  ${key}: ${JSON.stringify(value)}`);
    console.error('\nEither the string was rewritten (ADR-0001 §3 forbids that for moved text),\n'
      + 'or it is genuinely new — add it to NEW_STRING_EXEMPTIONS with a reason.');
    process.exit(1);
  }
}
