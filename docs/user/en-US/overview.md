---
doc_id: USER-OVERVIEW-EN-US
title: Product and environment
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Product and environment

## Before you begin
This guide serves digital-twin presentation authors, recipients and customer IT teams. WebGL is the default. WebGPU is an optional Beta, not a performance guarantee. Consult the compatibility matrix shipped with this release for certified browser and hardware scope.

## Choose a workflow
1. Explore a model: open a self-contained GLB in the workbench, orbit, zoom and inspect its hierarchy.
2. Make a presentation: create a tour and export HTML. Recipients do not need the workbench.
3. Require identity checks or revocation: use protected presentations on the customer server. Offline HTML has neither capability.
4. Planner handles layout and assembly, HMI handles information and signals, and DES handles discrete-event modelling. This guide does not provide full training for those specialist workflows.

## Check your environment
Open the environment check in Settings → Diagnostics & support. Select your workflow and inspect graphics, storage and permissions. Passing probes establishes current capabilities, not full product certification. IT must configure secure contexts and enterprise certificates; do not disable certificate validation.

## Result and recovery
You should see the complete model and control the camera. For a blank canvas, missing assets or unavailable controls, start with [Diagnostics & support](support.md). Browser projects can be cleared or evicted, so keep independent backups. Continue with [Quick start](quickstart.md).
