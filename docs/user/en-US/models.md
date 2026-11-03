---
doc_id: USER-MODELS-EN-US
title: Opening and importing models
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Opening and importing models

## Prepare
Start with a self-contained GLB. CAD import depends on the importers in your delivery. Formats available on a developer machine are not automatically supported in every installation.

## Steps
1. Choose a file from the model entry point. Check format and size, then wait for loading to finish.
2. Inspect geometry, textures and hierarchy. Fit the view and make sure the camera is not inside the model.
3. Load referenced assets before export. Offline delivery requires embedded textures and self-contained resources.
4. To edit, enter the asset editing workspace and save read-only library assets as project copies.
5. Follow [Saving and backup](projects.md) before making a presentation.

## Expected result
The full model is visible, not placeholder geometry. The project owns the edited copy and the published library source remains unchanged. Validate the exported result on the recipient device.

## Robots, mechanisms and machining {#robots-mechanisms-machining}
Robots (RobotIK) in a model can be re-solved by dragging an IK target and move along linear (LIN) segments; every solution is checked against the robot's own joint chain, and a pose it cannot reach is shown as unreachable instead of being driven. The passive links of rigid-body mechanisms (KinematicMechanism) move with their drives. Machining workpieces (MachiningVolume) lose material where the tool moves, and `SignalReset` restores them. Inverse tracking and force analysis of mechanisms are not provided in this version; in models whose passive links are not marked as moving parts, those links may appear static in a normal load.

## Recovery
Handle empty files, corrupt GLBs, missing references and policy-blocked addresses separately. Try the bundled example to check the environment. Do not weaken network policy to bypass a failed download. A timeout does not prove a write did not happen; read back the project before repeating a save. Keep the failing page open and export diagnostics if needed.
