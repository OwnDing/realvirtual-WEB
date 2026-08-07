---
target: DES-Fenster (Experiment Matrix + verwandte) im realvirtual WEB Viewer
total_score: 15
p0_count: 1
p1_count: 3
timestamp: 2026-07-13T16-38-27Z
slug: lugins-sim-controller-desexperimentmatrixpanel-tsx
---
# Critique: DES-Fenster (Experiment Matrix + verwandte) — realvirtual WEB

Method: dual-agent (A: a31061e1651a3d75e · B: ae099be669b29a872)
Browser-Hinweis: Playwright-MCP-Profil war von einer parallelen Session belegt; beide Agents nutzten eine isolierte headless-Playwright-Instanz (Repo-devDependency). Alle Live-Messungen sind computed-style-basiert und valide.

## Design Health Score

| # | Heuristik | Score | Kernproblem |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 2 | Pro Spalte "running 1/3" gut; kein Gesamt-Batchfortschritt, kein Completion-Feedback, `busy` disabled Buttons kommentarlos |
| 2 | Match System / Real World | 2 | "Runs" gut; "Seed runs (N)", "CRN", "JS ✎", "STANDARD" (statt "Baseline") = Insider-Jargon |
| 3 | User Control and Freedom | 1 | Kein Cancel für "Run all", kein Undo, ESC schließt ALLE offenen Fenster gleichzeitig |
| 4 | Consistency and Standards | 1 | Serif/Arial-Mix, opake VS-Code-Zellen im Glas-System, box-shadow trotz No-Shadow-Regel, Amber-Fenstertitel |
| 5 | Error Prevention | 1 | Delete run/checkpoint ohne Confirm; positiv: Param-Script-Lint blockiert Save |
| 6 | Recognition Rather Than Recall | 2 | Matrix zeigt alles auf einen Blick; Einstieg im "Simulation clock"-Panel versteckt und geclippt |
| 7 | Flexibility and Efficiency | 2 | Geometrie-Persistenz gut; keine Tastaturbedienung, keine Bulk-Aktionen |
| 8 | Aesthetic and Minimalist Design | 2 | Ruhig und dicht; riesige leere Fenster, 6 Elemente in der Titelleiste, Fensterstapel ohne Kaskade |
| 9 | Error Recovery | 1 | Rohe `e.message` als roter Text, keine Handlungsanleitung |
| 10 | Help and Documentation | 1 | Nur Tooltips (CRN-Tooltip vorbildlich); keine Doku-Links, kein Onboarding |
| **Total** | | **15/40** | **Poor — major UX-Überarbeitung nötig** |

## Anti-Patterns Verdict

**LLM-Assessment:** Fachlich auf FlexSim-Niveau (Baseline-Δ, mean ± 95 % CI, CRN), aber drei "subtly-off"-Signale in den ersten 60 Sekunden: Serifen-Font im ganzen Produkt, opake VS-Code-Farbzellen (#1e1e1e/#252526) im Glas-Design, Flaggschiff-Einstieg als abgeschnittener Button in einem Settings-Popup. Ein Onshape-geeichter Ingenieur stuft das unbewusst als Prototyp ein.

**Deterministischer Scan (CLI):** 4 advisory Findings `design-system-color`: `#d4d4d4` (DESExperimentMatrixPanel.tsx:203), `#ffb74d` ×2 + `rgba(255,183,77,0.5)` (DESExperimentsPanel.tsx:422/489). Toolbars clean.

**In-Page-Detector:** 45 Findings seitenweit. Substanziell: `tiny-text` ×6 (10–11px Body-Text — deckt sich mit Assessment A: 8.5–10px-Schriften), `layout-transition` ×9 (transition: width — Layout-Property animiert), `gpt-thin-border-wide-shadow` ×1 (= der MUI-elevation-8-Schatten auf FloatingPanel). False Positives: `ai-color-palette` ×29 (die bewusste Instrument-Blue-Akzentfarbe, pro Element gezählt), `dark-glow` magenta (Brand + Headless-Warnbanner-Artefakt), 2 Findings auf versteckten Loader-Elementen.

**Wo sich beide treffen:** Der Serif-Befund (A, live) hat in B die Root Cause: `html`/`body`/Fenster-Root computen `"Times New Roman"` — keine globale font-family gesetzt, `MuiCssBaseline`-Overrides definiert aber `<CssBaseline/>` nie gemountet, Inter nirgends geladen. Die schwarzen Zellen (A, Code) bestätigt B im Live-DOM: nameCell `background-color: rgb(30,30,30)` opak. Der Schatten-Verstoß (A) ist exakt Bs `thin-border-wide-shadow`-Finding.

## Overall Impression

Die Substanz ist besser als die Hülle: Die Matrix-IA (Experimente als Spalten, fixe Baseline, Δ-Tints, KPI mit Konfidenzintervall) ist das Differenzierungsmoment gegenüber FlexSim & Co. Aber das Fenster ist im Auslieferungszustand faktisch tot (kein Weg, ein Experiment anzulegen), typografisch kaputt (Serif-Fallback) und verstößt in drei Punkten gegen den eigenen Glass-Control-Room-SSOT. Größte Chance: ein Fix (Font + CssBaseline) hebt das ganze Produkt, nicht nur dieses Fenster.

## What's Working

1. **Matrix-Informationsarchitektur:** Baseline blau verankert, Abweichungs-Tint + Amber-Kante auf geänderten Zellen, KPI als mean ± 95 % CI mit Δ — sauber als pure functions in des-matrix-helpers.ts testbar.
2. **Event Queue Window:** virtualisierte Liste, Monospace-Zeitspalte, ehrliche Statuszeile, Filter, Footer — dichtes, ernsthaftes Product-UI.
3. **FloatingPanel-Basis:** Drag/Resize, Geometrie-Persistenz, Anchor-Placement, Zoom-Awareness — konsistente Fensterinfrastruktur.

## Priority Issues

- **[P0] Typographie-Fundament fehlt produktweit.** `body { font-family: "Times New Roman" }` live gemessen; `MuiCssBaseline`-Overrides in src/core/hmi/theme.ts:43–51 definiert, aber `<CssBaseline/>` nie gerendert; Inter nirgends geladen (kein @fontsource, kein link, kein @font-face). Alle Box-/Non-MUI-Elemente (nameCells, sectionHeader, Script-Hinweise) rendern Serif. **Fix:** Inter als Package + `<CssBaseline/>` in App.tsx mounten. **Command:** /impeccable typeset
- **[P1] Cold-Start-Sackgasse.** Auch nach komplettem FastForward-Lauf bleibt die Matrix leer; der Empty-State verweist auf nicht existierende Aktionen; der einzige Erstellungs-Flow lebt im nirgends gemounteten DESExperimentsPanel.tsx (orphan, per Grep bestätigt), DESRunComparePanel ebenso unerreichbar. **Fix:** "+ New experiment" direkt in Empty-State + als Pseudo-Spalte; tote Panels löschen oder reaktivieren. **Command:** /impeccable onboard
- **[P1] Einstieg geclippt + falsch verortet.** Experiments-Button im "Simulation clock"-Panel unterhalb der Falte (Button-bottom 873.9px vs. Panel-bottom 836px, kein overflow:auto) — Matrix in der public build faktisch unauffindbar. DESControllerToolbar.tsx:295–305/391–399. **Fix:** Content scrollbar + defaultHeight; richtig: eigenes Toolbar-Segment. **Command:** /impeccable layout
- **[P1] Glass-Tier-Verstöße.** Opake Zellen #1e1e1e/#252526 (DESExperimentMatrixPanel.tsx:346/371/376), FloatingPanel elevation={8} → Dreifach-box-shadow (No-Shadow-Regel), Fenster im floating- statt window-Tier. **Fix:** Tier-konforme sticky-Zellen, elevation={0}. **Command:** /impeccable polish
- **[P2] Destruktiv ohne Netz + ESC-Massenschließen + kein Batch-Cancel.** Delete sofort (DESExperimentMatrixPanel.tsx:141–162), jedes FloatingPanel hört global auf Escape (FloatingPanel.tsx:381–388), runAll ohne Abbruch. **Command:** /impeccable harden
- **[P2] Farb-/Kontrastdisziplin.** Instrument Blue als Dekor (Sektions-Header-Band), Amber-Fenstertitel (State-Farbe als Identität), 8.5–10px-Texte, text.disabled ~2.6:1 über heller Szene, Fokus-Outline nach Tab = none, KPI-Δ grün/rot ohne Polaritätswissen. **Command:** /impeccable polish + /impeccable audit

## Persona Red Flags

**Alex (Automation Engineer, Power User):** Übernacht-FastForward → morgens leere Matrix ohne Erklärung; RUN ALL disabled ohne Begründung; ESC im Drilldown schließt drei Fenster gleichzeitig; Einstiegs-Button abgeschnitten — er erfährt nie, dass das Feature existiert; null Tastaturpfad.

**Sam (accessibility-dependent):** Fokus-Outline gemessen none — Tastaturnavigation blind; 8.5–9.5px-Schriften; text.disabled ~2.6:1; CRN-Checkbox ohne Label-Verknüpfung (namenlose Checkbox im Screenreader); Fenster nur per Pointer beweg-/resizebar; Δ-Richtung nur Farbe+▲▼ bei 9px.

## Minor Observations

- "STANDARD" → sollte "BASELINE" heißen; "JS ✎" kryptisch (Glyph rendert in Times)
- Event Queue "Simulation end reached" in #ef9a9a italic — Fehlerfarbe für Normalzustand
- Fensterstapel ohne Kaskaden-Versatz; DES Statistics öffnet über der Matrix-Titelleiste; DES Statistics ohne Empty-State (leeres schwarzes Fenster)
- DESEventQueueWindow nutzt window.innerWidth statt der zoom-aware FloatingPanel-Konvention
- Doppelte Refresh-Semantik (2s-Poll + manueller Button); zwei Öffnungspfade mit zwei Icons
- Chart-Legende bei schmalem Fenster abgeschnitten; transition: width (Detector ×9) animiert Layout-Properties
- Detector: #d4d4d4 und #ffb74d liegen außerhalb der DESIGN.md-Palette

## Questions to Consider

1. Drei Generationen Experiment-UI leben gleichzeitig im Code (Tree-Panel, Run-Compare, Matrix) — zwei unerreichbar. Wer garantiert, dass der Compare-Flow kein stiller Feature-Verlust ist?
2. Die Matrix ist das FlexSim-Differenzierungsmoment — warum ist ihr Einstieg ein abgeschnittener Button in einem Clock-Settings-Popup statt eines erstklassigen Toolbar-Platzes?
3. Ist ≥4.5:1 mit 10px-Text bei 50–70 % Alpha auf 60 %-Glas erreichbar, oder braucht das Glass-System eine definierte Scrim-Stufe für text-dichte Fenster?
