---
fingerprint: cc760146
slug: send-to-loses-producing-workspace-for-relative-f
title: SEND TO loses producing workspace for relative file artifacts
surface: autonomy
severity: P1
status: claimed
found: 2026-10-11
lane: agent/session-handoff-1011
fix:
origin: audit
---

# SEND TO loses producing workspace for relative file artifacts

## Symptom

A downstream SEND TO job could be given a relative artifact path without the producing agent workspace, so it could look for the file in the wrong directory.

## Repro

Run test/routing.handoff.test.js with a completed producer run whose artifact path is relative and whose projectRoot or private workspace differs from the receiving agent. Inspect the handoff item artifacts.

## Evidence

The regression against 34133606b produced 2 failures and 73 passes; after 1428c8b11 it passes all 75 assertions. Cases cover project and private roots, Windows drive and UNC paths, absolute preservation, deduplication and refusing an unknown origin. Logs are retained locally in .handoff/runtime-paths-before.log and .handoff/runtime-paths-after.log. This proves the routing transport contract, not a model reading the file in the live app.

## Verdict

Claimed by the recovery lane. Source repair implemented; live app and combined-gate acceptance remain pending.
