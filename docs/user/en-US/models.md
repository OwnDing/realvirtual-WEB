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

## Recovery
Handle empty files, corrupt GLBs, missing references and policy-blocked addresses separately. Try the bundled example to check the environment. Do not weaken network policy to bypass a failed download. A timeout does not prove a write did not happen; read back the project before repeating a save. Keep the failing page open and export diagnostics if needed.
