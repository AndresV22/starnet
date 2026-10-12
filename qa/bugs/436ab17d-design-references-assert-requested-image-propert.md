---
fingerprint: 436ab17d
slug: design-references-assert-requested-image-propert
title: Design references assert requested image properties as observed
surface: skills
severity: P2
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: 2e9c7ffb4
origin: audit
installer: unverified
recovery: unconfirmed
---

# Design references assert requested image properties as observed

## Symptom

An approved design reference can tell a later model that an image was wide, transparent, and matched a reference even when the saved result explicitly reports different dimensions, unverified transparency, or a reference fallback.

## Repro

Run the actual image tool with a local synthetic provider returning the fixture 1x1 PNG for aspect_ratio:16:9 and transparent:true. Approve/keep the work and inspect the next provider prompt. Separately return 404 for /images/edits and success for /images/generations to exercise the reference-not-used receipt. test/tasteref.http.test.js and test/image-reference.test.js cover these seams.

## Evidence

Before: live saved reference and next SYSTEM prompt said 16:9 and transparent for the square fixture. The production image tool receipt reports actual 1x1 and does not verify alpha. Actual-tool unit probe also found matching images/approved.png after /images/edits 404 fallback, although receipt says Reference NOT used. After: tasteref.http47, tasteref97 and image-reference44 pass. sidecar/tasteref.js:149 reads reported shape, positive alpha verification and reference-sent receipt; :244 suppresses v1 requested-only properties. A forged model caption cannot attest a host receipt.

Sanitized receipt: `qa/evidence/provider-deep-sweep-2026-10-11.json`.

## Regression

Before: live saved reference and next SYSTEM prompt said 16:9 and transparent for the square fixture. The production image tool receipt reports actual 1x1 and does not verify alpha. Actual-tool unit probe also found matching images/approved.png after /images/edits 404 fallback, although receipt says Reference NOT used. After: tasteref.http47, tasteref97 and image-reference44 pass. sidecar/tasteref.js:149 reads reported shape, positive alpha verification and reference-sent receipt; :244 suppresses v1 requested-only properties. A forged model caption cannot attest a host receipt.

## Verdict

Source repaired. New references are v2 and describe receipt-backed properties; reference sent does not claim the model matched it. Existing v1 references keep their useful file/prompt/model but no longer render unproved shape/alpha/reference fields. No real provider quality, image similarity or installer behavior was tested.
