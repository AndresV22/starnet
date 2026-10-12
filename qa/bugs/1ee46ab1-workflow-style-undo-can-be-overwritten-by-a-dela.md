---
fingerprint: 1ee46ab1
slug: workflow-style-undo-can-be-overwritten-by-a-dela
title: Workflow style undo can be overwritten by a delayed keep
surface: world
severity: P2
status: fixed
found: 2026-10-11
lane: agent/ux-triage-1011
fix: bf756e00e85172c01c9fc336bd9da69c8183864c
origin: audit
report: Authorized deep sweep of combined post-v0.13.2 source
affected: Source a20ffa71fd on Windows seeded Chromium; installed build not tested
family: frontend-state-ordering
installer: unverified
recovery: unconfirmed
---

# Workflow style undo can be overwritten by a delayed keep

## Symptom

KEEP THIS STYLE followed quickly by PUT IT BACK restores the local step but can leave the crew still remembering the withdrawn style.

## Repro

On a delivered workflow job, delay the keep-style reference capture or request. Select KEEP THIS STYLE, then PUT IT BACK before keep finishes. The baseline sends both requests concurrently; undo can write first and delayed keep writes last. See test/workflows-window.test.js.

## Evidence

Baseline a20ffa71fd with the new regression produced five failing assertions. The actual WorkflowsWindow handlers and FeedbackMemory apply/unkeep reproduced requests [keep, undo], writes [undo, keep], local styleKept false and global feedbackKept true. Current 56 assertions pass; qa/evidence/frontend-deep-sweep-2026-10-11/live.json records real seeded keep stored:true followed by undo undone:true/removed:true and no resurrected style in the actual memory store. Source anchors: frontend/app/windows/workflows.js:310 and test/workflows-window.test.js:166.

## Regression

Per-run request serialization lives outside the current view. Same-run keep/undo/keep preserves user order, other runs remain independent, navigation retains pending withdrawal, and a failed keep response does not poison the queue. Local step undo stays immediate. test/conveyor-ease.test.js (63 assertions) covers the separate workflow panel save/undo surface.

## Verdict

Source fixed and focused/live lane proof passed. Root aggregate gates remain separate. The backend sequential miss/unkeep finding belongs to the provider lane and is not this ordering defect.

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
      "target": "workflow job style controls",
      "state": "covered",
      "test": "test/workflows-window.test.js",
      "scenario": "ordered keep/undo/repeated keep with failure and independent-run cases",
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
      "target": "view changes and lost responses",
      "state": "covered",
      "test": "test/workflows-window.test.js",
      "scenario": "pending withdrawal survives view change and a failed keep response",
      "gate": "fast"
    },
    {
      "target": "restart, installer and customer recovery",
      "state": "blocked",
      "reason": "No persistence schema change; this pass inspected the live store without restart and had no affected customer station or installer."
    }
  ]
}
