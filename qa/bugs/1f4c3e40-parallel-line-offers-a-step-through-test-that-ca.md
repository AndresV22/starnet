---
fingerprint: 1f4c3e40
slug: parallel-line-offers-a-step-through-test-that-ca
title: Parallel line offers a step-through test that cannot finish
surface: world
severity: P2
status: fixed
found: 2026-10-11
lane: conveyor-finish-1012
fix: 30cbb0420
origin: audit
---

# Parallel line offers a step-through test that cannot finish

## Symptom

The test picker offered STEP THROUGH and RUN TO THE END on COPY/SPLIT and JOINER lines even though the one-crate tester stops at the parallel section. Earlier steps could already have spent money.

## Repro

1. Place PARALLEL CREW and crew its bays. Change its MERGER to JOINER (COPY TO EACH).
2. Open TEST, then STEP THROUGH. On a20ffa71f it offers START STEP-THROUGH with no limitation.
3. On the repaired source it defaults to RUN ONE REAL JOB and explains the limitation before execution. TRY THIS STEP still runs one bay.

## Evidence

test/routing.steptest.test.js executes real compiled templates: refusal makes zero runDock calls and creates no session; individual bay runs once; TAKE TURNS and unrelated lines stay available. Live seeded app at :18971 with original pinned panel reproduced the unsupported offer; current panel displays its reason, disables whole-line STEP THROUGH, and restores it after changing back to TAKE TURNS. No browser errors or native-painted controls. Local receipts: .dogfood/conveyor-finish/ui-before.json and ui-live.json.

## Verdict

Source repaired in 30cbb0420. Compiled line topology supplies one shared refusal to the panel and sidecar admission. Focused regression suites and live panel proof pass; combined gates are recorded in the conveyor finish digest. Installer acceptance remains unverified.


## Regression

Before: feature detection alone enabled whole-line step-through. After: a compiled fan-out/JOINER limitation refuses before any run; changing topology clears it. Existing single-step and sequential/LOOP tests remain green. Follow-up 43e32a761 derives the same refusal from persisted plans created before the new marker; regression proof removes the marker and still makes zero runDock calls.

## Sibling coverage

- Panel entry and control paint: live seeded UI receipt above.
- API start, individual bay, TAKE TURNS, unrelated lines, and changing topology: test/routing.steptest.test.js (fast).
- Multi-bay and restart behavior: test/routing.steptest.multibay.test.js and test/steptest-restart-spend.test.js (fast).
- Installed desktop: unverified; no installer built.
