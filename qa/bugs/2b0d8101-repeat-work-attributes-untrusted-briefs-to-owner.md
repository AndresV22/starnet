---
fingerprint: 2b0d8101
slug: repeat-work-attributes-untrusted-briefs-to-owner
title: Repeat-work evidence attributes untrusted or duplicate task briefs to the owner
surface: autonomy
severity: P1
status: fixed
found: 2026-10-12
lane: agent/memory-harness-audit-1011
fix: 6421e4c857a6f885d0c437e9e4d01168f92ba7db
origin: audit
installer: unverified
recovery: unconfirmed
---

# Repeat-work evidence attributes untrusted or duplicate task briefs to the owner

## Symptom

Repeated-work suggestions and standing-work context could count untrusted completed briefs as repeated owner requests. A single later clean message with matching text could also validate several older occurrences. This is an independent synthetic finding, not an attributed customer incident.

## Repro

Run node test/workflow-takeover.test.js and node scripts/run-test-list.mjs test/http.list workflow-takeover. The tests construct three-day completed histories that the unchanged pure repetition matcher qualifies, then exercise the actual host candidate filter and authenticated HTTP route. Vary original input provenance, sourceRunId, agent, stream and immutable occurrence identity; independently supply later completion metadata.

## Evidence

sidecar/trusted-learning.js now shares cleanOwnerRows and ownedBriefs between the actual standingWorkNotice, workflowTakeoverCandidates and activity host paths in sidecar/index.js. sidecar/taskbrief-store.js persists originalRunId from the original host input and retains it across completion/recovery. Fixtures at ef6a7bc2fd02544e488bcb4b878800473f59fa1b cover partial/full occurrence joins, duplicates, taint, quotes, missing/internal origin, wrong agent/stream and genuine clean controls. Commands and exact hashes are in qa/evidence/memory-harness-audit-1011/coordinator-followups.json.

## Verdict

Fixed by original occurrence binding in 63bd35532 and durable original run lookup in 6421e4c857a6f885d0c437e9e4d01168f92ba7db. Three eligible originals count as three, one counts as one, and absent original proof counts as zero. A clean original is not invalidated merely because a later research/completion run becomes tainted. test/workflow-takeover.test.js passes all eight reported sections and test/workflow-takeover.http.test.js passes real API filtering, review, concurrent create, pause, forget and restart controls.

## Limits

Standing-work SYSTEM insertion is verified against the actual extracted host function with real modules, not a captured provider wire for that specific notice. Candidate-route lifecycle is real sidecar HTTP. Arbitrary legacy brief IDs without original identity and missing run metadata are conservatively withheld. Full combined gates and installed acceptance remain pending.
