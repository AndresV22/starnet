---
fingerprint: db8f361d
slug: kept-style-masks-a-later-real-rejection-after-un
title: Kept style masks a later real rejection after unkeep
surface: sessions
severity: P2
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: 2ce225f88
origin: audit
installer: unverified
recovery: unconfirmed
---

# Kept style masks a later real rejection after unkeep

## Symptom

A style kept before its first rating remains APPROVED in future prompts even after the user rates it missed and puts the style back. The user correction is mislabeled as something they liked.

## Repro

On source a20ffa71f, run a synthetic design, POST /api/taste/keep-style, POST /api/growth/ratings with verdict miss and correction wrong colors, then POST keep-style with undo:true. Start an unrelated task and inspect the actual provider request. test/tasteref.http.test.js exercises this exact sequence.

## Evidence

Before: live provider line was `APPROVED ... Design the arcade night flyer ... liked: "wrong colors"`. After: test/tasteref.http.test.js passed 44 assertions immediately after the fix and 47 with the later image assertions; the matching line is REJECTED and the correction remains. test/tasteref.test.js and test/feedbackmemory.test.js also pass. sidecar/feedbackmemory.js:102 records the actual verdict on updates.

Sanitized receipt: `qa/evidence/provider-deep-sweep-2026-10-11.json`.

## Regression

Before: live provider line was `APPROVED ... Design the arcade night flyer ... liked: "wrong colors"`. After: test/tasteref.http.test.js passed 44 assertions immediately after the fix and 47 with the later image assertions; the matching line is REJECTED and the correction remains. test/tasteref.test.js and test/feedbackmemory.test.js also pass. sidecar/feedbackmemory.js:102 records the actual verdict on updates.

## Verdict

Source repaired. Real ratings replace the synthetic keep-style verdict; later keep-style actions preserve real ratings and Commander-edited text. Source receipt only; installer and customer recovery remain unverified.
