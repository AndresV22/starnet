---
fingerprint: cc760146
slug: send-to-loses-producing-workspace-for-relative-f
title: SEND TO loses producing workspace for relative file artifacts
surface: autonomy
severity: P1
status: fixed
found: 2026-10-11
lane: agent/session-handoff-1011
fix: 1428c8b11
origin: audit
---

# SEND TO loses producing workspace for relative file artifacts

## Symptom

A downstream SEND TO job could be given a relative artifact path without the producing agent workspace, so it could look for the file in the wrong directory.

## Repro

Run test/routing.handoff.test.js with a completed producer run whose artifact path is relative and whose projectRoot or private workspace differs from the receiving agent. Inspect the handoff item artifacts.

## Evidence

The regression against 34133606b produced 2 failures and 73 passes; after 1428c8b11 it passes all 75 assertions. Cases cover project and private roots, Windows drive and UNC paths, absolute preservation, deduplication and refusing an unknown origin. Logs are retained locally in .handoff/runtime-paths-before.log and .handoff/runtime-paths-after.log. The expanded test/routing.handoff.e2e.test.js now passes on the real isolated sidecar: after settling the Task Brief, the producer writes handoff-note.txt and the downstream terminal run receives its exact absolute producer path. This does not claim that a downstream private-workspace file tool can read another agent private files.

## Verdict

Source repair and real producer-file/downstream-prompt scenario pass. Combined full gates remain required before trunk integration; cross-agent file permissions are unchanged.
