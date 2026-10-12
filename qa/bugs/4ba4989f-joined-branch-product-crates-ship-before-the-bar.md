---
fingerprint: 4ba4989f
slug: joined-branch-product-crates-ship-before-the-bar
title: Joined branch product crates ship before the barrier releases
surface: world
severity: P2
status: fixed
found: 2026-10-12
lane: conveyor-caps-1012
fix: f88c461fb
origin: audit
affected: 0.13.2 source a20ffa71f
---

# Joined branch product crates ship before the barrier releases

## Symptom

A branch's product crate could reach the OUTBOX while its sibling was still running at the JOINER. Second Opinion shipped its first branch immediately; Swarm Synthesis shipped it after the eight-second handoff grace period even though the merged work had not reached the analyst.

## Repro

1. Stamp and crew Second Opinion or Swarm Synthesis. Start a job that performs a successful tool action in its first branch.
2. Hold another branch open for more than eight seconds. Observe product crates before the sibling returns.
3. On source a20ffa71f, the real compiled Second Opinion route spawned one product immediately; Swarm Synthesis spawned one when the 8000 ms deferred callback ran. No JOINER release had happened.
4. Run test/joined-product-truth.test.js for the compiled-floor, real-executor timing and identity regression. The actual-sidecar SSE capture used in browser replay is qa/evidence/conveyor-join-live-events-20261012.json.

## Evidence

The fix in 2b3544130 and bd4de9ae2 holds productive work on a JOINER-capable line until the backend emits an exact terminal receipt with its actual OUTBOX, entry run ID and successful hop work-item IDs. It does not infer delivery from elapsed time or a guessed content type. Only that job's observed productive work can authorize a crate. A talk-only sibling contributes its observed reconciled spend but never supplies productivity. The new authority receipt is ignored by throughput, lifetime, XP and learned-interest counters; their existing delivery events retain ownership of credit.

Actual running sidecar proof used a hermetic station and deterministic local fast/slow providers. Both agents performed a real successful fs_list. With the first stage done and the second held for 8.2 seconds, the production shipping functions emitted products=0. Releasing the sibling returned sample HTTP 200 with two clean runs, one terminal authority receipt, and products=1. Replaying the receipt left products=1. The event capture contains only synthetic station data and those actual SSE events, divided at the held-sibling boundary.

The integration lane then loaded that captured station through public World.loadStation into the actual seeded Chrome app at localhost:18971, replayed the real captured events through U.bus, and observed native Conveyor.enqueueAt calls. After the before-release events and an additional 8.3-second wait: before=0. After completion: after=1. Duplicate authority: afterEcho=1. Browser errors=[]. The product appeared at the actual OUTBOX inlet (47,8), dock p5, line p3. Its local browser receipts are .dogfood/conveyor-finish/join-browser.json and join-browser.cjs in the conveyor-finish-1012 integration worktree.

## Regression

The registered fast regression uses actual stamped Second Opinion and Swarm Synthesis floors, the compiler, router, executor and production world shipping functions. It covers slow sequential/parallel siblings, a downstream analyst, exact job IDs under overlap, productive job A while independent talk-only job B completes first, duplicate SSE receipts, reconnect without observed work, direct-order isolation and cost aggregation with talk-only siblings. A real compiled FILTER sends general output directly to one OUTBOX and code output toward a JOINER, proving that the general path still releases correctly. The same test exercises actual FloorStats, Pride, XP and ProfileStore consumers to prevent duplicate credit.

Focused verification passed: joined-product-truth, crate-honesty (24 assertions), chain-audit-1010 (43), floorstats (66), pride (26), XP (284). Shared event/schema files were unchanged; the existing workitem.delivered event accepts the same additive metadata pattern already used for dock identity.

Final overlap review found a further pairing hazard: two runs by the same agent on different JOINER lines can finish in reverse placement order. The initial FIFO attribution mislabeled both held runs and both exact receipts then released no product. Commit 781cafc7c uses the existing LineWatch run record for the recorded dock and line, and consumes only its matching work-item placement. An explicit watched null line remains a direct order. The regression places A and B before either finishes, ends B then A, and checks two correct OUTBOX products plus exact queue removal.

The running sidecar overlap proof used a real Run Now job A and concurrent sample job B at the same agent on two independently stamped Second Opinion lines. The local provider held A while B performed fs_list and completed: one product on B, with A still running. Releasing A produced the second product on A. Actual SSE plus the synthetic station document are preserved in qa/evidence/conveyor-join-overlap-live-events-20261012.json; beforeRelease contains completed B/pending A and afterRelease contains completed A. Targeted joined-product-truth, crate-honesty (24), and LineWatch (81) passed after the fix.

The final seeded Chrome replay of that overlap capture also passed: before=1 on B, after=2 on the respective OUTBOXes, afterEcho=2, errors=[]. Its portable result is qa/evidence/conveyor-browser-20261012.json.

A second integration review reproduced a duplicate-completion hazard: the first agent.run.end captured productive work and spend, then cleared per-run observations; its echo replaced that held record with a talk-only zero-cost record. Commit f88c461fb preserves the first held observation before consuming any placement. The regression invokes the actual completion listener and retains one product with .05 of observed productive-plus-talk-only sibling spend. The unchanged seeded Chrome replay duplicates each real captured agent.run.end before terminal delivery: rejected source produced zero products; repaired source returned before=0, after=1, afterEcho=1, errors=[].

## Verdict

Source-fixed, actual-sidecar and actual-browser event-handler verified. The floor creates one product at the executor-proven OUTBOX inlet after the whole joined job arrives. It does not reconstruct unseen productivity after reconnect or claim that a stopped job delivered. This is source acceptance, not an installer/publication claim; the integration lane owns combined gates and release acceptance.

## Sample completion identity coverage (2026-10-12)

The combined HTTP diagnostic at2c366fd8 found test/routing.sample.e2e.test.js selecting the new line-output authority receipt as if it were the sample crate completion. Actual sidecar proof reproduced1 failure/98 pass: the selector chose the first OUTBOX event, whose workitemId is intentionally distinct. The original sample completion still arrives with its exact entry workitemId and sample:true.

Test-only commitdd74c386f671afe16a6a746061063aa4db2ada36 selects by the response's exact workitemId and retains the original sample:true and frozen-schema assertions unchanged. Six additional checks cover the matching placed crate, one completion, distinct terminal authority identity, exact line/OUTBOX, successful downstream work item and independent schema validity. The full focused real-sidecar sample suite now passes105 assertions. The event trace in qa/evidence/conveyor-sample-delivery-20261012.json confirms authority first, sample completion second. There is no product/shared-contract change. Fresh combined gates remain owned by the release coordinator.
