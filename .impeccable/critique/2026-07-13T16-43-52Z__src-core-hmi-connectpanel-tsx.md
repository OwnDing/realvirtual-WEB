---
target: realvirtual CONNECT Fenster (Schnittstellen-Konfiguration)
total_score: 22
p0_count: 1
p1_count: 4
timestamp: 2026-07-13T16-43-52Z
slug: src-core-hmi-connectpanel-tsx
---
# Critique: realvirtual CONNECT Panel (Schnittstellen-Konfiguration)

Method: dual-agent (A: a90562b7f9c188521 · B: ac266f29e33d16942)
Live-Inspektion gegen laufenden Dev-Server (localhost:5173) + echten CONNECT-Gateway (v0.1.0 build 16, 4 Interfaces, MQTT 1353 Signale), inkl. eines Gateway-Ausfalls mitten in der Session.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Gateway tot → Panel zeigt minutenlang grün "Connected" (fetchStatus-catch schluckt alle Fehler, connect-store.ts:576-578); Interface-Fehler nur als 6px-Farbpunkt, Fehlertext nur im Hover-Tooltip |
| 2 | Match System / Real World | 3 | Exzellente Ingenieurssprache (Rack/Slot, NetId, %Q/%M); aber "SHM", "Bridges", "ProcessImage" unerklärt für Delivered-Twin-Empfänger |
| 3 | User Control and Freedom | 2 | Kein Undo irgendwo; Interface-Delete sofort und unwiderruflich; kein Rename |
| 4 | Consistency and Standards | 2 | Drei Delete-Flows, drei Verhalten (window.confirm ×2, gar nichts ×1); opakes #232323-Filter-Popover vs. Glas; Off-Palette #4dd0e1 |
| 5 | Error Prevention | 2 | Kein Delete-Confirm; parseInt(x)||0 nullt ungültige Ports still; "RTU (not yet implemented)" wählbar; "Allow Web → PLC writes" unerklärte Checkbox |
| 6 | Recognition Rather Than Recall | 2 | Eingeklappte Karten zeigen nur den TYP — zwei identische "S7"-Zeilen nicht unterscheidbar |
| 7 | Flexibility and Efficiency | 3 | Enter-to-connect, persistierte Filter, Profiles, Mirror, Virtualisierung (1353 Signale flüssig); kein Suchfeld im Add-Dialog, Hover-only Row-Actions |
| 8 | Aesthetic and Minimalist Design | 2 | Diszipliniert dicht, aber: Layout-Kollision bei ≤~550px Höhe (Karten übermalen Signalzeilen), alles 9-11px flach, Signalname doppelt pro Zeile |
| 9 | Error Recovery | 2 | "Failed to fetch" roh in 9px rot ohne nächsten Schritt; Log-Fenster dagegen sehr gut; Snackbar nur bei Push-Fehlern |
| 10 | Help and Documentation | 2 | Starke Tooltips; aber kein "Was ist CONNECT?" im Disconnected-State, keine Doku-Links, keine Hilfe am Write-Enable-Toggle |
| **Total** | | **22/40** | **Acceptable — deutliche Verbesserungen nötig** |

## Anti-Patterns Verdict

Kein AI-Slop — erkennbar handgebautes Domänenwerkzeug (S7 Rack/Slot, AMS NetId, Modbus-Wortreihenfolge, %I0.0). Earned familiarity ~80%; die Vertrauensbrüche kommen von unpolierten Kanten: native window.confirm, Sub-AA-Text, und der falsch-grüne Connected-Status.

Deterministischer Scan (CLI, 6 advisory): #81d4fa (ConnectPanel.tsx:1657, 2070), #4dd0e1 (ConnectPanel.tsx:2490; rv-connections-section.tsx:347, 360) außerhalb DESIGN.md; borderRadius 2px (FloatingPanel.tsx:496) außerhalb der Radius-Skala.

Browser-Detektor (124 Elemente, 112 im Panel): tiny-text 22× (9px ×17!), cramped-padding 14× (Signal-Chips), layout-transition 9× (transition auf width/height — verstößt gegen "keine Layout-Props animieren"), clipped-overflow 8×. False Positives: ai-color-palette 70× ist ~1 Designentscheidung (Cyan-Akzent) pro DOM-Element gezählt; MuiSwitch-Clipping und Chip-Geometrie sind MUI-Stock.

Übereinstimmung A↔B: Off-Palette-Cyans, 9px-Text, Chip-Duplikation. Nur der Detektor fand: layout-transitions, 2px-Radius.

## Priority Issues

1. **[P0] Panel meldet "Connected", während der Gateway tot ist.** Live beobachtet: 50+ ERR_CONNECTION_REFUSED auf dem 2s-/status-Poll; Header-Dot, Statuszeile, Interface-Dots blieben grün/stale. Ursache connect-store.ts:568-579 (catch schluckt alles). Verstößt gegen "Status must be unambiguous" an der Wurzel. Fix: nach 2-3 Poll-Fehlern eigener Zustand "gateway unreachable" (Amber + Icon + Label), Dots auf unknown dimmen, "last update 12s ago" in Monospace, Auto-Recovery. → /impeccable harden
2. **[P1] Interface-Delete ist sofort, unbestätigt, unwiderruflich.** Trash-Icon → weg, kein Confirm/Undo/Toast — während Signal- und Profil-Delete window.confirm nutzen. Ein Fehlklick zerstört 1353-Signal-Konfiguration. Fix: Confirm mit Payload-Nennung ("Delete MQTT — 1353 signals?") oder Undo-Snackbar; alle drei Delete-Flows auf EIN Muster (produkteigener Dialog statt window.confirm). → /impeccable harden
3. **[P1] Layout-Kollision bei kleiner Viewport-Höhe.** Bei ~1000×500 übermalen eingeklappte Karten die expandierten Signalzeilen (ConnectPanel.tsx:544-575: expanded flex:1/minHeight:140, Siblings flexShrink:0). Sieht kaputt aus; DevTools-offen ist Normalzustand. → /impeccable adapt
4. **[P1] Accessibility-Kernfehler.** Gemessen: 9px-Sekundärtext rgba(255,255,255,0.4) ≈ 3.4:1 (AA-Fail), Empty-State ≈ 2.6:1, stale Rows zusätzlich opacity 0.45; unsichtbare Bridge-Buttons (opacity:0, hover-gated) in der Tab-Order → hunderte unsichtbare Fokus-Stopps; Trash/Close ohne aria-label; Interface-Status = Farbe allein (6px-Dot); Switch 28×17. Detektor korroboriert: tiny-text 22×. → /impeccable audit + polish
5. **[P1] Interfaces haben keine sichtbare Identität.** Collapsed Card zeigt nur iface.type — zwei "S7"-Karten ununterscheidbar; kein Name-Feld im Edit, kein Endpoint auf der Karte. Fix: id (s7-1) + Endpoint-Summary in Monospace auf der Karte, Rename im Edit. → /impeccable clarify

## Persona Red Flags

**Alex (Power User):** drei identische "S7"-Zeilen → jede Session alle aufklappen; Add-Dialog 14 flache Typen ohne Type-ahead; Hover-only 16px-Row-Actions; kein Shortcut, kein Duplicate.

**Sam (A11y):** Kontrast-Fails (3.4:1 / 2.6:1 / effektiv ~1.5-3:1 auf stale Rows); unsichtbare fokussierbare Buttons; unbenannte Icon-Buttons; Zustand nur über Farbe; Switch weit unter 44px.

**Jordan (First-Timer / Delivered Twin):** Disconnected-State = kahles Panel ohne Erklärung, was CONNECT ist → Abbruch bei Schritt 1; "Failed to fetch" in 9px rot; Jargonwand (SHM, Bridges, "none (unnamed live config)"); nach Add passiert sichtbar nichts → "hat nicht funktioniert".

## Cognitive Load

4/8 Checklist-Fails (hoch): Visual hierarchy (alles 9-11px), One-thing-at-a-time (Add-Flow über 3 Orte), Minimal choices (Add-Dialog 14 Optionen flach; Action-Row 6; Filter-Popover ~14 Targets), Working memory (identische S7-Karten; Bridge-Dialog braucht exakte Signalnamen). Stark: Chunking, Gruppierung, Progressive Disclosure.

## Emotional Journey

Peak: 1353 live tickende Signal-Badges ohne Jank; das Log-Fenster; One-Click-Mirror. Tal 1 (kritisch): stiller Gateway-Verlust = falsche Beruhigung im höchsten Stakes-Moment. Tal 2: erster Connect-Fehler = "Failed to fetch". Tal 3: Add ohne sichtbares Feedback. Ende: Delete endet in Stille.

## What's Working

1. Virtualisierte, memoized Signal-Liste mit entkoppeltem 200ms-Activity-Tick — 739-Signal-Topics scrollen instant, Werte flackerfrei.
2. Das Log-Fenster (ConnectPanel.tsx:2348-2506): Tail, Level+Interface-Filter, Pause, Copy, Auto-Scroll — professionelle Diagnose-Oberfläche.
3. Pro-Workflow-Details: persistierte Filter/Collapse-States, "Re-open last file", modellgebundene Profile, in-place erklärte Bridge-Semantik.

## Minor Observations

- Kommentar-Widerspruch ConnectPanel.tsx:808-817 (Add soll Edit öffnen, tut es nicht)
- #4dd0e1 / #81d4fa off-palette; ISA_CYAN existiert ungenutzt; INFO-Loglines in Instrument Blue auf nicht-interaktivem Text
- Filter-Popover opak #232323 ohne Blur = vierter Surface-Tier; LeftPanel rgba(48,48,48,0.93) heller als DESIGN.md-Window-Tier
- Dominante Typo 9/10px vs. System-Floor 11/13px; Signal-Counts proportional statt mono (Measurement Rule)
- Log-Level auf 4 Zeichen gekürzt ("DEBU"); parseInt||0 nullt Ports still; Signalname doppelt pro Row (~40% Breite); "⇠"-Glyph im Profile-renderValue; "Interfaces (4)" zählt disabled mit; transition auf width/height (Detektor, 9×); FloatingPanel borderRadius 2px off-scale
- Erste-Kontakt-Copy: leeres Signal-Listing sagt "No matching signals." (impliziert kaputten Filter) statt "No signals yet — Import or Browse"

## Questions to Consider

1. Was wäre, wenn "last data received 2.4s ago" — eine Monospace-Zahl — die einzige, immer sichtbare Vertrauensmetrik des Panels wäre? Staleness wäre strukturell unversteckbar; der P0 verschwindet by design.
2. Der Gateway-Verlust wird leiser behandelt als ein Filter-Chip-Toggle. Wie sähe eine ISA-101-alarmwürdige Behandlung von "connection lost" im Glass Control Room aus — und sollte sie in den Viewport eskalieren?
3. Könnte Add Interface eine durchsuchbare Palette sein (type-to-filter, gruppiert PLC/Robot/Broker/Sink), die anlegt UND Edit öffnet — aus einem 3-Orte-Flow wird eine Bewegung?
