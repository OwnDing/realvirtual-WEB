---
target: Projects dashboard (src/core/hmi/projects)
total_score: 23
p0_count: 1
p1_count: 3
timestamp: 2026-08-08T10-18-29Z
slug: src-core-hmi-projects
---
# Design Critique — Projects Dashboard (src/core/hmi/projects)

Method: dual-agent (A: design review incl. live inspection at localhost:5173 · B: detect.mjs + browser measurements)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `runVerb` busy-state silently swallows clicks; no spinner/disabled styling during open/scan/import |
| 2 | Match System / Real World | 2 | Detail pane speaks developer: "Backend: bundled", "Writable: no", `catalog.json` |
| 3 | User Control and Freedom | 2 | Deletes confirmed but irreversible; no undo; Esc collapses two levels into one key |
| 4 | Consistency and Standards | 2 | Same 17 assets rendered twice with contradictory badges; native `window.confirm` next to styled MUI dialogs; rows get MoreVert, cards get right-click |
| 5 | Error Prevention | 3 | Dirty-scene guard everywhere, "Close the project before deleting it", extension auto-restored on rename |
| 6 | Recognition Rather Than Recall | 3 | Tab counts, "3 of 48" counters; undercut by blank grey thumbnail-less cards |
| 7 | Flexibility and Efficiency | 2 | Double-click + context menus, but AssetCard is a non-focusable div — selection (gate to detail pane) is pointer-only |
| 8 | Aesthetic and Minimalist Design | 3 | Four type roles held; BUNDLED badge on 11/11 cards = zero information |
| 9 | Error Recovery | 2 | One generic amber snackbar, 8 s; "That project could not be opened." names no cause |
| 10 | Help and Documentation | 2 | Workspace concept explained only in a zero-row empty state that never occurs in practice |
| **Total** | | **23/40** | Acceptable — strong prevention/disclosure, weak status, vocabulary, keyboard access |

## Anti-Patterns Verdict

LLM: Not AI slop — authored microcopy (contract-stating empty states, "Edit a copy"), but visually a generic dark asset-manager: at rgba(18,20,24,0.94) the "glass" is an opaque page; the 3D scene — the product's first principle — is invisible. The personality lives entirely in the copy.

Deterministic scan: **clean** ([] on src/core/hmi/projects, AssetCard.tsx, ProjectCreateDialogs.tsx). Browser measurements: all text contrast passes WCAG AA (worst 4.63:1 row subtitle over white worst-case); BUT icon buttons 25×25 px (MoreVert, Refresh) / 28×28 px (Close, Back) — all below 44 px target; model/asset cards `tabIndex=-1`, `role=null`, `.focus()` does not take → conclusively keyboard-unreachable; 10px text on "OPEN" affordance and export hint (below the 11px Label floor of DESIGN.md).

## Priority Issues

- **[P0] Duplicate library sections with contradictory identity** — "DemoRealvirtual (Bundled)" and "realvirtual Library (URL)" render the identical 17 assets twice (34 of 42 cards are pairwise duplicates), first set badged BUNDLED, second unbadged; "Assets 42" counts both. Fix: dedupe by asset identity in assets-library-groups, or collapse the mirroring source with a "same as bundled" note. → /impeccable distill
- **[P1] Native window.confirm for every destructive verb** (handleDeleteAsset, deleteScene, handleDeleteProject, handleRemoveLibrary). OS-chrome alert at the highest-anxiety moment; cannot style destructive action. Fix: one shared glass confirm dialog with error-colored destructive button. → /impeccable harden
- **[P1] Cards keyboard-invisible + sub-target icon buttons** — AssetCard root is a plain div (no tabIndex/role/key handling; B measured conclusively); icon buttons 25 px. Detail pane ("the accessible route") unreachable by keyboard. Fails WCAG 2.1.1. Fix: role="button" + tabIndex + Enter handling, roving tabindex; ≥44 px touch targets on coarse pointer. → /impeccable audit
- **[P1] "Open a single project folder" unreachable in the common case** — affordance exists only in the zero-row empty state; demo row always present, so a user with one project folder and no workspace cannot open it. Fix: persistent "Open folder…" header action on screen 1 (handleOpenFolder exists). → /impeccable onboard
- **[P2] Badge and vocabulary noise** — BUNDLED on all cards; "Backend: bundled / Writable: no" jargon. Fix: tier badge only in mixed-tier contexts; human phrasing ("Read-only sample project"). → /impeccable clarify
- **[P2] No busy feedback** — spinner/progress missing for open/scan/import. → /impeccable polish
- **[P3] Blank-card placeholders** for thumbnail-less scenes/models read as load failures. Typed glyph tile exists as a pattern (DES cards). → /impeccable polish

## Persona Red Flags

Alex (power user): folder-project outside a workspace = dead end; rename only on workspace rows, not on the recent-opened folder project and not on the project detail pane where he'd look first; window.confirm + 8 s snackbar as only feedback channel.

Jordan (first-timer): lands inside DemoRealvirtual without choosing it (content-first landing trades orientation for speed); duplicated sections read as his own mistake; read-only demo hides Delete with no explanation; "Backend: bundled" means nothing to him.

## Minor Observations

- Screen 1 centers a 760 px list, screen 2 is full-bleed — width rhythm jumps between sibling screens.
- "Close Project" is the top-most action on arrival (default selection = project card) — an exit as the most prominent verb.
- DES glyph tiles use Instrument Blue on non-interactive cards (breach of "if it isn't actionable or selected, it isn't blue").
- Two hover languages one screen apart (white-alpha rows vs blue-alpha cards).
- Internal artifacts ("tests", "physics-zone-test") ship in the demo project's Models list.
- 10 px type on "OPEN" and export hint — below the DESIGN.md Label floor (11 px).
- Esc handling on window relies on MUI dialog ordering — fragile.

## Questions to Consider

1. Why is the Projects surface an opaque takeover in a product whose first principle is "the scene is the interface"? Would a window-tier docked panel keep the machine visible?
2. Does screen 1 earn its existence for the 95 % case, now that the dashboard lands in the project anyway — or is it just a switcher menu?
3. Are libraries project content at all? Viewer-scoped catalogs render under every project's name — where should they actually live?
