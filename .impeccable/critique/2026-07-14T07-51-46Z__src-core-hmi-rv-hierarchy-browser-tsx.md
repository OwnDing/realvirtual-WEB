---
target: AI-Integration Suche (BottomBar/Hierarchy/SearchAiAnswer)
total_score: 20.5
p0_count: 2
p1_count: 2
timestamp: 2026-07-14T07-51-46Z
slug: src-core-hmi-rv-hierarchy-browser-tsx
---
# Design-Kritik: AI-Integration in der Suche (BottomBar + Hierarchy-Browser + SearchAiAnswer)

Method: dual-agent (A: Design-Review · B: Detector/Browser). Live gegen localhost:5199 + CONNECT diagnose:true.

## Design Health Score: 20.5/40 (Acceptable)

1 Systemstatus 2 — 30-150s statisches "Asking AI…" waehrend Baum "No matching nodes" meldet
2 Realwelt-Match 1.5 — "AI"-Label erklaert nichts; CAUSE-Schablone auf Sachfragen; Quellen-Chip = Datei-Slug
3 Kontrolle 3 — Abort/Escape stark; Enter feuert implizit LLM-Call
4 Konsistenz 1 — zwei Suchen, zwei Korpora, drei AI-Praesentationen
5 Fehler-Praevention 2.5 — Capability-Gate top; persistierter Toggle ueberrascht
6 Wiedererkennen 2.5 — Chip-Bedeutung nur im Tooltip
7 Effizienz 1.5 — kein Keyboard-Shortcut zu irgendeiner Suche; kein geteilter Query
8 Minimalismus 2 — BottomBar-Dropdown: 20 flache ungrupppierte Zeilen
9 Fehler-Diagnose 3 — 429/503 konkret; Timeout generisch
10 Hilfe 1.5 — ein Tooltip fuer 2-min-Feature

## Anti-Patterns

Kein Slop, aber angeschraubte Integration. CLI: layout-transition width/padding (BottomBar.tsx:378), fontSize 0.6rem (BottomBar.tsx:342). Overlay: all-caps-body (CAUSE/REMEDY/SOURCES-Labels), 7x cramped-padding, React-key-Warning BottomBar-Ergebnisliste. Falsch-positiv: cyan/magenta = DESIGN.md-Farben. A+B einig: kein aria-pressed am Chip, kein aria-live an der Antwort, Chips 18-20px unter WCAG-2.2-Zielgroesse.

## Priority Issues

[P0] AI fehlt in der globalen Suche (BottomBar) — Feature liegt 2 Verstecke tief. Fix: AI-Trigger in BottomBar, Antwort als AskAiDialog-artiger Dialog (Nutzer-Entscheid).
[P0] Loading 30-150s statisch + widerspruechlich ("No matching nodes" dominiert). Fix: Dialog mit beschreibendem Fortschritt.
[P1] BottomBar-Dropdown ungrupppiert (41 Treffer/20 Zeilen/5 Typen gemischt). Fix: Kategorie-Gruppierung mit Zaehlern.
[P1] "AI"-Label + Filterzeilen-Position = falsches mentales Modell (Filter statt zweiter Motor). Fix: expliziter "Ask AI"-Trigger.
[P2] Rec/Replay-Badges sehen aus wie Filter-Chips (gefuehlte 8 Chips). Fix: Badges degradieren.
[P2] A11y: aria-live/aria-pressed fehlen; 9-10px-Labels Kontrast/Zielgroesse.
[P3] Antwort-Landung: Scroll mitten im Text, Datei-Slug als Titel, CAUSE-Schablone.

## Persona-Red-Flags

Alex: keine Tastatur-Route, Enter-Overload = stiller API-Verbrauch, Query doppelt tippen.
Jordan: findet AI nie; liest "No matching nodes" und geht.
Sam: Antwort stumm (kein Live-Region) — Feature existiert nicht fuer SR.

## Kleinere Beobachtungen

Beide Suchen koennen gleichzeitig unabhaengige Zustaende zeigen; 90s-Timeout < reale 150s-Langlaeufer; Suchsemantik divergiert (BottomBar matcht Signale/Komponenten, Panel nur Namen); SEARCH-Cap-Pattern (20 + "type to narrow") fehlt im Panel.

## Fragen

Warum zwei Suchen? Ist "AI" ein Filter oder ein Ziel? Gehoert eine 150s-Antwort in eine Trefferliste? (Nutzer-Entscheid: nein — Dialog.)
