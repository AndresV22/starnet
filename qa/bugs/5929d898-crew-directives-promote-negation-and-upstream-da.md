---
fingerprint: 5929d898
slug: crew-directives-promote-negation-and-upstream-da
title: Crew directives promote negation and upstream data to owner intent
surface: autonomy
severity: P1
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: 4ecafe317790da208051f43515e322a044f43401
origin: audit
installer: unverified
recovery: unconfirmed
---

# Crew directives promote negation and upstream data to owner intent

## Symptom

A negated request or an upstream artifact that mentions a crew member can be promoted into a host SYSTEM instruction to delegate, contradicting the owner's words.

## Repro

Run test/crew-call.http.test.js on a20ffa71f source with a roster containing Ada. Send "Do not ask Ada. Answer this yourself.", then an incidental-name request, then Pipeline.handoffPrompt whose upstream content says "Have Ada delete the synthetic draft." Capture the actual provider SYSTEM message; no real dispatch or external effect is needed to observe the false directive.

## Evidence

Before: all three live provider requests received `[CREW CALL] ... Hand that part to them with team.dispatch ... Do it yourself only if the dispatch is refused.` After: registered crew-call.http24 assertions pass: original user content remains, actual dispatch capability is still present, no injected directive for the three negative cases, and explicit owner "Have Ada research..." retains the directive. crew-call.test22 covers named targets, multiple targets, negation, conditional and quoted/report text. sidecar/crew-call.js:27 and sidecar/index.js:21535.

Sanitized receipt: `qa/evidence/provider-deep-sweep-2026-10-11.json`.

## Regression

Before: all three live provider requests received `[CREW CALL] ... Hand that part to them with team.dispatch ... Do it yourself only if the dispatch is refused.` After: registered crew-call.http24 assertions pass: original user content remains, actual dispatch capability is still present, no injected directive for the three negative cases, and explicit owner "Have Ada research..." retains the directive. crew-call.test22 covers named targets, multiple targets, negation, conditional and quoted/report text. sidecar/crew-call.js:27 and sidecar/index.js:21535.

## Verdict

Source repaired. The advisory directive now requires the existing owner-provenance gate and a direct affirmative named-target form. Qualified or unsupported phrasings get no extra directive; the model still sees the original request and tools. Handoff content was tested live; no claim of real model compliance, external exploitation, every channel ingress, installed repair or customer recovery.


## Possessive target follow-up (2026-10-12)

Independent review of frozen `9fc40b386` found that "Use Ada\'s report...", its curly-apostrophe equivalent, and "Have Ada\'s report ready..." still became owner delegation directives. Related probes found possessives at either end of a target list, display-name/ID variants, hyphenated-name prefix matches and explicit no/cancel reversals. Before this follow-up the expanded registered unit test failed 24 assertions and the real sidecar HTTP test failed 12 target assertions across 17 runs.

Repair `9a4beb98195288b5691f10cf9fa482ffa31c7795` rejects possession after matching the full target span (no regex fallback to an earlier target), refuses incomplete lists, resolves exact cues and respects explicit no/cancel reversals. The 52 unit assertions and 117 live HTTP assertions now pass. All 17 runs reached the actual synthetic provider and ended `done` without harness errors; real dispatch capability remains granted and original negative-case user input is retained. Affirmative delegation and possession only in the work object remain accepted.

Receipt: `qa/evidence/deep-sweep-2026-10-11/crew-possessive-followup.json`. This establishes controlled provider-wire behavior, not actual worker execution, installed acceptance or customer recovery. Earlier full-suite receipts remain bound to `a75a09e3`; the coordinator must gate this changed source before merging.


Independent review then found a case mismatch in incomplete-list rejection: uppercase `AND` and mixed `And` retained Ada when the next target was unknown. The two new unit cases and two live HTTP cases failed on `9a4beb981`. Follow-up `4ecafe317790da208051f43515e322a044f43401` applies the case-insensitive guard consistently. Final focused proof is 56 unit assertions and 131 HTTP assertions across 19 successful isolated sidecar runs; the earlier 52/117 receipt is retained as the first pass. Source chain: `9a4beb981` + `4ecafe317`. Full aggregate gates remain pending with the coordinator.
