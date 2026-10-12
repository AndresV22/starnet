---
fingerprint: ecd03ee7
slug: token-overlap-attests-inverted-memory-as-owner-i
title: Token overlap attests inverted memory as owner instruction
surface: safecell
severity: P1
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: 05618ec62
origin: audit
installer: unverified
recovery: unconfirmed
---

# Token overlap attests inverted memory as owner instruction

## Symptom

A model can save the reverse of an owner preference and have the host label it the owner's own words, quote the contrary source sentence, and widen it to every conversation.

## Repro

On a20ffa71f, send "From now on, always use spaces instead of tabs for indentation." Let the synthetic provider call notebook_write with body "User prefers tabs over spaces for indentation" and pinned:true. Read /api/memory/records for that agent. test/memory-truth.http.test.js reproduces via the actual run/tool path.

## Evidence

Before: actual stored record body prefers tabs, confirmation user-stated, scope global, statedQuote "From now on, always use spaces instead of tabs for indentation". After: memory-truth.http passes; the inverted note remains unproven, scoped to its stream, with no false provenance receipt. Source 0426ed1f6 replaces overlap with ordered complete correspondence; review follow-up 05618ec62 prevents note-only always/now/future qualifiers from being erased. test/memory-truth.test.js passes 101 assertions covering reversed relations, negation scope, modifiers, alternatives, conditions, quotes, stronger qualifiers, positive paraphrase, taint and correction paths. sidecar/tools/builtin/notebook.js:77.

Sanitized receipt: `qa/evidence/provider-deep-sweep-2026-10-11.json`.

## Regression

Before: actual stored record body prefers tabs, confirmation user-stated, scope global, statedQuote "From now on, always use spaces instead of tabs for indentation". After: memory-truth.http passes; the inverted note remains unproven, scoped to its stream, with no false provenance receipt. Source 0426ed1f6 replaces overlap with ordered complete correspondence; review follow-up 05618ec62 prevents note-only always/now/future qualifiers from being erased. test/memory-truth.test.js passes 101 assertions covering reversed relations, negation scope, modifiers, alternatives, conditions, quotes, stronger qualifiers, positive paraphrase, taint and correction paths. sidecar/tools/builtin/notebook.js:77.

## Verdict

Source repaired conservatively: unsupported paraphrases stay inferred; no model-based semantic attestation was introduced. Source-only weakening supports the existing standing-preference paraphrase without strengthening a note. No migration or validation of historical notes is claimed. Installed build/customer recovery unverified.
