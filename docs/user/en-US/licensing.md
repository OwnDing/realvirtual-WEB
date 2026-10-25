---
doc_id: USER-LICENSING-EN-US
title: Licensing and unavailable features
status: approved
owner: product
last_reviewed: 2026-10-23
authority: normative
---

# Licensing and unavailable features

## Identify the cause
Unavailable features may result from deployment policy, access grants, read-only assets, browser capabilities or commercial license status. These are separate controls.

## Steps
1. Read the exact state and guidance. Record the software version and attempted operation.
2. Create a writable project copy before editing a read-only library asset.
3. Ask the administrator about deployment locks or account grants. Personal settings cannot relax deployment policy.
4. The administrator should check installation identity, host matching, validity and signature of the license file.

## Expected behavior
The current offline license contract provides a thirty-day grace period after expiry, retaining features with a banner and watermark, followed by read-only mode. It is contract evidence and an audit record, not browser hardware DRM. Each deployment must follow the approved license contract.

## Recovery
Do not change the system clock, delete data or modify a model to remove a license warning. Preserve work and export available diagnostics. If the environment lacks a capability, use a verified alternative workflow or validate it on the target device before use. See [Delivery](delivery.md) and [Product scope](overview.md).
