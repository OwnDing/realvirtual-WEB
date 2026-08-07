---
target: Feature-Matrix-Panel (Settings-Tab Features)
total_score: 17
p0_count: 1
p1_count: 3
timestamp: 2026-07-21T16-06-37Z
slug: c-plugins-feature-matrix-feature-matrix-plugin-tsx
---
Method: dual-agent (A: Design-Review-Subagent · B: Detector/Browser-Subagent)

# Critique: Feature-Matrix-Panel (Settings-Tab "Features") — 17/40

## Design Health Score

| # | Heuristik | Score | Kernproblem |
|---|-----------|-------|-------------|
| 1 | Visibility of System Status | 2 | Live-Updates vorbildlich, aber bei ~540 px Panelbreite liegen "Active now" + "Tier" offscreen (Tabelle 830 px in 516-px-Container) |
| 2 | Match System / Real World | 1 | ●/✓/–/× ohne Legende; feldvalidiert durch PO-Fragen beim Erstkontakt |
| 3 | User Control and Freedom | 1 | Komplett read-only; row-hover suggeriert Interaktivität; Filterzustand flüchtig |
| 4 | Consistency and Standards | 2 | Einziger Tab ohne SettingsSection/FieldRow; lokale Farbkonstanten driften von DESIGN.md-Tiers; ✓ dreifach belegt |
| 5 | Error Prevention | 3 | Read-only, saubere Empty-State-Differenzierung |
| 6 | Recognition Rather Than Recall | 1 | 4 Glyphen nur per Hover-Tooltip; Registrierungsreihenfolge als Sortierung |
| 7 | Flexibility and Efficiency | 1 | Keine Suche/Sortierung; Tooltips per Tastatur unerreichbar |
| 8 | Aesthetic and Minimalist Design | 2 | Tote Tier-Spalte (45× "—"), ● je Mode-Zelle redundant, Dauer-Caveat |
| 9 | Error Recovery | 3 | role="status" an Empty-States/0-Modi |
| 10 | Help and Documentation | 1 | Hilfe hover-only; Touch faktisch ohne |
| **Total** | | **17/40** | **Poor** |

## Anti-Patterns Verdict

LLM: kein AI-Slop, aber "Datenstruktur in Tabelle gekippt" (Legende fehlt, tote Spalte, Zufallssortierung). Detector: 0 Findings (Engine per Kanarienvogel verifiziert); hartkodierte Farben liegen in der Palette, sind aber stiller Token-Fork. Browser-Evidenz (localhost:5173, Internal-Build): starker A11y-Baum (columnheader/rowheader, aria-Label je Glyphe), Overflow-Befund per Screenshot bestätigt.

## Priority Issues

- [P0] Glyphen-Semantik nicht selbsterklärend: keine Legende, ✓ dreifach belegt, alle Zustände gleiche Farbe, Tooltips mouse-only → Legendenzeile + Core-Badge statt ●.
- [P1] Horizontal-Overflow versteckt "Active now"+"Tier" bei Default-Breite → Spaltenbudget senken (Origin als Gruppe, Tier bedingt, Switch nach vorn).
- [P1] Read-only trotz Handlungsimpuls (PO wollte deaktivieren) → Toggles + Guards + Reset (v2).
- [P1] Registrierungsreihenfolge als Sortierung → project→internal→commercial→core→unknown + alphabetisch.
- [P2] Token-Drift: lokale GLASS_* 0.94/0.96 ≠ DESIGN.md-Tiers 0.70/0.80, ohne backdrop-filter; sticky Zellen als Fremdkörper; zIndex-Magic.
- [P2] Tote Tier-Spalte + permanenter Caveat-Absatz → bedingt rendern, Caveat als ⓘ.
- [P3] a11y: Label-in-Name-Mismatches (Checkbox/Select), doppeltes Tabellen-aria-label, nicht fokussierbare Tooltip-Trigger.

## Persona Red Flags

Alex: kein Suchfeld (45 Plugins), Tastatur-Tooltips unerreichbar, Filter flüchtig, keine ID-Copy-Affordance. Sam: Voice-Control bricht an Label-in-Name; – vs. × in 13px knapp; Kontraste bestehen AA deutlich. Riley: 0-Modi sauber; 360 px = ~1,5 Mode-Spalten sichtbar; 6%-Durchschimmern unter sticky Zelle.

## Minor Observations

– vs. — als zwei Leer-Zeichen; Origin roher lowercase-String statt CHIP_RADIUS-Chip; columnCount Magic Number; zwei "Core"-Begriffe (origin 'core' vs. core:true) kollidieren; 2 fremde Konsolen-Errors (CONNECT :5100) nicht attribuiert.

## Questions to Consider

1. Warum ist die prominenteste Fläche die am wenigsten actionable?
2. Muss das bei 360–540 px eine Tabelle sein — oder gruppierte Liste?
3. Auf welchen "Core"-Begriff bezog sich "dürfen wir nicht deaktivieren"?
