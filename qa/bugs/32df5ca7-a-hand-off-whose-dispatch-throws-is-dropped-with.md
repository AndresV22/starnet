---
fingerprint: 32df5ca7
slug: a-hand-off-whose-dispatch-throws-is-dropped-with
title: A hand-off whose dispatch throws is dropped with only a console line
surface: world
severity: P2
status: fixed
found: 2026-10-12
lane: conveyor-final-runtime
fix: e4586a54c
origin: audit
---

# A hand-off whose dispatch throws is dropped with only a console line

## Symptom

A SEND TO hand-off whose dispatch threw (the hub could not be built, or its entry threw) was dropped with only a console line, against the hand-off runner's own rule that every drop is said, and the target line's job record it had already started stayed "running".

## Repro

1. makeHub throws for the target line.
2. A job ships on the sending line.
3. Before e4586a54c the pump() catch in `sidecar/routing/handoff-runner.js` only pushed to the status list and warned.
Regression: `test/routing.handoff.test.js` dispatch-throw block (record stuck running before).

## Evidence

Fix e4586a54c: the record already started is finished with "the hand-off could not start (…)", otherwise the refusal path writes one; the unused item.files/item.input are gone, status() is stated as a diagnostic read, and line-shipments exports the one productive-work predicate line-stats reads. routing.handoff 88, line-stats 269, joined-product-truth, routing.triggers, conveyor-ease 80, station-layout 256 OK. Not live-proven (needs an injected hub fault).

## Verdict

Fixed in source on agent/conveyor-final-runtime (e4586a54c); unit-proven.
