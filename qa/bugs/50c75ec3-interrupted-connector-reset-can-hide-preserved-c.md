---
fingerprint: 50c75ec3
slug: interrupted-connector-reset-can-hide-preserved-c
title: Interrupted connector reset can hide preserved credentials
surface: safecell
severity: P1
status: fixed
found: 2026-10-11
lane: agent/session-handoff-1011
fix: abd2914492ca6cfe4db818bb67a872098d4edb56
origin: audit
---

# Interrupted connector reset can hide preserved credentials

## Symptom

START FRESH could fail after moving only some credential files, falsely say nothing changed, or boot as an empty store after an interrupted reset.

## Repro

Run test/connector-vault.test.js against ce852b8d6 with the current partial-reset regressions: inject failure on removing the second original or writing the new recovery copy. The original implementation loses the active main path after partial progress. Interrupt a reset after parking both files and restart the sidecar.

## Evidence

Before-fix regression failed with ENOENT reading second-move.json. The updated test/connector-vault.test.js passes copy-readback corruption, partial removal, new-write failure, failed rollback and pending-marker restart cases. Repairs 1a78ef73d and 571ba1dc1 preserve originals, read back every recovery copy before removal, and keep incomplete resets locked. test/connector-storage-start-fresh.http.test.js adds the real sidecar restart/API scenario; the complete scenario passed on the real isolated sidecar, including pending-marker startup, refused retry and unchanged saved bytes. Independent review found that readback alone was not a durability barrier. Repair abd291449 adds file flushes for every recovery copy before any original deletion and rollback flushes before marker removal. Failure-order tests cover file, directory and parent flush errors plus failed rollback/restart locking. The real connector-storage-start-fresh HTTP scenario passed again on combined source 01f6149. No physical power-loss, installed-desktop or affected-user recovery claim.

## Verdict

Source repair and real isolated sidecar reset/restart acceptance pass. Combined full gates remain required before trunk integration; hardware power-loss and installed-user recovery are unverified.
