# StarNet memory, learning, and tool-use audit — 2026-10-11

The strongest explanation is a broken chain between capture, retrieval, sharing, and reuse. StarNet has substantial memory and learning code. It nevertheless has concrete paths where a successful save never influences the next task, a useful session never triggers learning, or a learned skill becomes unavailable.

This is an investigation, not a product fix or a comparative model benchmark. Source candidate: `a20ffa71fd04691805ea55c7d08165438dd7ac6f`. Audit branch: `agent/memory-harness-audit-1011`. Trunk was still at that SHA on final source verification. No application code, user station, running session, shared contract, release, or remote repository was changed.

## Most consequential finding: ordinary work can suspend automatic learning

Confirmed through the real sidecar with a local scripted provider, isolated profile, random port, and benign attachment bytes. The review interval was deliberately set to one to make eligibility observable; production defaults to ten eligible model turns.

| Run | Completed | Taint recorded | Skill-review calls |
| --- | --- | --- | --- |
| Clean control task | yes | none | 1 |
| Read benign attachment | yes | `fs.read` | 0 |
| Follow-up in same conversation after sidecar restart | yes | replayed history, originating at `fs.read` | 0 |
| Fresh conversation control | yes | none | 1 |

The attachment content actually reached the provider; the probe does not infer this from a failed read. The counter remains due while review is suppressed. Receipt: [taint-learning-live.json](taint-learning-live.json). Reproduction: [taint-learning-live.cjs](taint-learning-live.cjs).

Mechanism: `sidecar/taint.js:47` classifies web/browser, MCP, and attachment reads as outside content. `sidecar/index.js:22288` removes reflection, failure review, study, thread mining, and skill review from the post-run candidates when tainted. `index.js:21635` and `:21666` preserve taint through replayed and dropped conversation history. This deliberate October 10 injection defense has a broad learning cost: a valid user correction later in the same conversation does not rescue the ordinary post-run extraction path. The current suppression removes candidates before the usual auxiliary-pass diagnostic is emitted.

This is not a claim that all learning stops. Explicit rating feedback is a separate path; direct model notebook writes still exist; Full Access has a separate in-run tool-dispatch override. The live result proves the automatic skill-review eligibility effect. Source establishes the sibling suppression paths, not their user-level frequency.

Recommended repair direction: retain source provenance and the execution boundary, but extract trusted user corrections and verified local outcomes independently of untrusted retrieved text. Persist pending candidates with a clear reason. Do not simply erase taint or trust a model-generated summary as a sanitizer.

## Other demonstrated gaps

| Finding | Probe / source evidence | User-visible consequence |
| --- | --- | --- |
| Semantic recall exists but is off without configuration | `index.js:3005`; `context.js:495`. Saved Docker rate-limit/backoff fact: exact wording retrieves it; “uploads keep getting throttled” retrieves zero; a supplied matching synthetic vector retrieves it. | “You forgot” can mean selection failed even though storage is intact. |
| Pinning is not a guarantee of prompt presence | Default eight ranked records and 1,500-character rendering: `context.js:307`, `:445`, `index.js:21697`. Twelve pinned ~280-character requirements yielded eight candidates and four rendered records. | Standing instructions can be omitted as memory grows. |
| Durable feedback has a bounded always-on window | `feedbackmemory.js:32`, `:186`, `:200`. Nine feedback records yielded newest eight; the oldest general preference was absent from that shared block. | An older preference loses guaranteed station-wide influence. It remains stored and can still match topical recall on its owning agent. |
| Runtime skills and ordinary notebooks are agent-specific | `skillstore.js:280`, `index.js:21446`, `:21680`. Writer learned one newsletter skill; overseer had zero. Ordinary foreign “global” note produced no station-taste entry. | Switching specialists can feel like starting over. Feedback, dossier context, delegated pinned notes, and installed/bundled library skills are important sharing exceptions. |
| Learned skills disappear from the prompt index as the library grows | `skills/runtime.js:77`, `:115`, `:126`. Sixty representative skill rows produced 27 visible names and 33 omitted names at the 6,000-character budget. | The model may never discover the procedure that would help. BM25 ranking helps lexical matches; `skill.list` remains an explicit escape route. |
| Reviews lose the evidence needed to learn a procedure | `skillreview.js:44`; `index.js:3409`, `:3539`. A 13,000-character tool result displaced an earlier correction. Tool-call names survived a short transcript but command arguments did not. Defaults: tail 12,000 characters, six iterations, 45 seconds, $0.08. | A review can miss why a task failed or the exact successful command needed to repeat it. |
| Automatic capture excludes some short preferences | `reflect.js:26`, `:56`, `:234`. “I prefer British spelling” / “Understood” was not salient; a long conversation displaced the earlier preference from the 4,000-character reflection input. | Acknowledgment does not necessarily create durable learning. Explicit notebook writes are a separate route. |
| A weak current-chat hit prevents broader history search | `tools/builtin/recall.js:107`, `:116`. Subagent production-module probe: a current launch placeholder hides the prior-stream final plan by default; explicit `scope:all` finds it. | “We discussed this” can fail because search did not examine the right conversation. |
| Review updates can remove an already usable skill until approval | `skillstore.js:256`; `skills/gate.js:117`; `test/skills.review-approval.test.js`. A review edit stores the new version as ask; the old digest approval does not apply. No separately active approved version is selected by these paths. | Background “improvement” can temporarily make an existing procedure unavailable. Keep approved content active while a candidate awaits review. |

The reproducible memory and skill probes are [source-probes.cjs](source-probes.cjs) with output [source-probes.json](source-probes.json). They invoke production modules with in-memory records; they are not real-model behavioral trials. The synthetic vector tests the selection path, not any embedding model's quality.

## Recent work that is already present

Do not rebuild these or describe them as missing:

- `4b39a02d2` (September 28): persistent ten-iteration review nudge, first-skill guidance, actual-load usage counting, reserved review slot outside the auxiliary-call ceiling.
- `6032c0268` (September 29): one nudge review in flight, protection for Commander-authored skills, exclusion of throwaway-clone counters.
- `82576b1de` (October 1): durable rating-review packets, including rated failed runs.
- `1bbdd219c` / `46c9be4d8`: dated recall, newer-wins ordering, conservative user-stated provenance, superseded-note folding, standing-instruction scope, accurate per-run save receipts, dossier synchronization.
- `4c088a135`, `5589b3110`, `b493a1600`: approved design references, clearer stopped/no-save outcomes, strengthened provenance and crew context.
- `b159983d9`: preserved the recent memory verification and complementary Telegram regressions.

The earlier committed receipt at `qa/evidence/memory-continuation-1011/verification.md` records real-model cross-restart recall and correction from Captain Nemo to Captain Mira, plus dropped-window instruction retention. It also preserves limitations and failed initial assertions. This audit did not rerun that metered campaign. These are source-level and bounded live receipts, not proof every affected customer is running a recovered installer.

## Hermes comparison

Local clean reference: `C:\Users\andro\hermes-ref`, SHA `8e734810dfcb4f19eac2f442cb75b3962dfec728`.

| Mechanism | Hermes evidence | Difference worth adopting or testing |
| --- | --- | --- |
| Compact profile memory is injected automatically | `agent/system_prompt.py:460`, `hermes_cli/config.py:2158` | Separate small always-present preferences from task-specific retrieval. Hermes core is also bounded: 2,200 plus 1,375 characters, with a session snapshot refreshed on compression/new session. |
| Learned skill directory is profile-wide | `hermes_constants.py:923` | Explicit shared/team/project skill scope, with provenance and agent overrides, rather than accidental duplication between specialists. |
| Keep every eligible skill name visible | `agent/prompt_builder.py:1594`, `:1620` | Compact descriptions or supply a searchable overflow index before dropping the names entirely. |
| Background review reuses the same-model message snapshot | `agent/background_review.py:683`, `:776`, `:816` | Preserve corrections, tool arguments, outcome evidence and loaded skills in a structured packet. Hermes permits 16 iterations; separately routed aux models get a digest instead. |
| Search history across sessions and retain context | `tools/session_search_tool.py:499`, `:531`, `:578` | Merge strong local and historical matches; include surrounding evidence and session lineage. |

Hermes has a clearer default carry-forward path. This audit does not demonstrate it universally performs better. Both systems have limits and model-dependent behavior. Official context: [Hermes memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

## Installed harness reverse inspection

A specifically named REA executable, skill, or exposed tool was not found. The user was asked for its identity while independent work continued. The following is manual read-only static inspection, not a claim to have executed an unidentified REA product. No private session databases, credentials, or app configuration were read or changed.

| Target | Observed local version / reference | Useful mechanism and evidence |
| --- | --- | --- |
| Claude Code | 2.1.284 | Installed `C:\Users\andro\.local\bin\claude.exe`: feedback prompt at byte 206326418 captures corrections and confirmed non-obvious successes with why/how-to-apply. Bytes 206369000–206375300 describe compact pointers plus detailed memory files. Bytes 217425000–217436500 contain bounded extraction and feature-gated Dream consolidation; activation was not proven. |
| Codex CLI / reference | CLI 0.162.0-alpha.2; ref `82883da25e3be5883e905afa02c3a639d02a97aa` | `C:\Users\andro\harness-refs\codex\codex-rs\memories\write\src\start.rs:24`: asynchronous extraction then consolidation. `phase1.rs:120`: leases/eligible idle jobs. `phase2.rs:67`: serialized consolidation and ownership checks. `ext/memories/src/prompts.rs:35`: bounded summary injection. `memories/write/templates/memories/consolidation.md:689`: v1 repeated successful procedures become verified skill instructions. Installed feature activation and source/binary equivalence were not established. |
| Kimi Desktop | 3.1.2; bundled OpenClaw 2026.3.13 | `C:\Users\andro\AppData\Local\Programs\kimi-desktop\resources\resources\gateway.asar`, member `node_modules/openclaw/dist/reply-Bm8VrLQh.js:101714`: search before answering prior-work/preferences questions; `:153254`: actual memory search with unavailable-state handling; `:165202`, `:165253`, `:165283`: pre-compaction memory flush, default enabled in bundled config, once-per-compaction accounting. Runtime activation was not tested. |
| OpenCode Desktop / reference | desktop 1.17.9; ref `388406238bd5ca15564a762840a2362c3a45bd9c` | `C:\Users\andro\harness-refs\opencode\packages\opencode\src\skill\index.ts:187`: compatible global/project skill discovery; `tool/skill.ts:46`: full instructions/supporting files. `session/compaction.ts:31`: protects skill outputs from ordinary pruning. `packages/core/src/session/compaction.ts:18`: objective, constraints, work-state and next-action anchors. No native autonomous learning claim inferred. |
| Cursor | 3.15.19 | Installed `workbench.desktop.main.js` recognizes `.cursor`, `.claude`, `.codex`, `.agents` skill folders at byte 25348144 and passes skill/MCP snapshots at 21520494. Evidence supports discovery, not a claimed memory-learning loop. |

Static fingerprints supplied by the inspection lane:

- Claude executable SHA-256: `0416631E846F743110DA5282409776FA1313E65F33A588AAE066EAF8DB0FDA7D`.
- Kimi app.asar SHA-256: `4963224E3E31CB0ECF1390D211767BFAFE938DC080AC48B3FE60E93F783FC199`.
- Cursor workbench SHA-256: `18F9A52779FA03F58989BF45F4ABBCF18F3EFEC8DBF205E6AA71429297FD2EF9`.

OpenAI's [current skill guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) also warns that excessive descriptions can be shortened and conflicting applicability rules can harm selection. Competitor skill discovery is therefore not an unlimited-context solution either.

## Tool calling and actual self-improvement

StarNet already has deferred-tool search (`sidecar/tools/builtin/toolsearch.js`; `index.js:89`, `:805`), real dispatch, and anti-promise continuation (`loop.js:2169`). The evidence does not support “StarNet cannot call tools” or “add tool discovery” as diagnoses.

What the model can use depends on the run's actual capability set, provider tools, selected skill instructions, task classification, loaded context, and post-read authority. Recall and skill tools are attached to the notebook capability (`capability/registry.js:93`); learned-skill indexing requires task classification and `skill.view` (`index.js:21443`); review counting requires skill-write/manage tools (`index.js:22257`). These are extra places where a nominal feature can fail to reach the model. A head-to-head tool benchmark must hold model, permissions, data, and tools constant and capture actual provider requests and executed calls.

The current skill goldens (`sidecar/skills/goldens.js:1`, `:57`) check output length and keyword overlap. They explicitly do not judge quality. Background review does not automatically run controlled before/after task trials and promote only improved candidates. Thus saved skill counts, review calls, and test-suite size do not establish self-improvement. No competitor quality advantage was measured here.

## Recommended order of work and acceptance criteria

1. **Trusted learning after research.** Separate user corrections and verified outcomes from external content; retain taint on external material. Show a durable reason when a learning candidate is skipped. Acceptance: the same explicit correction reaches the next fresh-task prompt after clean, web, attachment and MCP tasks, without external text acquiring instruction authority.
2. **Stable active memory and skill versions.** Preserve applicable standing preferences independently of newest-feedback count; keep the last approved skill active while reviewing a replacement. Acceptance: adding eight unrelated ratings or proposing a new version does not remove a previously applicable preference/procedure.
3. **Deliberate sharing and robust retrieval.** Define agent/project/station scope in storage and UI; retrieve across relevant sessions even when a weak local hit exists; test paraphrases and disclose lexical-only fallback. Preserve all skill names or a discoverable overflow path. Acceptance: repeat the same task with another permitted crew member, a paraphrase, and a library of 60+ skills.
4. **Better review evidence.** Preserve corrections, successful arguments, source links, outcome checks, and active skill IDs before compaction; retain retryable review work if budget or execution fails. Acceptance: a large tool output cannot erase the only correction or working command from a review packet.
5. **Measure behavior before promoting learning.** Run held-out repeat tasks and counterexamples against old/new versions; track task success, correction adherence, unnecessary calls and regressions; promote or roll back explicitly. Include API-key, subscription, local-model, COMMS, messaging, worker, and unattended variants.

These are implementation recommendations, not changes made by this audit. Coordinate ownership of `sidecar/index.js`, memory, and skills with the existing sessions before implementation; shared event/schema ownership remains unchanged.

## Validation and operational record

- New isolated live sidecar probe: PASS, four conditions including real restart; benign attachment bytes confirmed in provider input. Scripted local provider, zero real-model calls.
- Existing live learning suite: 35 assertions PASS. [Receipt](skills-learning-live-retry.txt).
- Skill-review approval: 18 assertions PASS. [Receipt](approval-check.txt).
- Skill goldens: 19 assertions PASS. [Receipt](goldens-check.txt).
- Parallel memory audit: 648 focused assertions PASS (context 189, earlier conversation 58, reflection 117, feedback memory 74, memory truth 71, notebook 139). These are the lane's reported source-test receipts, not independent real-model proof.
- Initial live-suite launch failed because the sparse tree had no `ajv`; the successful run used the existing dependency directory through process-local `NODE_PATH`, read-only. Original log retained.
- Initial new probe assumed a zero counter would have a file; production correctly leaves an unchanged zero unpersisted. Probe corrected; original setup-failure record retained. The first pass was then strengthened to assert actual attachment-byte delivery; final pass is authoritative.
- No full fast/http gate was run for this evidence-only audit. No source fix, installer verification, customer recovery, release readiness, or product-completion claim.
- Separate audit lanes and read-only comparisons preserved active sessions. The prescribed full-worktree helper copied massive tracked assets and hit disk exhaustion. Only this investigation's failed copy/processes were cleaned up; source-only checkout used thereafter. No other worktree was deleted or modified.
