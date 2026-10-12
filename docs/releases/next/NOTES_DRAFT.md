# StarNet — next release (draft)

DRAFT updated 2026-10-11 for the release after v0.13.2. This describes integrated source through `a20ffa71f`, not a published or installed-verified release. Reconcile the final candidate before copying these notes. `release:bump` replaces root `RELEASE_NOTES.md` with a scaffold; keep the current public release notes intact until the cut.

## Update Center summary draft

Conveyors can hand finished work to another line, delegated work is easier to follow, and chat, voice, local models and recovery receive improvements. Building now uses click-and-drag selection; Shift+drag moves any piece, keys 1-8 select conveyor pieces, and right-click removes a piece. SEND TO can start downstream paid jobs with their own budgets. Back up your station before downgrading; older builds do not understand onward routing.

The summary above is under the Update Center's 520-character limit. Retain the interaction and downstream-cost warnings in the final summary.

## User-facing changes included in source

- **Conveyors and onward work.** Build lines by dragging between machines. SEND TO passes an OUTBOX's finished job to another line's INBOX while preserving the producing workspace and the target line's own crew, job record and budget. COPY, TAKE TURNS and SPLIT THE JOB retain their distinct routing behavior.
- **Floor editing.** Box-select or double-click a whole line; copy, cut, paste and duplicate with Ctrl+C/X/V/D. Line cards include COPY LINE and DELETE LINE. R flips a belt corner, Q copies the piece under the pointer, and Alt shows settings.
- **Agent-built floors.** Agents can plan onward connections, line copies and whole-line removal. Plans disclose removed connections, repeated templates receive distinct line names, and readiness follows the published floor.
- **Delegated work.** A parent conversation shows each dispatched worker's work and report, including requests that need your attention. Worker files keep their project identity. Scoped builder lending lets an approved worker carry out its assigned floor-building job.
- **Conversation files and review.** File and review trays retain context, completed items can be cleared and restored, and unresolved items remain visible. Streaming scroll, long composer behavior and image loading receive fixes.
- **Voice and paired devices.** Local speech uses an improved synthesis/effect path with saved choices. A separate spoken-turn model can be selected without changing typed-chat routing. Paired-device audio transport receives reliability improvements; device acceptance remains listed below.
- **Display controls and rendering.** Lighting has a persistent 0-100 control, keyboard text-size controls are available, and unchanged or offscreen scene work is reduced. No universal performance or memory-usage guarantee is implied.
- **Memory and feedback.** Earlier post-0.13.2 source work strengthens saved-memory and approved design-reference handling, stop explanations and channel steering. The later deep-sweep refinements are still under review and are not included in this integrated snapshot.
- **Connectors and channels.** Connector storage distinguishes locked encrypted data from an empty fallback store; starting fresh preserves verified recovery copies. Discord and Signal setup guidance covers additional failure and private-recipient cases.
- **Local models.** Ollama request formatting accommodates strict system-message templates. Timeout messages describe what StarNet observed. The separately reported long wait before an Ollama chat request is still under investigation.
- **Files and child tools.** Browser uploads resolve the current project's file and verify what was selected. Ambiguous file patches are refused before writing; Windows child tools retain their required runtime environment. Selecting an upload is not proof that the destination website accepted it.
- **Fresh start and recovery.** Automatic legacy recovery respects an explicit erase/fresh start while preserving deliberate restore options.
- **Checkpoint maintenance.** Maintenance also runs for unchanged snapshots, supervises Git work, and preserves recoverable history during replacement. The original customer's multi-hour macOS disk-growth scenario still needs affected-platform acceptance.

## Security

Local authorization and instruction-provenance hardening is included in source. Final public notes must describe only the fixes accepted in the signed candidate; keep exploit details out until the corrected build is available. The pending issue batch and fresh cross-user report require separate reconciliation before the cut.

## Heads-up for upgrades

- MOVE is retired: click to select, then drag onto open floor to move. Shift+drag moves any piece. On the Conveyors tab, 1-8 pick pieces instead of the old tool shortcuts.
- Right-click removes a machine or belt. Delete on a whole-line selection removes that line; Undo restores it.
- An OUTBOX hands work to an INBOX through SEND TO, never through a belt. A belt cannot close a circle except a LOOP's valid back lane.
- RUN ONE REAL JOB can start downstream paid jobs when SEND TO is set. The target line has its own cost and budget.
- Keep a station backup before downgrading: older builds do not understand onward routing.

## Before the cut

- Reconcile the pending issue batch and fresh email, GitHub and Whop intake. The Windows 0.13.2 packaged-backend startup report `85f602c4` remains open; no repair or customer recovery is claimed.
- Complete exact-candidate source gates, Guardian/readiness, installed first use and upgrade/data continuity, native lifecycle, and the required product acceptance waves. Current source test passes do not authorize release.
- Verify physical companion audio, real connector accounts and affected provider/platform cases where those claims are included; retain explicit limits otherwise.
- Confirm an unused next version, run the ordered release cut, move all five pins together and re-lock source claims. Replace the scaffold with reviewed notes only at that point.
- Ship website documentation with the matching app release. Do not deploy these unreleased instructions independently.

Internal evidence: [complete integrated change inventory](../../../qa/evidence/customer-release-1011/change-inventory.json), [product coverage](../../../qa/evidence/customer-release-1011/product-coverage.json), [customer process analysis](../../../qa/evidence/customer-process-1011/report.md), and the current queue in [NEXT](../../NEXT.md). These are review aids, not customer release notes.
