---
fingerprint: 2d0597b0
slug: conveyor-shipped-counts-stages-and-changes-with
title: Conveyor SHIPPED counts stages and changes with floor edits
surface: autonomy
severity: P1
status: fixed
found: 2026-10-12
lane: agent/conveyor-stats-1012
fix: 6bbc690c9
origin: audit
---

# Conveyor SHIPPED counts stages and changes with floor edits

## Symptom

A COPY/JOINER line could count several shipped jobs when its branches completed one job. Removing its OUTBOX could then erase past shipments from today's count.

## Repro

Stamp PARALLEL CREW, crew each bay, and swap its MERGER for a JOINER. Complete a productive job across all three branches. Read SHIPPED, then remove the OUTBOX and read it again. The three branch runs represent one shipment, and an edit cannot undo that historical event. The executable regression is test/line-stats.test.js.

## Evidence

Against source a20ffa71f, the real WorldModel blueprint/compiler/router combination counted three productive branch rows as three shipments, then zero after removing its OUTBOX. The repaired fold returns one before and after. Production records a durable receipt only at the chain's actual terminal OUTBOX callback, keyed by exact line and entry run, after confirming clean productive run evidence. It never invents receipts for old runs.

Focused verification: line-stats 96 assertions, routing.handoff 76, chain-audit-1010 43, splitter-divide 67, channels.hub 163, cron.chain 67, existing real-sidecar routing.linestats 23. Backend determinism and changed-file syntax passed. test/routing.handoff.e2e.test.js passed through the real sidecar: talk-only SHIPPED=0; an actual fs.write job SHIPPED=1; removing its OUTBOX leaves SHIPPED=1; restarting the sidecar retains SHIPPED=1. The fixture uses a local deterministic provider and no paid service.

## Regression

The old implementation incremented per successful productive run if the current router said its dock reached an OUTBOX. The fix folds persisted terminal-job receipts instead. Regression coverage includes joined branches, repeated loop-stage rows, idempotent callbacks, adjacent channel jobs with identical timestamps, absent historical evidence, unclean/test/workless runs, save failure, bounded run-list history, changed topology and real restart.

## Sibling coverage

{
  "adapters": [{"target":"shared chain runner","state":"covered","test":"test/routing.handoff.test.js","scenario":"exact entry-run identity on terminal callback","gate":"fast"}],
  "entrypoints": [{"target":"sample and SEND TO","state":"covered","test":"test/routing.handoff.e2e.test.js","scenario":"productive file job and downstream routing","gate":"http"},{"target":"scheduled chain","state":"covered","test":"test/cron.chain.test.js","scenario":"exact entry-run identity reaches chain","gate":"fast"},{"target":"channel chain","state":"covered","test":"test/channels.hub.test.js","scenario":"routed entry and downstream stages remain compatible","gate":"fast"},{"target":"Run Now","state":"blocked","reason":"Identity is wired from its existing runId; dedicated productive shipment UI acceptance remains for combined verification."}],
  "displays": [{"target":"routing statistics endpoint","state":"covered","test":"test/routing.linestats.e2e.test.js","scenario":"run/failure counts and window semantics remain intact","gate":"http"},{"target":"native installed floor/panel","state":"blocked","reason":"Source repair only; installer acceptance belongs to the release lane."}],
  "lifecycle": [{"target":"restart and floor edits","state":"covered","test":"test/routing.handoff.e2e.test.js","scenario":"remove OUTBOX and restart without changing past shipment count","gate":"http"},{"target":"failed storage and callback replay","state":"covered","test":"test/line-stats.test.js","scenario":"durable-save failure does not publish a count and duplicate callbacks are idempotent","gate":"fast"}]
}

## Verdict

Source-fixed and real-sidecar verified. Existing history without terminal receipts is not reconstructed from today's geometry. Follow-up storage review found that a failed initial receipt read could cache an empty history and overwrite it after recovery. The regression failed five assertions before the repair; load status is now checked, failed loads remain retryable, and writes fail closed until existing receipts are readable. Real-sidecar fault proof returned an error rather than zero for an invalid envelope, completed work without overwriting it, and recovered the saved count on the next poll after restoration. Combined fast/HTTP gates, UI acceptance and installer verification remain separate; no publication claim.
