---
fingerprint: 50c75ec3
slug: interrupted-connector-reset-can-hide-preserved-c
title: Interrupted connector reset can hide preserved credentials
surface: safecell
severity: P1
status: claimed
found: 2026-10-11
lane: agent/session-handoff-1011
fix:
origin: audit
---

# Interrupted connector reset can hide preserved credentials

## Symptom

START FRESH could fail after moving only some credential files, falsely say nothing changed, or boot as an empty store after an interrupted reset.

## Repro

Run test/connector-vault.test.js against ce852b8d6 with the current partial-reset regressions: inject failure on removing the second original or writing the new recovery copy. The original implementation loses the active main path after partial progress. Interrupt a reset after parking both files and restart the sidecar.

## Evidence

Before-fix regression failed with ENOENT reading second-move.json. The updated test/connector-vault.test.js passes copy-readback corruption, partial removal, new-write failure, failed rollback and pending-marker restart cases. Repairs 1a78ef73d and 571ba1dc1 preserve originals, read back every recovery copy before removal, and keep incomplete resets locked. test/connector-storage-start-fresh.http.test.js adds the real sidecar restart/API scenario; the complete scenario passed on the real isolated sidecar, including pending-marker startup, refused retry and unchanged saved bytes. No installed-desktop or affected-user recovery claim.

## Verdict

Claimed by the recovery lane. Source repair implemented; combined gates and live acceptance remain pending.
