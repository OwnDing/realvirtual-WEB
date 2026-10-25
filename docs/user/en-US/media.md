---
doc_id: USER-MEDIA-EN-US
title: Images and scene video
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Images and scene video

## Prepare
Use WebGL outside XR for media export. Scene video excludes web panels and audio. The tutorial videos are separate recordings of actual UI operations.

## Steps
1. In **Visual presentation → Export**, choose image size, framing and background.
2. Show the framing guide and adjust the camera. Only the framed area enters the output.
3. Export PNG or JPEG. Transparent output requires PNG and temporarily hides some floor and post-processing effects.
4. For video, choose manual, orbit or tour motion. Start recording and operate the camera after the countdown.
5. Choose **Stop and download** and open the file to inspect it. The browser prefers available MP4 encoding, otherwise WebM.

## Expected result
Images are rendered at the selected size. Video is silent scene capture, targeting 1080p/30 FPS; actual smoothness depends on the device. Clips are limited to three minutes and 256 MiB of encoded data. Required watermarks remain in the output.

## Recovery
If encoding is unavailable, check the browser or export an image. Reduce resolution for memory or size limits. Backgrounding stops recording and saves the existing clip. Cancellation, closing the panel or switching models releases resources without downloading. Check that the canvas is restored after errors, then consult [Support](support.md).
