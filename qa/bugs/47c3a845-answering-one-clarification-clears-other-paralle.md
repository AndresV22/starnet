---
fingerprint: 47c3a845
slug: answering-one-clarification-clears-other-paralle
title: Answering one clarification clears other parallel approvals
surface: channels
severity: P2
status: fixed
found: 2026-10-11
lane: agent/ux-triage-1011
fix: 444bfa1248caf786aab9ed53924969bddbd90916
origin: audit
report: Authorized deep sweep of combined post-v0.13.2 source
affected: Source a20ffa71fd on Windows seeded Chromium; installed build not tested
family: frontend-state-ordering
installer: unverified
recovery: unconfirmed
---

# Answering one clarification clears other parallel approvals

## Symptom

Answering a question on a lead conversation can remove an unrelated background worker approval from local pending state while the sidecar is still waiting for that approval.

## Repro

Dispatch a background worker that asks for fs.write permission while the interactive lead asks a brief.ask question. Answer the question. Baseline clarifyRow calls Channels.clearPending without promptId and clears both asks. Choice, free-text conversation and response from another surface share the defect. See test/consent-full-request.test.js.

## Evidence

Baseline a20ffa71fd with the new regression failed all three added prompt-isolation tests. Current 10 tests pass. The real seeded fixture in qa/evidence/frontend-deep-sweep-2026-10-11/live.json had simultaneous lead brief.ask and worker fs.write, answered Blue, retained the worker ask and denied it independently before the lead settled. Source anchors: frontend/app/chat.js:3355, frontend/app/chat.js:3393 and frontend/app/chat.js:3467.

## Regression

All question resolution paths now clear only p.promptId; other asks and paused time remain. A defensive Delegated control renders Answer for an attributed brief.ask and focuses the exact existing question card, rather than submitting approval grades. test/delegated-threads.test.js passes 92 assertions. Live Answer navigation is explicitly controlled attribution on a real interactive question; it does not establish naturally interactive autonomous workers.

## Verdict

Source fixed for the reproduced parallel prompt loss; focused/live lane proof passed. No backend authority expansion. Autonomous workers intentionally do not receive askCommander, so no native-worker question regression or recovery is claimed.

## Sibling coverage

{
  "adapters": [
    {
      "target": "local synthetic OpenRouter-compatible provider",
      "state": "blocked",
      "reason": "Live fixture verifies real sidecar behavior with deterministic local model responses; commercial-provider behavior is not assessed."
    }
  ],
  "entrypoints": [
    {
      "target": "choice, conversation and other-surface question responses",
      "state": "covered",
      "test": "test/consent-full-request.test.js",
      "scenario": "preserve unrelated pending approval on all three question response paths",
      "gate": "fast"
    }
  ],
  "displays": [
    {
      "target": "Windows dev-seeded Chromium",
      "state": "blocked",
      "reason": "Passed manual live proof is archived in live.json; it is intentionally not registered as an aggregate gate and does not prove installed WebView2 or physical Mac behavior."
    }
  ],
  "lifecycle": [
    {
      "target": "parallel pending lifetime",
      "state": "covered",
      "test": "test/consent-full-request.test.js",
      "scenario": "a second ask and paused clock survive the first answer",
      "gate": "fast"
    },
    {
      "target": "restart, installer and customer recovery",
      "state": "blocked",
      "reason": "No persistence schema change; this pass inspected the live store without restart and had no affected customer station or installer."
    }
  ]
}
