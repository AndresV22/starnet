---
fingerprint: 47c3a845
slug: answering-one-clarification-clears-other-paralle
title: Answering one prompt clears other parallel approvals
surface: channels
severity: P2
status: fixed
found: 2026-10-11
lane: agent/ux-triage-1011
fix: ced84e2f04e4a94a77f04cac97f7f469d4f4c336
origin: audit
report: Authorized deep sweep of combined post-v0.13.2 source
affected: Source a20ffa71fd on Windows seeded Chromium; installed build not tested
family: frontend-state-ordering
installer: unverified
recovery: unconfirmed
---

# Answering one prompt clears other parallel approvals

## Symptom

Answering a question, receiving a phone permission response, or using the voice approval fallback can remove unrelated pending asks from local state while the sidecar is still waiting for them.

## Repro

Dispatch a background worker that asks for fs.write permission while the interactive lead asks a brief.ask question. Answer the question. Baseline clarifyRow calls Channels.clearPending without promptId and clears both asks. Choice, free-text conversation and response from another surface share the defect. See test/consent-full-request.test.js. For the residual permission-card sibling, render a lead approval alongside another pending question and approval, then emit its phone permission.response with once, session, deny or expired denial. The old permissionRow handler cleared all three. For voice, seed two pending approvals without matching painted buttons and invoke the production approvalCommand fallback; the old handler removed both.

## Evidence

Baseline a20ffa71fd with the new regression failed all three added prompt-isolation tests. The original 10 tests passed before the later permission/voice sibling review. The real seeded fixture in qa/evidence/frontend-deep-sweep-2026-10-11/live.json had simultaneous lead brief.ask and worker fs.write, answered Blue, retained the worker ask and denied it independently before the lead settled. Source anchors: frontend/app/chat.js:3355, frontend/app/chat.js:3393 and frontend/app/chat.js:3467.


Follow-up after the combined gate exposed a stale source-lock assertion: unchanged 9d5c10c1d source with the new production permissionRow VM tests failed four cases (10 passed), clearing both sibling question and approval for phone once/session/deny/expiry. ced84e2f04e4a94a77f04cac97f7f469d4f4c336 supplies p.promptId to that final chat handler. test/consent-full-request.test.js now passes 14 tests, including ignored unrelated events, preserved paused clock, truthful settled text, removed buttons, released listeners and duplicate-event idempotence. test/remote-sessions.test.js had one stale two-argument regex failure with 29 passing assertions; its corrected scoped-call lock passes all 30.

The voice sibling was independently reproduced with the actual approvalCommand plus real Channels: the old fallback left pending [] instead of [worker-first]. 52dc95fff1ff492ef29492eceb0f863e281e7928 supplies pending.promptId. test/voice-live-ui.test.js passes approve/always-allow/deny, exact Harness/bus IDs, sibling and paused-clock preservation, and final-prompt closure. It was rerun successfully after merging with the phone repair.

Combined live receipt: qa/evidence/frontend-deep-sweep-2026-10-11/phone-voice-live.json, source 5e45ea3796846480b4712210b07f68576e02bcdc, eight checks passed with no browser exceptions. The real seeded app had actual lead and worker fs.write approvals; actual backend consent plus a controlled phone event settled only the lead card, retained the worker and pause, and the worker remained separately answerable. The voice production function was exposed only through test-load instrumentation; controlled pending asks and consent/speech spies verified the real panel stayed APPROVAL NEEDED until the final answer, then displayed WORKING. No physical phone, paired gateway, microphone, STT or audible TTS was exercised. All owned processes closed.

The first live attempt passed all five phone checks, then stopped at an overbroad fixture guard that counted a harmless COPY button as a decision button. No application change followed that fixture failure. The corrected guard matches actual voice decision labels; the next run passed all eight. The prior result is preserved in qa/evidence/frontend-deep-sweep-2026-10-11/phone-voice-first-attempt.json.

## Regression

The original question paths (444bfa124), phone permissionRow response (ced84e2f0) and voice fallback (52dc95fff) all clear only the selected prompt ID; other asks and paused time remain. A defensive Delegated control renders Answer for an attributed brief.ask and focuses the exact existing question card, rather than submitting approval grades. test/delegated-threads.test.js passes 92 assertions. Live Answer navigation is explicitly controlled attribution on a real interactive question; it does not establish naturally interactive autonomous workers.

## Verdict

Source fixed for the reproduced question, phone permission-response and voice fallback prompt loss. Original question live proof and subsequent controlled phone/voice live proof are recorded separately with their exact limits. Focused/live lane proof passed. No backend authority expansion. Autonomous workers intentionally do not receive askCommander, so no native-worker question regression or recovery is claimed.

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
    },
    {
      "target": "phone permission decisions and voice fallback",
      "state": "covered",
      "test": "test/consent-full-request.test.js",
      "scenario": "once/session/deny/expiry settle only matching permission card while sibling question and approval remain paused",
      "gate": "fast"
    },
    {
      "target": "voice fallback before buttons paint",
      "state": "covered",
      "test": "test/voice-live-ui.test.js",
      "scenario": "approve/always allow/deny address exact pending ID; preserve sibling and close pause only at last prompt",
      "gate": "fast"
    }
  ],
  "displays": [
    {
      "target": "Windows dev-seeded Chromium",
      "state": "blocked",
      "reason": "Passed manual live proof is archived in live.json; it is intentionally not registered as an aggregate gate and does not prove installed WebView2 or physical Mac behavior."
    },
    {
      "target": "controlled real Chromium phone event and voice function",
      "state": "blocked",
      "reason": "Eight manual live checks passed in phone-voice-live.json. This is controlled desktop integration, not a registered live gate, paired physical phone or microphone/STT/TTS proof."
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
