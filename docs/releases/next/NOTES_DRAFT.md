# StarNet — next release (draft)

DRAFT updated 2026-10-12 for the release after v0.13.2. This describes the combined isolated candidate through `52cdb7fd`, extending integrated source `a20ffa71f`; it is not a published or installed-verified release. Reconcile the final candidate before copying these notes. `release:bump` replaces root `RELEASE_NOTES.md` with a scaffold; keep the current public release notes intact until the cut.

## Update Center summary draft

Conveyors can now hand finished work to another line, building is click-and-drag, and chat, voice, local models and recovery get fixes. MOVE is gone: drag a selected piece to move it, Shift+drag moves anything, dragging an unselected machine lays a belt, right-click removes, and on the Conveyors tab keys 1-8 pick pieces (elsewhere key 4 is free). SEND TO can start paid jobs on the next line, on its own budget. Back up your station before downgrading: older builds do not understand onward routing.

The summary above is 501 characters, under the Update Center's 520-character limit. The Update Center shows only the first 520 characters of RELEASE_NOTES.md, version heading included, as plain text, so the paste-ready notes below OPEN with the downgrade warning, the downstream-cost warning and the MOVE/key change: 509 characters with `# StarNet v0.13.3` and two newlines (510 for a two-digit patch). Re-measure if the opening changes.

## Release notes draft (paste over the `release:bump` scaffold at the cut)

Written in the public RELEASE_NOTES voice. Everything below the version heading `release:bump` sets is meant to be pasted, starting with the two opening paragraphs. Everything is in source on this candidate; reconcile it against the final candidate's change inventory and drop any line whose acceptance did not land.

**Before you downgrade:** back up your station; older builds don't understand SEND TO or the new conveyor records.

**SEND TO can start paid work:** a line can now hand each finished job to another line, whose crew works it at that line's own cost and budget, even one started with RUN ONE REAL JOB. **MOVE is gone:** drag a selected piece to move it, Shift+drag moves anything, dragging an unselected machine lays a belt. On the Conveyors tab keys 1-8 pick pieces; elsewhere key 4 is free.

Conveyors grow up. Lines hand their finished work to each other with SEND TO, building is one hand you drag with, and whole lines copy, paste and delete in one move. Plus fixes across chat, voice, delegated work, local models and recovery.

### Behavior changes

- **MOVE is gone.** Click a piece to select it, then drag it onto open floor to move it. Shift+drag moves any piece. Dragging a machine you haven't selected lays a belt from it instead of moving it; drop it on another machine to belt the two. Outside the Conveyors tab key 4 is free now; on that tab it picks the SPLITTER.
- **On the Conveyors tab, keys 1-8 pick pieces:** BAY, INBOX, OUTBOX, SPLITTER, MERGER, JOINER, FILTER, LOOP. ROOM, HALLWAY, SURFACE, DELETE, PROPS, BELT and COPY keep their keys on the other tabs; 0 (SELECT) and 9 (CONVEYOR LINES) work everywhere.
- **Right-click removes** a machine or a belt, or drops the piece in your hand.
- **Del on a whole selected line deletes the line,** every machine and belt of it. Ctrl+Z brings it all back.
- **No more belts out of an OUTBOX or into an INBOX.** Lines chain with SEND TO instead. A save with an old OUTBOX-to-INBOX belt shows MAKE IT A SEND TO in that OUTBOX's Workflow panel.
- **A belt can't close a circle** unless it is a LOOP's back lane.
- **SEND TO can start paid work.** When a line sends its result on, the next line's crew works it at that line's own cost and budget, and that includes a job you start with RUN ONE REAL JOB.
- **NO FEED clears only when something can start work.** Sending a line a sample job or testing it no longer clears NO FEED or ticks "what starts this line" on the finish card. What clears it is either floor-wide (any configured channel, armed routine, watched folder or webhook on the station clears it on every line) or a SEND TO into that line.
- **SHIPPED counts jobs with a saved shipment record.** Deliveries from before this release are not reconstructed into it.
- **A follow-up in Telegram or Discord joins the running task.** A message sent while an agent is still working on your last one now steers that task instead of replacing it. "stop", "cancel" or /stop still stops it.

### New

- **SEND TO.** Drag a line's OUTBOX onto another line's INBOX (or pick the line under SEND TO in the OUTBOX's Workflow panel) and every finished job rides on to it, worked by that line's own crew. Each job says where it came FROM and where it was SENT ON TO, in WORKFLOWS and in DELIVERABLES › TO REVIEW. A circle is refused before anything is saved.
- **The hand.** Pick a piece with 1-8 or Q (a copy of the piece under the pointer), drag from a machine to lay a belt (R flips the corner), drag from the middle of a belt to branch it (a SPLITTER goes where you pressed), let a belt go on another belt to merge (a MERGER lands there), Ctrl+drag a placed belt to reshape it through a point, and hold Alt to see every setting and SEND TO on the floor.
- **Select, copy, paste.** Drag a box on empty floor, double-click a machine for its whole line, Shift-click to add or drop one. Ctrl+C / X / V / D copy, cut, paste and duplicate; R turns a paste before you drop it. A whole line's card has COPY LINE and DELETE LINE, and a pasted line comes with its own name, crew, instructions, budget and jobs.
- **Your lead can build lines too.** It can chain lines with SEND TO, copy a line and take a line up, and every one of those is spelled out on the approval card before anything moves. One UNDO takes the whole plan back.

### Fixed

#### Conveyors

- **Long lines say why they stop.** A line longer than its stage budget shows TOO LONG — RAISE THE LINE BUDGET, and its Workflow panel offers ▲ ALLOW N STAGES.
- **A BAY that isn't on a line says so** (NOT ON A LINE — BELT INTO IT) and offers JOIN A LINE.
- **SHIPPED is a real count:** clean jobs that did real work (a tool call or a file) and reached the OUTBOX, once each. A job that only answers in words reaches the OUTBOX but isn't counted. Branches and loops don't inflate it, and it survives restarts and floor edits.
- **FIRST SHIP only fires when a line really ships its first job.** It used to go off when a chat order to a line's agent sent its crate down that line's belt, and a line that had already shipped could get it again.
- **The finish-the-line card keeps "what starts this line" until something does.** A chat order's crate at the OUTBOX no longer makes the card disappear for good.
- **JOINER lines never lose or double a finished job,** even when one branch finishes long after the other or the same completion arrives twice.
- **An exhausted LINE BUDGET stops a line before it spends,** whether the job came from a sample, Run Now, a schedule or a restart.
- **Parallel and JOINER lines explain why whole-line STEP THROUGH isn't available,** and single-step tests still work.
- **SORTING OFFICE and CODE FOUNDRY route every tag** instead of failing after the work was already done.
- **Hand-offs name the line the way the floor does.** A line without a name reads LINE C in WORKFLOWS, in TO REVIEW and on the crate that carries its work over, never "another line".
- **Lead-built floors:** asking the lead to take up one line in a room no longer removes the whole room; a SEND TO made by connecting an OUTBOX to an INBOX always shows on the approval card; the lead can turn an old belt between two lines into a SEND TO; and a copied line's card says where it really landed and how many belts it has.

#### Everything else

- **Delegated work is easier to follow.** A conversation shows each worker it sent out, with its work, its report and anything that needs you. Finished worker answers survive failed writes and restarts.
- **Chat:** long conversations keep your messages and the current task when they're compacted, recall reaches older conversations, file and review trays keep their context, and the stop reason stays visible after a reload.
- **Files:** a file edit that doesn't match the file exactly is refused before anything is written, instead of landing where it was guessed, and edits keep the file's line endings.
- **Voice:** a better local voice, a separate model for spoken turns, and spoken approvals that wait for you to confirm.
- **Local models:** Ollama works with strict system-message templates, and timeouts say what StarNet actually saw.
- **Skills:** a proposed change stays separate from the approved skill until you approve it.
- **Connectors, channels and spending:** a locked connector store is told apart from an empty one, Discord and Signal setup covers more cases, and an old receipt with no recorded billing source says BILLING SOURCE UNKNOWN instead of guessing.
- **Update Center:** an available update is remembered across restarts, and opening the panel checks again.
- **Display:** ROOM LIGHTING in SETTINGS is a 0-100 slider, text size works from the keyboard, and scenes that haven't changed draw less.

### Security

- **Local authorization and agent-instruction hardening.** Details follow once the fixed build has been out long enough to update.

## User-facing changes included in source

- **Setup guidance.** The provider reference explains account pairing, per-agent models, reasoning effort and account plans. The first-workflow guide uses current controls, distinguishes preview from real jobs and asks users to check readiness and final output. Unknown billing receipts remain explicitly unresolved.
- **Conveyors and onward work.** Build lines by dragging between machines. SEND TO passes an OUTBOX's finished job to another line's INBOX while preserving the producing workspace and the target line's own crew, job record and budget. COPY, TAKE TURNS and SPLIT THE JOB retain their distinct routing behavior.
- **Conveyor completion and budgets.** Parallel/JOINER lines explain why whole-line STEP THROUGH is unavailable; individual-step tests remain available. Entry paths respect exhausted daily line budgets. SHIPPED counts recorded productive OUTBOX jobs once, survives restart and floor edits, and reports unavailable history when durable records cannot be read. Duplicate completion events retain the original joined work.
- **Pending floor edits.** Late artwork, lighting refreshes and still-image reads preserve unpublished Build edits. Closing Build or explicitly starting a line publishes through the existing path.
- **Floor editing.** Box-select or double-click a whole line; copy, cut, paste and duplicate with Ctrl+C/X/V/D. Line cards include COPY LINE and DELETE LINE. R flips a belt corner, Q copies the piece under the pointer, and Alt shows settings.
- **Agent-built floors.** Agents can plan onward connections, line copies and whole-line removal. Plans disclose removed connections, repeated templates receive distinct line names, and readiness follows the published floor.
- **Delegated work.** A parent conversation shows each dispatched worker's work and report, including requests that need your attention. Worker files keep their project identity. Scoped builder lending lets an approved worker carry out its assigned floor-building job.
- **Recovered worker answers.** Completed delegated answers retain their full redacted payload and recover after failed writes or restart. Saved desktop and paired-device conversations replace superseded worker drafts with the accepted answer once, preserve attachments and historical status, and use the accepted answer for follow-up context. Historical bytes never retained cannot be reconstructed.
- **Conversation files and review.** File and review trays retain context, completed items can be cleared and restored, and unresolved items remain visible. Streaming scroll, long composer behavior and image loading receive fixes. Stop reasons remain visible after reload, and ordinary channel follow-ups steer the active run while explicit cancellation remains available.
- **Voice and paired devices.** Local speech uses an improved synthesis/effect path with saved choices. A separate spoken-turn model can be selected without changing typed-chat routing. Spoken approvals wait for confirmation and preserve other pending requests. Paired-device audio transport receives reliability improvements; device acceptance remains listed below.
- **Display controls and rendering.** Lighting has a persistent 0-100 control, keyboard text-size controls are available, and unchanged or offscreen scene work is reduced. No universal performance or memory-usage guarantee is implied.
- **Graphics recovery.** Authored prop pixels remain available during canvas loss, repair retries are bounded, and floor read failures can recover. Explicit local-model allocation failures stop blind retries and show the observed error; this does not resolve every local-model startup delay.
- **Memory and conversation history.** Long-conversation fixes retain owner messages and the current task during compaction. Recall searches older conversations even when the current chat has a weak match and recognizes more common paraphrases. Standing and pinned preferences remain bounded. Saved-memory handling distinguishes owner intent from inverted relations and upstream instructions.
- **Trusted learning and sharing.** Trusted owner preferences survive research and restart with explicit sharing boundaries. Uploaded, quoted and internal activity is excluded from trusted owner history. Repeated-work suggestions bind each request to its original occurrence. Older inferred topic summaries remain stored but need new attributable evidence before influencing suggestions.
- **Skill review and approval.** Proposed changes stay separate from the active approved skill through evaluation and rejection; promotion requires owner approval. Larger skill libraries have a searchable overflow index. Reviews retain structured correction and outcome evidence and resume durable pending work after restart. Evaluation charges follow the selected budget policy; unknown charges block further evaluation under strict caps. These changes still require candidate-bound installed acceptance.
- **Approved design references.** Saved approved work and style references retain their file identity, can be supplied to image-capable providers, and support reversible keep/undo feedback. Requested properties that were not observed are not presented as reference facts.
- **Connectors and channels.** Connector storage distinguishes locked encrypted data from an empty fallback store; starting fresh preserves verified recovery copies and revokes old live clients and pending sign-ins after the durable reset succeeds. Discord and Signal setup guidance covers additional failure and private-recipient cases.
- **Local models.** Ollama request formatting accommodates strict system-message templates. Unfinished HTTP error bodies remain cancellable and use the existing idle watchdog. Timeout messages describe what StarNet observed. The separately reported long wait before an Ollama chat request is still under investigation.
- **Web diagnostics.** Post-header decoding and socket failures retain bounded cause codes and hostnames without including page contents or URL secrets. This does not establish a fix for the reported Mac transport incident.
- **Files and child tools.** Browser uploads resolve the current project's file and verify what was selected. Ambiguous file patches are refused before writing; Windows child tools retain their required runtime environment. Selecting an upload is not proof that the destination website accepted it.
- **Spending review.** Old pending receipts whose billing source was not recorded now say BILLING SOURCE UNKNOWN. Recorded managed and BYOK receipts retain their distinct guidance. Historical charges, caps and billing sources are not guessed; unresolved spending can block work under explicitly configured spending limits. This improves the guidance but does not reconcile affected customer accounts.
- **Update Center.** A known available update survives restart, opening the panel triggers a fresh check, and last-check state is shown separately from whether an update is available.
- **Fresh start and recovery.** Automatic legacy recovery respects an explicit erase/fresh start while preserving deliberate restore options.
- **Saved-station diagnostics.** Recovery codes and copied fallback reports follow the latest retry and measured engine failure. These changes preserve save bytes and improve support evidence; they do not establish the cause of the original customer loading report.
- **Checkpoint maintenance.** Maintenance also runs for unchanged snapshots, supervises Git work, and preserves recoverable history during replacement. The original customer's multi-hour macOS disk-growth scenario still needs affected-platform acceptance.

## Security

Local authorization and instruction-provenance hardening is included in source. Final public notes must describe only the fixes accepted in the signed candidate; keep exploit details out until the corrected build is available. The reviewed issue batch is combined in this candidate; exact installed cross-user acceptance of the fresh authorization report remains outstanding.

## Heads-up for upgrades

- MOVE is retired: click to select, then drag onto open floor to move. Shift+drag moves any piece. On the Conveyors tab, 1-8 pick pieces instead of the old tool shortcuts.
- Right-click removes a machine or belt. Delete on a whole-line selection removes that line; Undo restores it.
- An OUTBOX hands work to an INBOX through SEND TO, never through a belt. A belt cannot close a circle except a LOOP's valid back lane.
- RUN ONE REAL JOB can start downstream paid jobs when SEND TO is set. The target line has its own cost and budget.
- SHIPPED excludes older deliveries without saved shipment records; it is not a reconstructed lifetime total.
- Keep a station backup before downgrading: older builds do not understand onward routing.

## Before the cut

- Resolve the explicit acceptance gaps from the reviewed issue batch and email/GitHub intake; complete the still-missing Whop intake. The Windows 0.13.2 packaged-backend startup report `85f602c4` remains open; no repair or customer recovery is claimed.
- Complete exact-candidate source gates, Guardian/readiness, installed first use and upgrade/data continuity, native lifecycle, and the required product acceptance waves. Current source test passes do not authorize release. The 4e56787f full fast run failed during measured disk exhaustion; complete gates must restart on the final candidate after capacity is restored.
- Compile and run the newly prepared isolated Windows/macOS native credential acceptance. Source review and nine mocked refusal controls do not establish native persistence, installed reconnect/relaunch or affected-customer recovery.
- Verify physical companion audio, real connector accounts and affected provider/platform cases where those claims are included; retain explicit limits otherwise.
- Confirm an unused next version, run the ordered release cut, move all five pins together and re-lock source claims. Replace the scaffold with reviewed notes only at that point.
- Ship website documentation with the matching app release. Do not deploy these unreleased instructions independently.

Internal evidence: [complete integrated change inventory](../../../qa/evidence/customer-release-1011/change-inventory.json), [product coverage](../../../qa/evidence/customer-release-1011/product-coverage.json), [customer process analysis](../../../qa/evidence/customer-process-1011/report.md), and the current queue in [NEXT](../../NEXT.md). These are review aids, not customer release notes.
