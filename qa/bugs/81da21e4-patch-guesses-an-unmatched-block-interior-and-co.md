---
fingerprint: 81da21e4
slug: patch-guesses-an-unmatched-block-interior-and-co
title: Patch guesses an unmatched block interior and corrupts source
surface: safecell
severity: P1
status: fixed
found: 2026-10-11
lane: reliability-review-1011
fix: f0a53efb0
origin: audit
---

# Patch guesses an unmatched block interior and corrupts source

## Symptom

An agent supplies a multi-line edit whose interior does not match the file. The tool reports success but can leave orphaned statements and invalid JavaScript. A Windows file can also acquire mixed line endings after an LF-formatted patch.

## Repro

Run test/fs.patch.test.js against the pre-fix matcher at ddd4cbcfa. A function containing a nested if block is patched using a guessed validate(user) interior. The first closing brace is incorrectly accepted as the function boundary. A second case changes whitespace inside a quoted string. A multi-file case proves the earlier valid plan is committed when the later guessed hunk should refuse.

## Evidence

The original recovered audit identified peers-4. Fresh baseline pure-module reproduction returned ok:true, strategy:block_anchor, parses:false. The new regression suite produced 10 failures before the repair and 40 passing assertions after it. Local receipts: .dogfood/reliability-review/patch-before.log and patch-after.log. Code anchor: sidecar/tools/builtin/fuzzymatch.js:85 (baseline); regression anchor: test/fs.patch.test.js.

## Verdict

Source-fixed in f0a53efb0. Seeded live before/after proof confirms refusal, unchanged disk bytes, exact edits and CRLF. Full gate disposition is in qa/digests/2026-10-11-reliability-review.md. No installer or customer-recovery claim.

## Regression

Remove boundary-only and internal-whitespace matching; retain exact and equal-height edge-whitespace matching. Preserve the matched region's newline convention. Tests cover nested and equal-height guessed interiors, significant literal whitespace, multi-file preflight atomicity, corrected exact hunks, CRLF, and mixed-file untouched bytes. No wire schema, permissions, or shared contracts change.

## Sibling coverage

Adapters all call the same fs.patch implementation; no provider-specific fork is changed. The existing fast suite covers add/update/move/delete, multi-hunk preflight, ambiguity, path jail, indentation, and storage-fault receipts. Live seeded sidecar proof and full gate results are recorded in the lane digest. Installer and customer recovery remain unverified. Existing per-line reindentation and read-before-patch policy are outside this narrow repair.
