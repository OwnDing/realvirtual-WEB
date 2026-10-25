---
doc_id: USER-APPEARANCE-EN-US
title: Styles and materials
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Styles and materials

## Prerequisites
Open a complete model with WebGL. Material edits require the asset editing workspace and editable parts. Workbench lighting differs from the independent demo player.

## Steps
1. Open **Visual presentation → Scene style** and choose showroom, white product, dark stage, warehouse or technical sketch.
2. Adjust brightness, background, shadows and floor reflections while inspecting the actual model.
3. **Save as project default** writes the project setting. Personal templates stay in this browser and can be backed up as JSON.
4. In **Materials**, choose a base material, adjust color, metalness, roughness or opacity, and apply it to selected parts.
5. Inspect the result and undo/redo if necessary. Finish with **Save asset**.

## Expected result
Ordinary editable parts change appearance without unexpectedly changing unselected objects sharing a material. Preview cards are illustrations, not optical measurements.

## Recovery
Save read-only references as copies first. Textured, multi-slot and runtime-driven materials cannot be replaced using base materials. Narrow a mixed selection if it is rejected. Personal settings cannot bypass deployment locks. Recheck the save target after changing model or project.
