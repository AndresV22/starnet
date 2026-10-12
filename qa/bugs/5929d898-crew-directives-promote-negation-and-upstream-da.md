---
fingerprint: 5929d898
slug: crew-directives-promote-negation-and-upstream-da
title: Crew directives promote negation and upstream data to owner intent
surface: autonomy
severity: P1
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: 86e617e46
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
