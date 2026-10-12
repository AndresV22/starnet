# Memory and learning execution — 2026-10-12

Owning branch: agent/memory-harness-audit-1011. Frozen implementation: 815f2e6640405249087750eec313859353cc2697.
Integration dependency already merged into this branch: 8c2b8c547. Trunk remains feat/harness-backend at a20ffa71f; this lane did not merge or edit it.

The five implementation areas are integrated and focused/live checks pass. The complete fast and HTTP gates remain outstanding in the coordinator's complete checkout. This is not a release-ready or product-perfection claim.

| Accepted work | Implemented behavior | Actual acceptance proof |
| --- | --- | --- |
| 1. Trusted learning after research | Capture current owner text before attachment expansion; keep external transcript tainted; short explicit preferences use the canonical durable memory writer; opt-out refuses auto-capture; capture receipts survive restart | Real attachment bytes reached the provider; injected attachment preference excluded; owner preference recalled after restart and by another agent; tool-free preference captured. final-live-verification.txt |
| 2. Stable memory and approved skills | Prioritize bounded standing preferences independently of newest feedback; stage every model create/edit/archive as a candidate; preserve active approved bytes; curator proposes retirement; digest-bound evaluation plus separate owner promotion | Proposed/rejected skills survive restart without displacing active; actual journal failure refuses publication; old and candidate approvals remain distinct; new null-baseline skill evaluates and promotes. final-live-verification.txt |
| 3. Retrieval and explicit sharing | Broader lexical normalization, older history searched despite weak local hits, bounded standing/pinned prompt allocation with omissions, compact skill-name overflow discovery; agent/project/station scopes; only explicit global owner preferences shared | Focused paraphrase/history/large-index tests; actual fresh worker private, station, matching-project, other-project, no-project and revoked-scope runs. focused-final.txt, contract-retrieval-final.txt, final-live-verification.txt |
| 4. Durable review evidence | Structured owner directives, correction completeness, arguments, outcomes, checks and loaded references; bounded first/latest retention; scrubbed external data; durable grace jobs and retries | Long output cannot evict correction; >40 owner directives keep latest; late reversal after600 chars stays incomplete; actual restart during grace resumes review and later restart does not replay completed job. final-live-verification.txt, focused-final.txt |
| 5. Behavior before promotion | Exact task/artifact/process checks, baseline vs candidate, held-out cases, regression/insufficient-evidence refusal; receipt bound to skill/baseline/suite/provider/model/effort; isolated files only; incomplete spend never silently settles | Real isolated read/write/read loop checks actual7/19 values against erroneous8/20 baseline; forged/stale receipts refused; local browser evaluates, enables approval only for passed receipt, promotes and rejects correctly. final-live-verification.txt, browser-ui-proof.json |

The browser was the real dev-seeded app, launched with node dev/seed.js --keep in two disposable profiles on19183/19185. Its successful model endpoint was a scripted loopback provider on19184; there was no external model spend. The observed UI result matched the real API/store state. Browser interactions: CONNECT → INSTALLED → AGENT SKILLS → Evaluate owner:ui-copy → result passed / enabled approval → Approve → Reject remaining proposal → one ACTIVE skill, no pending proposal.

## Verification receipts

- Syntax: node --check passed all49 changed JavaScript files relative to8c2b8c547. git diff --check passed.
- focused-final.txt:18 focused suites passed, including capture, evidence, bounded recall, scoped skill publication, UI state, restart lifecycle and accounting.
- contract-retrieval-final.txt:12 selected suites passed, including event/contracts, injected clock/RNG, corrections, feedback, embedding selection and transcript provenance.
- final-live-verification.txt:3 actual sidecar suites passed. Verdict packet lifecycle14 assertions; memory learning6 phases; candidate lifecycle6 phases/72 local model calls.
- existing-skill-http-final.txt:5 existing sidecar suites passed: guard37, exchange40, prompt22, learning35, trust-origin11 assertions.
- browser-ui-proof.json: actual browser actions plus backend confirmation of promoted/rejected state.
- Failed attempts are retained. Initial live wiring exposed a forbidden persistence key and query-route mismatch; both were fixed. The first armed-job completion assertion incorrectly expected the durable completed tombstone to disappear; it now requires no unfinished job and verifies no re-dispatch after another restart.

## Gate status and practical limits

- Full test:fast was attempted in this sparse checkout and failed on missing checkout inputs, then on optional voice-package discovery through NODE_PATH. An independent119MiB dependency copy fixed local-voice.test.js (models absent); the complete gate was not rerun here. See fast-gate-*.txt.
- Full test:http has not run on the final candidate. The coordinator requested one combined full gate in its existing complete checkout to avoid duplicating multi-gigabyte assets while C repeatedly approaches zero free space. Green-before-trunk is not waived.
- Automatic approval review rejected hard links to shared integration assets because test writes could mutate trunk. No links were made. Independent copies were used for required dependencies; no other lane's files or user profiles were removed.
- Evaluation proves only the selected declared task family, with a small held-out fixture set. It is not a statistically powered model-quality benchmark, adversarial hidden benchmark, or proof of broad self-improvement. No API-key vs subscription vs local-model comparative campaign or installed-release rollout was performed.
- New model-created skills intentionally remain unavailable until evaluated and approved. Existing imported/bundled/user-authored procedures retain their own guard policies. No automatic evaluation charge or promotion is triggered merely by a proposal.
- Lexical expansion improves common paraphrases; general semantic matching still needs configured embeddings. Standing/pinned recall and skill discovery remain explicitly bounded, with omission/search paths.
- Trusted owner capture is conservative: one current pre-expansion message, at most16000 chars, obvious quotes/code refused. This host does not supply >40 trusted owner turns; the larger-input boundary is tested at the module contract.
- Grace-job recovery is at-least-once with at most3 launch attempts. A crash after a model write but before durable completion can produce another proposed revision; it cannot silently replace active approved content.
- The audit's REA executable/tool was not identified. Installed harness inspection was manual, read-only local source/binary comparison, as recorded in REPORT.md. No REA run or competitor performance win is claimed.

## Integration map

Import the owning branch above, not the individual child lanes independently. Child contributions are already merged:15f06def retrieval;72b9139d skills;ea365043 and a899f08b evidence/lifecycle/accounting;521bc637 live lifecycle;8d825804 legacy fixture compatibility. Shared events/schema were not modified by this lane.

Principal ownership: root sidecar/index.js, trusted-learning.js, skill-evaluation-accounting.js, manifests and live host tests; retrieval lane context/feedback/notebook/recall/transcript modules; skills lane skillstore/gate/runtime/tools and stationui; review lane learningevidence/skillreview/verdictreview/skillevaluation/runner.

Changed paths relative to the reviewed coordinator dependency:

```text
frontend/app/stationui.js
qa/evidence/memory-harness-audit-1011/EXECUTION.md
qa/evidence/memory-harness-audit-1011/REPORT.md
qa/evidence/memory-harness-audit-1011/approval-check.txt
qa/evidence/memory-harness-audit-1011/goldens-check.txt
qa/evidence/memory-harness-audit-1011/skills-learning-live-retry.txt
qa/evidence/memory-harness-audit-1011/skills-learning-live.txt
qa/evidence/memory-harness-audit-1011/source-probes.cjs
qa/evidence/memory-harness-audit-1011/source-probes.json
qa/evidence/memory-harness-audit-1011/taint-learning-initial-pass.json
qa/evidence/memory-harness-audit-1011/taint-learning-live.cjs
qa/evidence/memory-harness-audit-1011/taint-learning-live.json
qa/evidence/memory-harness-audit-1011/taint-learning-probe-setup-failure.json
sidecar/context.js
sidecar/feedbackmemory.js
sidecar/index.js
sidecar/learningevidence.js
sidecar/skill-evaluation-accounting.js
sidecar/skill-evaluation-runner.js
sidecar/skillevaluation.js
sidecar/skillreview.js
sidecar/skills/gate.js
sidecar/skills/runtime.js
sidecar/skillstore.js
sidecar/tools/builtin/notebook.js
sidecar/tools/builtin/recall.js
sidecar/tools/builtin/skills.js
sidecar/transcript-history.js
sidecar/transcriptstore.js
sidecar/trusted-learning.js
sidecar/verdictreview.js
test/abilities.skills-lane.test.js
test/context.test.js
test/embed.test.js
test/fast.list
test/feedbackmemory.test.js
test/http.list
test/learning.evidence.test.js
test/memory-learning-boundary.http.test.js
test/memory-truth.test.js
test/notebook.test.js
test/recall.test.js
test/skill-export.test.js
test/skill.evaluation-accounting.test.js
test/skill.evaluation.accounting.test.js
test/skill.evaluation.test.js
test/skills.candidate-lifecycle.http.test.js
test/skills.gate.http.test.js
test/skills.gate.prompt.e2e.test.js
test/skills.gate.test.js
test/skills.learning.e2e.test.js
test/skills.on-demand.test.js
test/skills.review-approval.test.js
test/skills.test.js
test/skills.trust-origin.e2e.test.js
test/skills.trust-origin.test.js
test/transcript-history-v2.test.js
test/trusted-learning.test.js
test/verdictpackets.http.test.js
test/verdictreview.lifecycle.test.js
test/verdictreview.test.js
website/app/app/stationui.js
```
