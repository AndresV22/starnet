---
fingerprint: 670332ae
slug: step-through-stops-on-two-review-loops-in-a-row
title: STEP THROUGH stops on two review loops in a row
surface: world
severity: P2
status: fixed
found: 2026-10-12
lane: conveyor-final-runtime
fix: 3caf05fea
origin: audit
---

# STEP THROUGH stops on two review loops in a row

## Symptom

STEP THROUGH on a line with two review loops in a row, both sending work back to the drafter, stopped with "the test stopped before style: the line loops back to style" on the outer loop's second pass, while RUN ONE REAL JOB finished the same line. The test reported a line fault that does not exist.

## Repro

1. drafter > factcheck > LOOP1 > style > LOOP2 > publisher > OUTBOX, both back lanes to the drafter.
2. STEP THROUGH with pause none; LOOP2 says revise once.
3. Before 3caf05fea `sidecar/routing/steptest.js` resolveNext set `looping = d.again`, so LOOP1 letting work out closed LOOP2's pass too.
Regression: `test/routing.steptest.test.js` two-gate case (3 failures before).

## Evidence

Fix 3caf05fea: the step test keeps the open gates per gate (openLoops, a plain object that survives the JSON-cloned, persisted walk state); a session saved before keeps its old flag. routing.steptest 175, routing.steptest.multibay 28, steptest-restart-spend 21 OK. Live on the isolated station (real model): Line S, session st_a2b34c88-2b1 state done, hops p50 > p52(approved) > p54 > p55(revise) > p50 > p52(approved) > p54 > p55(revise), exhausted to the OUTBOX. C:\Users\andro\gen-trees\_final-shots\wave2-runtime\b01-b02-live-evidence.json.

## Verdict

Fixed in source on agent/conveyor-final-runtime (3caf05fea).
