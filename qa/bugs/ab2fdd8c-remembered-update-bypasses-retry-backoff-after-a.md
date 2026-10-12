---
fingerprint: ab2fdd8c
slug: remembered-update-bypasses-retry-backoff-after-a
title: Remembered update bypasses retry backoff after a failed native check
surface: release
severity: P2
status: open
found: 2026-10-12
lane: agent/issue-triage-1011
fix:
origin: unknown
---

# Remembered update bypasses retry backoff after a failed native check

## Symptom

After StarNet remembers an available update and restarts, a failed native check repeats every second despite a stored exponential retry deadline. Restarting repeats the requests again.

## Repro

Run `node qa/evidence/deep-sweep-2026-10-11/update-backoff-live.mjs before` on a20ffa71f. The fixture starts an isolated seeded sidecar and real Chromium, remembers an available version, and makes only the native updater IPC fail. Observe automatic checks, manual CHECK NOW, and a page restart. The production planner regression is `test/updatecore.test.js`; the production UI scheduling regression is `test/update-center-truth.test.js`.

## Evidence

Committed receipts: `qa/evidence/deep-sweep-2026-10-11/update-backoff-before.json` shows three automatic calls within 3.3 seconds and two more after restart. `qa/evidence/deep-sweep-2026-10-11/update-backoff-after.json` shows one initial check, an immediate manual second check, no automatic call after restart, and zero browser exceptions. Before the repair, 15 planner and 5 UI assertions failed; after, updatecore107, update-center-truth28, and updates-install34 assertions passed.

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._
