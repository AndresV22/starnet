---
fingerprint: 6e750350
slug: recent-activity-drops-source-provenance
title: Recent activity drops source provenance and reintroduces attachment text after restart
surface: sessions
severity: P1
status: fixed
found: 2026-10-12
lane: agent/memory-harness-audit-1011
fix: 6421e4c857a6f885d0c437e9e4d01168f92ba7db
origin: audit
installer: unverified
recovery: unconfirmed
---

# Recent activity drops source provenance and reintroduces attachment text after restart

## Symptom

A fresh conversation after restart received synthetic uploaded-file and quoted preference text as RECENT ACTIVITY in its system context while the new run reported no taint. Initial trusted preference capture correctly excluded those bytes from the notebook. This is independent audit finding R20, not an attributed cause or recovery of a customer incident.

## Repro

Run node test/memory-learning-boundary.http.test.js. The fixture starts the real sidecar with an isolated temporary workspace and a scripted local provider, uploads files through POST /api/attachments, submits file-only and typed-plus-file runs with forged provenance fields, submits a quoted control, restarts the sidecar, then captures every system-role provider message from a fresh stream. The legitimate typed preference must occur inside the actual recalled-memory block; uploaded, quoted and forged markers must occur in neither system context nor memory records.

## Evidence

Before: test commit 7e23fda402382f025881d46443b515e57d2e5d94 failed with UPLOADED_POISON_SENTINEL and QUOTED_POISON_SENTINEL in commander evidence RECENT ACTIVITY. Bounded exact excerpts and final live output are retained in qa/evidence/memory-harness-audit-1011/r20-attachment-context-live.json; the original full red log was not saved. sidecar/index.js:7698 nightshiftContextPack projected runs, chats and completed briefs without preserving their provenance. The new-stream replay guard could not recover provenance lost into a cross-stream system block. Source repair 2d865ad7cea185c6db187d8002d09c2e05364388 filters before projection; follow-up 13357b5ac41a2d4311d84b6ed458ef93a2605174 retains internal titles solely as exclusion markers after later tool taint.

## Verdict

Source repaired and focused live behavior verified. Known-tainted and quoted ordinary run titles are withheld. Chats require explicit clean transcript provenance plus matching original run metadata: explicit non-internal owner origin, matching agent/stream, and no delegation, cron or recovery origin. This lookup uses durable runStore.all(), independent of the latest 60 run-title window. Briefs additionally require immutable original occurrence identity and are deduplicated by that identity. Internal titles remain exclusion metadata. Trusted typed preference capture survives restart. Full combined gates and installed acceptance remain coordinator-owned and pending.

## Regression

Final unchanged attachment/restart proof is bound to tested production source 6421e4c857a6f885d0c437e9e4d01168f92ba7db in qa/evidence/memory-harness-audit-1011/r20-attachment-context-live.json, evidence commit 07effc497e46d8ceed2a4169e9241d7a62fa160f. The test inspects every system-role message and requires the legitimate typed preference inside recalled-memory. It covers 10 completed HTTP phases, 2 actual uploads, 2 sidecar restarts and 3 attachment/quote learning receipts. test/contextpack.test.js passes 164 assertions, including internal origin outside the latest 60 runs, genuine older owner activity, missing/wrong-origin exclusions and later completion taint. test/nightshift-contextpack.e2e.test.js passes 19 assertions with real sidecar/provider requests. Current exact source and test hashes are recorded in coordinator-followups.json.

## Sibling coverage

The actual extracted host function and real context pack exercise all three activity sources. commanderEvidenceInputs consumes the filtered pack with personalization on and off. Ordinary task/restart and nightshift propose use real sidecar/provider wires. Scout HTTP and end-to-end tests also exercise the independent trustedActivityLines learning projection and durable trusted topic cache. Other shared consumers (delegated/internal evidence and quest) are verified by source inspection, not each separately executed live.

## Limits

Ordinary activity retains legacy run rows without taintedBy for compatibility; absence of taint is not historical owner proof. Such ordinary run titles are excluded from the separate trustedActivityLines projection used to learn new interests. Unknown original-run metadata is conservatively withheld from owner chat/brief projections, not deleted from storage. See canonical cache finding 31042fab and repeat-work finding 2b0d8101. Scripted local providers prove harness boundary behavior, not real-model quality, installed customer recovery or sanitation of every unrelated evidence section.
