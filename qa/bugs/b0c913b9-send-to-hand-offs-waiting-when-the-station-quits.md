---
fingerprint: b0c913b9
slug: send-to-hand-offs-waiting-when-the-station-quits
title: SEND TO hand-offs waiting when the station quits vanish without a record
surface: world
severity: P2
status: fixed
found: 2026-10-12
lane: conveyor-final-runtime
fix: f6df7d11f
origin: audit
---

# SEND TO hand-offs waiting when the station quits vanish without a record

## Symptom

A line whose OUTBOX sends on (SEND TO) to a busy line queues its hand-offs in memory. When the station quit or updated, the waiting hand-offs vanished: the sending jobs read DELIVERED with no "sent on" and no "NOT sent on", and the target line had no record of them.

## Repro

1. LINE A SEND TO LINE B; keep B busy with one hand-off while more A jobs finish.
2. Quit StarNet (the desktop shell's POST /api/lifecycle/quit, or SIGTERM).
3. Restart and open both lines in WORKFLOWS. Before f6df7d11f only the running hand-off's interrupted record existed: `sidecar/index.js` gracefulShutdown never called `handoffRunner.haltAll`.
Regression: `test/routing.handoff.e2e.test.js` second test (real sidecar, quit with one running and two waiting; failed before).

## Evidence

Fix f6df7d11f: gracefulShutdown drops each waiting hand-off through the refusal path before the runs are aborted (line-jobs saves synchronously). The new e2e passes 2/2. Live on the isolated station: Line Q1 SEND TO Line Q2, one hand-off running and one waiting, POST /api/lifecycle/quit; the shutdown log says "[handoff] p57 → p60 refused: the station stopped before this hand-off ran — send the job again"; after the restart Q2 shows IT DIDN'T RUN with that reason, the running one INTERRUPTED, and the Q1 job reads NOT sent on to LINE Q2 with why. C:\Users\andro\gen-trees\_final-shots\wave2-runtime\b03-b09-queued-handoff-said-after-quit-target-card.jpg, b03-sender-card-not-sent-on-after-quit.jpg.

## Verdict

Fixed in source on agent/conveyor-final-runtime (f6df7d11f). A hard kill (TerminateProcess, a crash) still skips the graceful path: that needs a durable queued marker on the sending job, a larger follow-up.
