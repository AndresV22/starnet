---
fingerprint: 4c0efd8c
slug: saved-station-opening-is-blocked-despite-a-reach
title: Saved station opening is blocked despite a reachable engine
surface: sessions
severity: P1
status: open
found: 2026-10-12
lane: memory-proof-1011
fix:
origin: customer
report: support-2026-10-08-saved-station-save-net
affected: Reported StarNet 0.13.1 Windows, build e0a36dcd3; exact installer artifact unverified
family: saved-station-load
installer: unverified
recovery: unconfirmed
---

# Saved station opening is blocked despite a reachable engine

## Symptom

Opening an existing station stops at SAVE-NET / SAVE REQUEST LOST. The customer reports that the app loaded and GET /api/health answered, but the saved-station request did not return and GET /api/diagnostics returned nothing. Workspace files remain visible. This does not establish data loss or file integrity.

## Repro

Customer-reported operation, not a local causal reproduction:
1. Open the affected saved station in the reported Windows installation.
2. Preserve the SAVE-NET state and correlate the exact saved-station request, status, timing and native startup/auth context.
3. On a disposable copy only, verify successful open, restart and reopen while preserving station bytes.
Do not reset or reinstall away the evidence; a health response alone does not prove saved-state loading.

## Evidence

Original October 8, 2026 7:59 p.m. America/New_York report was cross-checked against retained private intake on October 12. The customer names build e0a36dcd3 and source-tree marker 63fcf3973231, a reachable health endpoint, no page errors, and no saved-station response. Installation on another drive is context, not a demonstrated cause. Attachments were not independently inspected in this reconciliation. The residual audit found no later recovery reply in its targeted search; that is not proof of continuing failure.

Deduplicated against lane HEAD e1bf891de and coordinator 003a8b6c5. Records 25de9a74 and 34c58f4f concern related save-integrity paths; neither establishes this cause. The engine-before-listening startup incident 85f602c4 is distinct. More accurate health reporting in 0.13.2 is not proof of recovery.

Investigation anchors: frontend/app/app.js, test/cloudsave-timeout.test.js and test/save-unreadable.http.test.js. These locate recovery/request boundaries, not a passing customer reproduction. Missing evidence includes the failed request status and timing, exact workspace/resource paths, correlated logs, current-build retest and artifact hash. No source fix or installed/customer recovery is claimed.

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._

## Regression



## Sibling coverage
