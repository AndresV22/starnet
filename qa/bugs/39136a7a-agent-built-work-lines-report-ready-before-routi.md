---
fingerprint: 39136a7a
slug: agent-built-work-lines-report-ready-before-routi
title: Agent-built work lines report ready before routing publication
surface: world
severity: P1
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: dd731e1a191197de95a7ab1c04a9847e9f0e4cdd
origin: audit
---

# Agent-built work lines report ready before routing publication

## Symptom

After an agent builds a staffed work line, its receipt says ready and the floor contains it, but immediately testing or scheduling it refuses with "no armed work line is named p12" or "line SHIP IT is not armed yet". The aggregate HTTP gate hit the same six assertions twice; a standalone rerun passed once.

## Repro

1. Run `test/station-builder.e2e.test.mjs` with installed Chromium and the normal isolated seed. This uses a local mock model, never an account or the user's station.
2. After the page's initial routing plan settles, call `World.stop()` with Build mode closed. This deterministically withholds the animation frame that would normally rederive the routing plan.
3. Through the real model/tool/bridge path, plan and build a staffed Build + test line called SHIP IT.
4. Read the build receipt, document, `World.planStatus()` and scratch workspace `routing.plan.json`. Immediately call station.test_line, then station.start_line for a schedule and webhook.
5. On the parent source, the document holds intake p12 and receipt says built/ready, while World is pending and the persisted plan has no lines. One explicit `World.syncPlan()` then makes the same test_line deliver without another floor mutation.

## Evidence

- Before source: own merge `65c9d632a` of `ddd4cbcfa` plus the unrelated erase fix. A controlled seeded Chromium run held World.stop before build and reproduced all six original test_line/schedule/webhook/off failures.
- Before: World had pending=true, hash=7cc42668, no compiler errors and no in-flight post. Persisted routing.plan.json had hash=7cc42668, lines=[], sources=[]. The document held SHIP IT/p12 and the build returned built=true, ready=true.
- Causal control: explicit World.syncPlan alone published hash=be733148 with SHIP IT/p12 and p12-p16. The identical station.test_line then returned status=delivered and the fenced mock output. This establishes the unpublished mutation, not merely slow gate timing.
- After: tracked `test/station-builder.e2e.test.mjs` now holds World.stop before build and checks the persisted routing plan at the ready receipt. It passed the whole real Chromium + seeded sidecar fixture (122 local mock calls; no page exceptions). Receipt hash and persisted hash were both be733148, lines included p12, and pending/inflight/stale/refused were clear.
- Local detailed receipts (sanitized test data): `.dogfood/runtime-triage/station-builder-held-before.log`, `station-builder-held-after.log`, and `station-builder-publication-before.log`. The tracked fixture and these recorded observations make the proof reproducible without retaining machine-specific workspaces.
- Source anchors: `frontend/app/stationcommands.js` station.build previously returned StationBuilder.apply's structural readiness without awaiting World.syncPlan. `frontend/app/world.js` station onChange sets geoDirty and its animation frame calls rederive. `sidecar/tools/builtin/station.js` station.test_line reads line_ref then asks the already-published router.

## Verdict

Source repair `ad003230c055661a35ffb3573db855beeed4d429` and exact-floor acknowledgment follow-up `dd731e1a191197de95a7ab1c04a9847e9f0e4cdd` passed the focused real seeded-app regression. Aggregate integration verification remains with the integration owner. The mutation now waits for World.syncPlan within 3.5 seconds and requires a matching acknowledged hash with no dirty, refused, stale, pending, retry or in-flight state. The expected topology hash and full poster key are pinned immediately after synchronous rederive; a later topology or capability change cannot make the earlier build appear ready. A failure keeps built=true and the undo receipt, adds routing.published=false with its reason, and downgrades ready on the result and each returned line. Read-only commands are unchanged. Later manual floor edits and unrelated dispatch paths are outside this repair. No installer, deployment or customer recovery claim is made.

## Regression

`test/station-builder-publication.test.js` executes the real page command and ack path. Before the repair, 31 assertions failed; after the repair and additional hash checks, all 73 passed. It covers held publication, a deadline below the six-second bridge limit, stale/inflight/retry/refusal/compiler errors, unavailable/throwing/rejecting publication, acknowledged hash mismatch, changes during the await, multi-line readiness, structural blockers, consumed plans, and failed floor application.

The concurrent-edit follow-up first failed two readiness assertions on the initial repair, then passed with the expected hash/key pinned. The full real seeded Chromium fixture passed again after this follow-up (122 mock calls, no page exceptions). Independent exact-object peer review found no remaining blocking issue.

Focused siblings passed: station-commands 147 assertions, station-layout 253, station-builder 5535, station-tools 80, and plan-poster 56. The live fixture retains undo, restore-previous, room/recruit/restyle/refit/design and readback coverage in addition to the six formerly failing work-line checks. No full fast/HTTP gate was run in this lane; the integration owner owns that gate.

## Sibling coverage

{"adapters":[{"target":"page to sidecar station bridge","state":"covered","test":"test/station-builder.e2e.test.mjs","scenario":"real seeded browser build receipt follows acknowledged routing plan","gate":"http"}],"entrypoints":[{"target":"station.build","state":"covered","test":"test/station-builder-publication.test.js","scenario":"successful floor mutation survives publication refusal and timeout as built true / ready false","gate":"fast"},{"target":"station.line_ref and station.map","state":"covered","test":"test/station-builder-publication.test.js","scenario":"queries never publish or apply mutations","gate":"fast"},{"target":"station.layout","state":"covered","test":"test/station-layout.test.js","scenario":"read-only layout stays nonmutating","gate":"fast"}],"displays":[{"target":"real Chromium page and tool receipt","state":"covered","test":"test/station-builder.e2e.test.mjs","scenario":"Workflow agrees with the built line and its actual delivery","gate":"http"},{"target":"installed desktop and customer machines","state":"blocked","reason":"Only source-seeded local Chromium was exercised; no installer or customer retest."}],"lifecycle":[{"target":"one-use plan / undo / restore previous","state":"covered","test":"test/station-builder.e2e.test.mjs","scenario":"existing complete builder lifecycle retained and passing","gate":"http"},{"target":"held animation frame and publication deadline","state":"covered","test":"test/station-builder-publication.test.js","scenario":"publication is explicit, bounded and does not repeat a successful mutation","gate":"fast"}]}
