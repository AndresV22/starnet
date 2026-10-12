# Thread UX handoff — 2026-10-12

Frozen source candidate: a69664135e4983fe624ec11bea6b2bd4666ee651 on agent/thread-ux-review-1011, based on trunk a20ffa71f. All product edits are isolated. No trunk merge.

## User-facing changes

- Worker approvals show the full redacted request; questions use Answer and retain independent sibling attention. Failed submissions remain retryable, including concurrent phone answers.
- Worker files keep agent/project ownership, group attachments keep the message's version, and agent filters find delegated participation.
- Opening older work keeps its reading position and draft. Recovery preserves existing message nodes, open disclosures, focus and selected prose; narrow cards have no horizontal overflow.
- Worker outcomes retain verified stop/failure reasons and older recovery cannot settle a newer retry. Delayed assignments still produce one parent report.
- Structured results finalize after repair. Conversation recovery uses that accepted answer while exact-run inspection retains execution evidence. Long answers are recovered from the full finalized payload, never the bounded run-index preview.

## Verification

The final frontend has 29 focused node:test cases plus the component suite receipts listed in [regression-verification.json](regression-verification.json). Station commands: 229 assertions; delegated threads: 107; Workstreams: 212; navigation: 47. Storage/orchestration/transcript and adjacent suites also pass. All 36 changed JavaScript files pass syntax checks, all eight frontend mirrors match, and the diff is whitespace-clean.

Real-sidecar HTTP: 117 dispatch-session assertions pass, including blocked repair, a validated JSON result over 28,000 characters, full delivery reads, raw exact-run evidence, invalid results, restart, and unchanged execution count/spend. Both Overseer scenarios pass: delayed second assignment produces one report, and headless background work/report survives restart. These suites ran on 71c06fc3c; the frozen candidate only adds test-file line-ending normalization.

Live seeded browser edge proof: hidden worker recovery leaves reading position unchanged; inserting older accepted history retains the same message within 0.28125 pixels after 700 ms at the app's display scale. Disclosure, focused control, selection and draft remain. A 26,026-character recovered JSON answer appears once, stays valid, and retains its final marker. All eight served frontend SHA-256 hashes match the frozen source; zero page exceptions. These edge fixtures supply synthetic final-run/delivery endpoint responses; actual backend endpoint and restart behavior is proved by the separate real-sidecar suites.

The earlier live three-worker run, one lead report, approval/file/filter/navigation proofs remain in [verification.json](verification.json), bound to their original 09e6afba0 candidate. The new receipt supplements rather than relabels those observations.

## Integration limits

Full fast is NOT green: the last broad run passed 293/1140 steps, then failed Skill Market catalog checks because the sparse checkout lacks license/signature/zip fixtures. Full HTTP is NOT green: the last broad run passed 48/209 steps, then failed station-layout's offered-tool assertion. Auxiliary request selection is suspected but baseline causality was not proven. Both broad runs preceded the final regression fixes; complete combined gates remain required before integration.

Import the complete frozen candidate, including backend transcript/run storage and the delivery=1 endpoint. e89c85e20 was an intermediate frontend-only commit. Preserve newer coordination changes when merging; do not reset or rebase over them.

The audit entries are source-level fixes only. Customer record 082ee8e5 remains OPEN; original reported request acceptance, installed-build behavior and customer recovery are separate and unverified here. No installer, full-product, or release-readiness claim.
