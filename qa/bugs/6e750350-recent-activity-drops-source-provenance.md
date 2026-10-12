---
fingerprint: 6e750350
slug: recent-activity-drops-source-provenance
title: Recent activity drops source provenance and reintroduces attachment text after restart
surface: sessions
severity: P1
status: fixed
found: 2026-10-12
lane: agent/memory-harness-audit-1011
fix: 13357b5ac41a2d4311d84b6ed458ef93a2605174
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

Source repaired and focused live behavior verified. Known-tainted and quoted ordinary run titles are withheld. Chats require explicit clean provenance and exclude delegated/quoted material. Briefs require an exact bounded directive match on the same agent and stream to an eligible chat. Internal run titles remain negative matching metadata and are never rendered as activity. Trusted typed preference capture remains separate and survives restart. Full combined gates and installed acceptance are owned by the release coordinator and remain pending; no customer recovery or competitor quality win is claimed.

## Regression

The unchanged broad poison exclusion and typed-preference assertion pass after fixing the test observer to inspect every system message; a stronger assertion requires the typed preference inside recalled-memory. Final live receipt is bound to tested commit 856bb6026c45a1b7afaf22308efbba9fa24cd690, containing both production fixes: 10 completed runs, 2 actual uploads, 2 restarts, 3 attachment/quote learning receipts, no forged capture, no poisoned notebook or recalled system context. test/contextpack.test.js passes 104 assertions; test/nightshift-contextpack.e2e.test.js passes 19 assertions including six contamination sentinels and clean grounding. Root reran contextpack 104, untrusted-taint 86 and trusted-learning after integration.

## Sibling coverage

All three host inputs are behaviorally exercised against the actual extracted host function and real pure context pack. commanderEvidenceInputs consumes the filtered pack with personalization on and off; same-stream clean rows, exact agent/stream joins, completed-run ID changes, ordering, section caps and the bounded 400-row source window are covered. Ordinary task/restart and nightshift propose are exercised through real sidecar/provider wires. Delegated getTaskContext, internal evidence mode, quest and scout share this host pack by source inspection; each was not separately executed live.

## Limits

Legacy run rows without taintedBy remain compatible because run storage omits that field on clean records; this is not proof of historical owner authorship. Unknown-provenance transcript rows and unsupported completed briefs are withheld from ambient activity, not deleted from storage. The local scripted provider establishes harness boundary behavior, not real-model compliance or general learning quality. This patch does not claim all historical sources or unrelated evidence sections are sanitized.

