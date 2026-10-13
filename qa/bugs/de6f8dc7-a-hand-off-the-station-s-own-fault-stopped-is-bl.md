---
fingerprint: de6f8dc7
slug: a-hand-off-the-station-s-own-fault-stopped-is-bl
title: A hand-off the station's own fault stopped is blamed on E-STOP
surface: world
severity: P2
status: fixed
found: 2026-10-12
lane: conveyor-final-runtime
fix: af503416f
origin: audit
---

# A hand-off the station's own fault stopped is blamed on E-STOP

## Symptom

When an internal fault quiesced the station (process-fault containment) while a line ran a handed-on job, the job's record said "E-STOP stopped this job", hand-offs refused afterwards said "automation is stopped (E-STOP)", and a trigger's blockedBy said the same, though the Commander never pressed E-STOP.

## Repro

1. A SEND TO hand-off is running on LINE B.
2. An uncaught exception quiesces the station (quiesceForProcessFault sets processFaultQuiesced; halted() reads it).
3. Before af503416f `sidecar/routing/handoff-runner.js` wrote `err = 'E-STOP stopped this job'` for any halted() stop.
Regressions: `test/routing.handoff.test.js` fault block (2 failures before), `test/trigger-sweep.test.js` (1 failure before).

## Evidence

Fix af503416f: both runners take a faulted() dep (processFaultQuiesced and not the Commander's E-STOP) that only picks the words. routing.handoff 82, trigger-sweep 47, routing.triggers 104, trigger-polish 30 OK. Not reproduced live: a process fault needs an injected uncaught exception on the station.

## Verdict

Fixed in source on agent/conveyor-final-runtime (af503416f); unit-proven, not live-proven.
