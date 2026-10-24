---
doc_id: USER-TOURS-EN-US
title: Tours and offline HTML
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Tours and offline HTML

## Prerequisites
Load the complete model with resolved references and self-contained resources. This player does not include full HMI, arbitrary scripts, industrial connections, PDFs or DES. Models are limited to 128 MiB; the HTML is larger because of encoding and the player.

## Authoring steps
1. Open **Demo package** from the current document card's more menu. Use a perspective camera.
2. Capture the initial view, add shots and enter titles and descriptions.
3. Reorder shots, set transition and dwell times, and preview each shot.
4. Save a `.demo.json` recipe. To resume editing, open the matching model before loading the recipe.
5. Choose the language, export HTML and wait for the complete download.
6. Open the file offline on the recipient device. Test playback, drag takeover, replay and reset.

## Expected result
The model and camera tour run independently of the workbench. Dragging stops the tour. Hiding the page pauses playback; returning resumes it. A tour with no shots exports a free-view presentation. The player does not reproduce all workbench environment maps and post effects.

## Errors and cancellation
For invalid recipes, check version, shot count and durations. IT must redeploy matching player artifacts after build mismatches. Cancellation prevents late downloads. Retrying waits for existing encoding to finish instead of running concurrent encoders. Follow resource and script restrictions in error messages; an empty model is not a successful export.

![Actual tour editor](../media/tours.png)
