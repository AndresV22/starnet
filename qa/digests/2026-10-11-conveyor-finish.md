# Conveyor finish — 2026-10-11

Owner request: check the new conveyor system and finish it against the current plans.

Baseline: a20ffa71fd04691805ea55c7d08165438dd7ac6f. Work is isolated on agent/conveyor-finish-1012, with independently owned statistics and runtime audit lanes.

## Plan reconciliation

The October 10–11 build-mode integration decisions and docs/DECISIONS.md govern this pass. The June conveyor plan and Phase B state are historical. The locked interaction remains: selected items move; dragging an unselected machine to another connects; floor dragging draws belt; 1–8 hotbar; Q copy; SEND TO links distinct lines and rejects circles; LOOP owns intentional back lanes. Bridges, always-visible junction settings, installer canary and publication remain deferred.

Live seeded-app interaction proof passed five drawn links, cycle rejection with unchanged geometry, selected movement and undo, line copy, all eight hotbar slots, separate SEND TO line ownership, reverse-handoff rejection, and saved-floor reload. There were no page errors or compiled blocking errors. Local receipt: .dogfood/conveyor-finish/gestures-live.json.

## Repairs

- Parallel/JOINER whole-line STEP THROUGH is refused before paid execution. The panel explains RUN ONE REAL JOB and preserves TRY THIS STEP. Legacy saved plans receive the same decision from their topology. Baseline live panel offered the unsupported start; repaired live panel disables it and re-enables it for TAKE TURNS. Same-agent separate lines retain their own step-test capability, including saved plans. Bug 1f4c3e40; sources 30cbb0420, 43e32a761 and 6a479ecd7.
- An already exhausted LINE BUDGET blocks the first stage before provider or script dispatch. Actual sidecar cases cover sample, restart, Run Now, scheduled entry, other-line isolation, direct orders and UTC rollover. This is admission against known spend, not a new concurrent reservation system. Bug f60170b7; source 43e48a086.
- SORTING OFFICE and CODE FOUNDRY have complete output routes for every valid tag. Actual sample runs that formerly returned HTTP 502 after successful work now return HTTP 200 with the expected crew member. Source 9ac0faeec.
- SHIPPED is a durable count of clean productive jobs that actually reached OUTBOX, once per exact entry run. Branches and repeated stages do not inflate it, and later floor edits cannot rewrite it. Restart and read-fault recovery passed against the real sidecar. Unreadable or invalid history returns an error and cannot authorize overwriting old receipts. Historical runs without receipts are not guessed into shipments. Bug 2d0597b0; sources 6bbc690c9 and dbaa73135.

- JOINER-capable lines hold products until an exact backend terminal receipt names the OUTBOX, entry run and successful hop work items. Overlapping jobs cannot borrow each other's productive proof; FILTER alternatives use the proven OUTBOX; duplicate events cannot duplicate the product. Observed talk-only sibling costs contribute mass without inventing productive work. Throughput, XP, Pride and ProfileStore ignore the authority-only receipt. Exact LineWatch run placement prevents two shared-agent lines from swapping identity when B finishes before A; watched direct orders stay direct. Bug 4ba4989f; sources 2b3544130, bd4de9ae2 and 781cafc7c.

Actual sidecar evidence is retained in qa/evidence/conveyor-join-live-events-20261012.json. Browser replay through the real U.bus and Conveyor handlers returned before=0 after an 8.3-second held-sibling interval, after=1 once complete, afterEcho=1, errors=[]. Source and regression review was performed independently by the statistics audit lane.

The actual concurrent sidecar receipt is qa/evidence/conveyor-join-overlap-live-events-20261012.json. A real Run Now job A and sample job B share an agent across two Second Opinion lines. B completes first while A is held. Final seeded Chrome replay returned before=1 on B, after=2 at distinct correct OUTBOXes, afterEcho=2, errors=[]. All four browser scenarios were rerun on source bff8c5030f8af7330498607e4096db731c61a348; the portable results are qa/evidence/conveyor-browser-20261012.json.

## Final validation

The final frontend source and website mirror are synchronized. Focused source and live regression receipts pass, with independent source review finding no remaining blocker. The first fast attempt stopped at step 82/1140 because a sparse-checkout fixture was absent; immutable tracked fixtures were restored. The second stopped at step 720/1140 because the new additive stepTestBarrier advisory was missing from the existing parity metadata whitelist. Commit 6a479ecd7 adds only that field to the whitelist and retains all old-field, hash and executor assertions. Focused parity (28), routing step tests (168), workflow-panel source (57) and multibay assertions (28) pass. These partial runs are not a full-fast PASS.

Release coordination explicitly owns one combined broad gate set after importing the frozen conveyor slice. This lane will not start duplicate fast/HTTP/customer-journey runs or advance trunk independently. Final syntax, QA metadata and claims-lock receipts are recorded with the handoff. Full gate inventory: 1140 fast suites, 210 HTTP suites and 38 customer journey suites.

## Evidence limits

Provider-driven acceptance uses a deterministic local provider against the real sidecar. Seeded browser checks verify the running web app. No fresh installer was built, no installed-desktop acceptance was performed, and no release or publication claim is made. Shared event/schema files, credentials, dependencies and package versions are unchanged.
