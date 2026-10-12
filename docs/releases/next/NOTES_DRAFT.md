# StarNet — next release (draft)

DRAFT updated 2026-10-12 for the release after v0.13.2. This describes the combined isolated candidate through `52cdb7fd`, extending integrated source `a20ffa71f`; it is not a published or installed-verified release. Reconcile the final candidate before copying these notes. `release:bump` replaces root `RELEASE_NOTES.md` with a scaffold; keep the current public release notes intact until the cut.

## Update Center summary draft

Conveyors can hand finished work to another line, delegated work is easier to follow, and chat, voice, local models and recovery receive improvements. Building now uses click-and-drag selection; Shift+drag moves any piece, keys 1-8 select conveyor pieces, and right-click removes a piece. SEND TO can start downstream paid jobs with their own budgets. Back up your station before downgrading; older builds do not understand onward routing.

The summary above is under the Update Center's 520-character limit. Retain the interaction and downstream-cost warnings in the final summary.

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
- **Skill review and approval.** Proposed changes stay separate from the active approved skill through evaluation and rejection; promotion requires owner approval. Larger skill libraries have a searchable overflow index. Reviews retain structured correction and outcome evidence and resume durable pending work after restart. Evaluation charges follow the selected budget policy. Evaluation on Ollama or a Codex, Grok or Kimi sign-in is booked as unmetered at $0, even when it fails, times out or is cancelled, and does not count toward dollar caps. Every other provider is metered, including a Custom endpoint such as a local LM Studio or vLLM server: an unknown charge there, such as usage with no published price, leaves an unsettled receipt, which blocks paid runs under strict caps until the Commander settles it. These changes still require candidate-bound installed acceptance.
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
