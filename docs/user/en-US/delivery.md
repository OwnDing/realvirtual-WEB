---
doc_id: USER-DELIVERY-EN-US
title: Delivery and access
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Delivery and access

## Choose a delivery mode
Offline HTML is suitable for on-site playback. Protected presentations suit sign-in, access expiry, revocation and server-side audit requirements. The two modes are not interchangeable.

## Deliver an offline file
1. Confirm distribution rights, export HTML and inspect file completeness.
2. Open it offline on the recipient device and verify geometry, text and shots.
3. Keep the original model and recipe so later edits can be exported again.

## Protected presentations
An administrator creates resources and access grants following the bundled runbook. Guests use the authorized link and sign-in method. Ask the administrator to check invalid links, expired or revoked access. Do not include credentials or link secrets in support screenshots.

## Result and limits
Offline files contain copyable model data and cannot expire or be revoked remotely. Protected presentations depend on the customer server and cannot make previously obtained copies disappear. Hiding a browser button is not a server authorization boundary.

## Recovery
Check identity and resource grants after authorization failure. Read back state after interrupted writes; do not assume a request was never executed. IT should investigate certificate or server reachability issues without disabling browser security. For playback failures, see [Support](support.md).
