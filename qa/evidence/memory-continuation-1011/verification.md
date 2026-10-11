# Memory and instruction-retention continuation — 2026-10-11

Application candidate: `ddd4cbcfa66f496960d57a0b8b64390d08442d92`. Test-repair candidate: `7ff71b1d073d50687d4c4f4313e019c04da9ef50`.
Owned branch: `agent/memory-proof-1011`. No application source changes, merge, push, installer, deployment, or release.

## Scope and source

Continues the recovered Claude session `6862b47a-57df-4138-a76c-4e0d1dcfbd6d`: forgotten instructions in long chats, stale/corrected memories, approved design references, unsupported save claims, and unexplained stops. Verified that memory-truth, design-anchor and stop-truth are already ancestors of the candidate; their fixes were not reimplemented.

## Recovered fast gate

The original complete log ends `run-fast-tests: OK — 1118 step(s) green`, `exit=0`, `[exited with code 0]`. Its SHA-256 is `7e7c989357e4991dc1bb88428c50d4597d5e6b41196bb4ec6339e9e59d48cb58`. This is recovered evidence on the unchanged application candidate, not a newly executed fast gate. Source: original session task `bo8ne0hji.output` under the local Claude temp session directory.

## Live commercial-model proof

Provider/model: OpenRouter `openai/gpt-4o-mini`; synthetic prompts only, isolated workspace and profile, random loopback ports. Per-run cap $0.10 and global cap $0.50. Run events reported $0.00843075 for the first campaign and $0.01500945 for the preference/correction campaign plus $0.02044470 for a traced scope follow-up ($0.04388490 combined; this is harness-reported cost, not an independent invoice reconciliation).

- An instruction absent from the supplied trimmed history was followed in 2/2 probes. Corresponding fresh-conversation controls followed it 0/2 times. Assistant suffixes were removed from the supplied window to avoid giving away the answer.
- A real notebook write saved the requested name globally. Its own run had a saved receipt; a subsequent run that wrote nothing had an empty receipt.
- A fresh conversation after a real sidecar restart greeted Captain Nemo.
- A subsequent real-model correction updated `note_1` to Captain Mira, preserving one record rather than leaving contradictory active notes. A second restart and fresh conversation greeted Captain Mira, not Nemo.

The first script exited 1 because it over-asserted that a paraphrased note must carry `user-stated`. The host deliberately requires >=70% content-word overlap with one actual user sentence and matching polarity before granting that authority. The model's paraphrase did not meet that threshold; conservative inferred provenance was correct. The original failed assertion is preserved in `real-model-initial.json`; the corrected global-storage assertion and additional correction/restart checks are in `real-model-correction.json`. No product rule was weakened to make the probe pass.

The initial preference-saving reply also appended the earlier PINEAPPLE suffix; the two ordinary fresh-chat controls did not. A focused local-provider variant of `test/earlier-conversation.http.test.js`, with the fresh unrelated stream sent as `isTask:true`, passed all 27 assertions and confirmed the earlier instruction was absent from that fresh task prompt. A subsequent commercial-model rerun with tool-call tracing passed all nine checks, did not repeat the suffix, and reported no PINEAPPLE content in tool results (`scope-live.json` and `scope-live.jsonl`). Its correction reply also mentioned a brief-context technical issue despite the verified successful notebook update; that model-authored explanation was not independently established. The suffix in the initial commercial run is still an observed limitation; its exact cause was not established, and this campaign does not establish exhaustive isolation of all tool-retrieved context or perfect model adherence.

## Live browser proof

`node dev/seed.js --keep --workspace <owned temporary directory>`; local scripted provider driving the real loop; actual headless Chrome/DOM, not extracted UI functions or synthetic bus events. `stop-ui.json` retains the observed text.

- Backend `agent.run.end.reason=empty` matched the visible explanation: the model sent an empty reply, nothing was done, and the user can continue or change model.
- TRY AGAIN appeared; the stop explanation survived browser reload.
- Clicking TRY AGAIN completed a real provider round-trip.
- A provider that repeatedly promised to remember without a notebook write produced the explicit no-save warning and RUN FAILED, with retry available.
- A real Escape key event while a reply streamed rendered `STOPPED BY YOU (ESC)`.

The initial browser probe encountered a reload timing race in the probe itself. Waiting for the new page's readiness resolved it; the complete rerun passed all seven observations. The seed preflight warned that the synthetic `test/model` is absent from the public catalog; the isolated sidecar subsequently loaded its local one-model catalog and completed the intended runs.

## Reproduction

From the repository root, create `.tmp`, then run the saved scripts in this directory. `real-model.cjs` uses the local dev key file without printing the key and incurs small metered charges; `--preferences-only` skips the two conversation-window comparisons. `stop-ui.mjs` uses a local fake provider and launches/cleans up its own headless browser and sidecar. These are local evidence scripts, not additions to the mandatory test manifests.

## Limits

This proves the listed source behaviors with one commercial model and controlled local browser scenarios. It does not prove arbitrary design fidelity, every provider/channel, a rebuilt installed application, or customer recovery. No READY or PRODUCT PERFECT verdict is claimed. Original Claude worktrees and the user's station data were preserved.

The first full checkout failed for lack of disk space and Git rolled it back. The replacement isolated checkout reuses installed dependencies and image assets through local junctions. The reused frontend and website asset tree IDs both match the candidate: `f927f9272ced5726b0b04332d8ac064e7d7922e1`. Application source remains the candidate above.

## Full HTTP gate

The first full gate stopped at 102/200 in `test/channels.telegram.e2e.test.js`: its provider gate held a reply indefinitely while expecting a normal follow-up to supersede it. The newly merged behavior correctly steers that message into the live run, so the obsolete test never released its own provider gate.

Commit `7ff71b1d0` updates only that test: an owner follow-up must be acknowledged, preserve the active run identity, reach the next provider request as a steering note, and produce its specific answer after the held reply is released. The previous cancellation/supersede scenario remains covered with an explicit `cancel` message. Focused real-sidecar result: `channels.telegram.e2e.test: OK (88 assertions)` and `run-test-list: OK — 1 step(s) green`. No application behavior was changed to satisfy the old expectation.

On candidate `7ff71b1d0`, the fresh full fast gate exited 1 at step 450/1118: every CRT context-loss behavior assertion passed, but cleanup hit Windows `EBUSY` unlinking the owned Chrome profile's `chrome_debug.log`. The unchanged isolated scenario then passed completely (`crt-focused.txt`). This is not a full-fast green receipt.

The fresh full HTTP gate exited 1 at step 50/200: the unchanged station-control ASK-mode scenario saw zero approval cards. That same scenario passed in the first full attempt and passed its unchanged isolated rerun (`station-control-focused.txt`). A diagnostic-only rerun also reproduced the missing cards even though the page origin was correct, both composer controls were enabled, and Chat was idle before the click (`station-control-diagnostic.txt`). That rules out the specific stale-origin/disabled-composer hypothesis; the precise intermittent cause was not established and remains for the combined-gate owner. This is not a full-HTTP green receipt. Per gate coordination, no further broad restart was launched; the organizing lane owns fresh combined-candidate gates.

All four directly relevant HTTP scenarios passed on the repaired candidate: `memory-truth.http`, `feedbackmemory.http` (35 assertions), `earlier-conversation.http` (27), `tasteref.http` (39), with `run-test-list: OK — 4 step(s) green`. Those include real sidecar run/store/recall/restart behavior and approved design references. Telegram's repaired scenario passed 88 assertions. Original gate failures and focused terminal receipts are retained beside this report; passing retries do not erase the failed full invocations.
