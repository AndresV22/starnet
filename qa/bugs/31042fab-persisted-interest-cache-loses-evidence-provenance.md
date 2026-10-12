---
fingerprint: 31042fab
slug: persisted-interest-cache-loses-evidence-provenance
title: Persisted interest cache promotes activity without independent trusted evidence
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

# Persisted interest cache promotes activity without independent trusted evidence

## Symptom

Activity-derived topics persisted before provenance repair could reappear as TOPIC context after restart. Filtering only fresh activity did not remove authority from the old cache, and re-observing a contaminated slug could borrow its old label, count or quote.

## Repro

Run node test/interests.test.js, node scripts/run-test-list.mjs test/http.list scout.http and node scripts/run-test-list.mjs test/http.list scout.e2e. Seed legacy topics, a same-slug contaminated legacy topic plus clean trusted observation, paused personalization and forgotten state. Restart the real sidecar and inspect fresh provider prompts; separately run fresh activity through Scout learning.

## Evidence

sidecar/interests.js keeps an independent trustedTopics map and requires exact normalized quote evidence within one activity line when requested by the host. sidecar/index.js uses trustedOnly for all topic summaries and warm gates and feeds learning only trustedActivityLines; ordinary legacy run titles cannot mint trusted topics. Module tests cover full quote matching before clipping, cross-line refusal, saturated legacy capacity and independent labels/counts/quotes. Scout fixture commit 5b0ee506e preserves legacy negative controls while constructing warm fixtures through actual trusted parse/fold operations. Exact source hashes and final commands are in qa/evidence/memory-harness-audit-1011/coordinator-followups.json.

## Verdict

Fixed by e0a57f1bcb75facb7bd593fe0830da367c7da94d, host trusted reads in 2298d7a2c, independent activity projection in 55c618f6b74c152f93ebbdee20a54e5feaa36d96 and original-run origin proof in 6421e4c857a6f885d0c437e9e4d01168f92ba7db. Final production source passes test/interests.test.js (76 assertions), test/scout.http.test.js (61 assertions, four real boots/four fresh local provider requests) and test/scout.e2e.test.js (29 assertions). Legacy-only topics stay absent; clean same-slug evidence starts count one and survives restart; pause/forget still suppress context; fresh learning persists and stages a recipe.

## Limits

Legacy raw data remains on disk; this repair withholds its unproven authority rather than deleting user history. Trusted evidence does not establish real-model topic quality. Scripted local provider checks are not a competitor benchmark or installed-release acceptance. Combined full gates remain coordinator-owned.
