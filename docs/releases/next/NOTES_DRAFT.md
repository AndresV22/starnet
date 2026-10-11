# StarNet — next release (draft)

DRAFT updated 2026-10-11 for the release after v0.13.2. Not a release. Add one bullet per user-visible trunk
merge as it lands; `release:bump` overwrites `RELEASE_NOTES.md` with a scaffold, so paste the final text from here.
The in-app UPDATE CENTER shows only the first 520 characters of RELEASE_NOTES.md as plain text (no markdown):
keep the headline and any upgrade warnings in the summary line. The v0.12.5 draft and its preparation record are
in `docs/releases/0.12.5/`.

## User-facing

- Build conveyor lines by dragging between machines. The Conveyors hotbar uses keys 1–8; R flips a belt corner, Q copies the piece under the pointer, and Alt shows settings.
- SEND TO passes finished jobs from an OUTBOX to another line’s INBOX. Each line keeps its own crew, job record and budget.
- Box-select or double-click a whole line; copy, cut, paste and duplicate it with Ctrl+C/X/V/D. The line card includes COPY LINE and DELETE LINE.
- The agent can plan SEND TO, line copies and whole-line removal, and its plan names onward connections removed with a line.

## Security

- Local authorization hardening is included in the candidate. Final release notes must name only fixes verified in the signed release; avoid publishing exploit details before the corrected build is available.

## Heads-up (upgrade surprises)

- MOVE is retired: click to select, then drag onto open floor to move. Shift+drag moves any piece. On the Conveyors tab, 1–8 pick pieces instead of the old tool shortcuts.
- Right-click removes a machine or belt. Delete on a whole-line selection removes that line; Undo restores it.
- An OUTBOX hands work to an INBOX through SEND TO, never through a belt. A belt cannot close a circle except a LOOP’s valid back lane.
- RUN ONE REAL JOB can start downstream paid jobs when SEND TO is set. The target line has its own cost and budget.
- Keep a station backup before downgrading: older builds do not understand the new onward routing.

## Before the cut — owed

- Complete candidate gates and installed-app canary; this draft is not release approval.
- Ship website docs with the matching app release. Do not deploy these unreleased instructions independently.
- Use release:bump at the cut to move all five pins, then replace its RELEASE_NOTES scaffold with reviewed notes. Keep the MOVE / hotbar / right-click warnings within the first 520 characters. No version bump or publication is performed by this lane.
