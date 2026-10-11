---
fingerprint: 8bdf73bb
slug: checkpoint-maintenance-bypass-and-orphan-git-pac
title: Checkpoint maintenance bypass and orphan Git pack processes
surface: autonomy
severity: P1
status: fixed
found: 2026-10-11
lane: issue-triage-1011
fix: b387d48ab
origin: customer
report: https://github.com/androoAGI/starnet/issues/107
affected: v0.13.2 macOS Apple Silicon
family: checkpoint-maintenance
installer: unverified
recovery: unconfirmed
---

# Checkpoint maintenance bypass and orphan Git pack processes

## Symptom

The public report describes 41 GB of temporary checkpoint pack files on macOS Apple Silicon. Source reproduction establishes narrower lifecycle gaps: unchanged snapshots skip maintenance; failed cleanup is reported indistinguishably from GC success; and the old execFile timeout kills only the Git leader. This repair does not claim to reproduce the reported growth rate or customer recovery.

## Repro

Run node test/checkpoint-maintenance.test.js and node test/checkpoint-maintenance.e2e.test.js. Both use real Git and synthetic workspaces. Insert 128 KiB of temporary pack data above a 96 KiB test ceiling, then request a snapshot of unchanged files. Before repair the pack survives and GC is never called. The seeded sidecar fixture exercises authenticated /api/autonomy/write and /api/checkpoint/restore, including restart and undo. No customer workspace or provider is used.

## Evidence

- test/checkpoint-maintenance.test.js: baseline failed unchanged-snapshot enforcement and cleanup checks. After repair, 23 assertions cover cleanup, failure reporting, same-agent cross-root serialization, surviving replacement IDs, run correlation and rollback on index-persistence failure.
- test/checkpoint-git.test.js: 14 assertions prove real owned descendant termination on timeout/abort, separate stdout/stderr parsing, bounded output and nonzero overflow failures.
- test/checkpoint-maintenance.e2e.test.js: seeded sidecar returned write=200, garbageRemoved=true, listed=true, restore=200, restartUndo=200.
- Existing checkpoint-store59, checkpoint-restore-undoable45, checkpoint-default-on14, module-scope-shadowing7 and environment134 assertions passed in the repair worktree.
- No conflicting #107 implementation was found in reconciled Claude source branches. This uses the existing environment process supervisor and preserves current workspace leases and project authorization.

## Regression

Before: unchanged snapshots bypassed the ceiling, failed GC could be labelled as successful maintenance, replacement could return a deleted SHA, and Git child processes were not supervised as a tree. After: public checkpoint mutations serialize per agent; successful, unchanged and failed snapshots attempt explicit maintenance; detached automatic Git maintenance is disabled; actual maintenance pressure is reported; replacement returns its surviving indexed SHA; old history remains until the replacement index is durable. The shared supervisor stops the owned Git process tree and overflow is a non-success result.

The ceiling remains best effort: a single baseline can itself exceed the limit, and an I/O failure can prevent reclamation. No arbitrary live pack files are deleted. The reported multi-hour macOS leak, exact installer and customer retest remain unverified. Full aggregate fast/http gates are recorded separately and are not implied by these focused results.

## Sibling coverage

{"adapters":[{"target":"local shadow Git","state":"covered","test":"test/checkpoint-maintenance.test.js","scenario":"real Git maintenance, replacement and failure rollback","gate":"http"},{"target":"SSH checkpoints","state":"not-applicable","reason":"SSH owns a separate remote snapshot implementation; this repair changes only local shadow Git."}],"entrypoints":[{"target":"autonomy write and manual restore","state":"covered","test":"test/checkpoint-maintenance.e2e.test.js","scenario":"authenticated real seeded sidecar write, maintenance and restore","gate":"http"},{"target":"normal fs mutation hook","state":"covered","test":"test/checkpoint-default-on.test.js","scenario":"default-on dispatch and precise hook wiring; structural only","gate":"fast"}],"displays":[{"target":"checkpoint API list","state":"covered","test":"test/checkpoint-maintenance.e2e.test.js","scenario":"returned maintenance receipt remains present in the UI-facing list","gate":"http"},{"target":"macOS installed app","state":"blocked","reason":"This Windows source session cannot verify the reported Apple Silicon installer or multi-hour growth rate."}],"lifecycle":[{"target":"restart and undo","state":"covered","test":"test/checkpoint-maintenance.e2e.test.js","scenario":"restore after maintenance then restart and undo the restore","gate":"http"},{"target":"Git timeout, abort and output overflow","state":"covered","test":"test/checkpoint-git.test.js","scenario":"real owned process descendants stop and output overflow is not success","gate":"http"}]}
