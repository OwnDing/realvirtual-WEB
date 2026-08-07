---
target: Lizenz-UX ConnectPanel (CONNECT/WEB)
total_score: 27
p0_count: 2
p1_count: 2
timestamp: 2026-07-19T11-29-56Z
slug: src-core-hmi-connectpanel-tsx
---
# Critique: Lizenz-UX ConnectPanel (plan-248 Phase 3 Vorarbeit)
Method: dual-agent. Score 27/40 (Acceptable). Detector: 0 Findings (clean), aber #4fc3f7 10x untokenisiert, rv-connections-section 0 aria + Farb-only Linked/Unresolved.

## Priority Issues
- [P0] License-Zeile unter Gateway-Status + LicenseDialog (Magic-Link-Polling + Key-Eingabe); Zustaende Licensed(ruhig, kein Gruen)/Free 17-20-Zaehler/Unlicensed Amber+CTA/Degraded mit Grace-Restzeit. Eigene Datei LicenseSection.tsx + license-store.
- [P0] SignalLimitExceeded: heute grauer Punkt ohne Label (interfaceStatusShort default:null, interfaceDotColor grau). Fix: Text "Signal limit", ISA_AMBER, OverLimitSignals-Namen auf Karte, betroffene Signal-Rows markieren.
- [P1] Download-Link CONNECT-.exe (stable Bunny; beta sekundaer) in: Disconnected-Explainer (ConnectPanel.tsx:610-616), Unreachable-Zeile (:599-604), _friendlyError. 3 nummerierte Schritte statt URL-Feld als Begruessung.
- [P1] Globaler Stale-Data-Chip (BottomBar/TopBar, Amber, "Live data lost - 34s", Klick oeffnet ConnectPanel) wenn gatewayUnreachable und Panel zu; deriveViewerModeFromConnect flippt heute lautlos auf standalone.
- [P2] Signal-Budget 17/20 in Interfaces-Kopfzeile (ab 80% Amber) + Grace-Chip; zentrale Fehlercode-Map (LICENSE_REQUIRED/SIGNAL_LIMIT_REACHED); rv-connections-section ISA-Tokens+aria+Unresolved-Text.

## Persona-Kern
Alex: CLI-only-Aktivierung unauffindbar; stille Kappung unverzeihlich; keine Nag-Mechanik. Jordan: localhost:5100-Feld als Begruessung, kein Download. Sam: Tooltip-only-Fehler, 8.5-9px-Schrift, aria-live fuer Magic-Link-Polling fehlt.

## Heuristik-Scores
1:2 2:3 3:3 4:3 5:2 6:3 7:3 8:4 9:2 10:2 = 27/40
