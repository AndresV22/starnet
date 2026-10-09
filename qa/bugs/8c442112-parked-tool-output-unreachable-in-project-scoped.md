---
fingerprint: 8c442112
slug: parked-tool-output-unreachable-in-project-scoped
title: Parked tool output unreachable in project-scoped runs (relative .output pointer resolves against the project)
surface: sessions
severity: P1
status: open
found: 2026-10-09
lane: agent/park-path-fix
fix:
origin: unknown
---

# Parked tool output unreachable in project-scoped runs (relative .output pointer resolves against the project)

## Symptom

In a session anchored to a project folder, a tool call whose output is too big for one turn is clamped and the
note says "THE FULL OUTPUT WAS SAVED to .output/<file>.txt — read that file". Reading that exact path fails with
"no such file", so the agent hunts for its own saved output (shell `Get-ChildItem` sweeps of the user profile)
instead of working: the harness gauntlet `bigraw` scenario took ~720–770 s in StarNet vs ~30–90 s in Claude Code
and Codex, reproduced 2/2.

## Repro

1. Bless a project folder and start a project-scoped `/api/run` (`projectRoot` set).
2. Have the agent run a command that prints more than the per-call cap (e.g. 150 KB via `shell.exec`).
3. The clamp note names `.output/shell.exec-<run>-0.txt`; call `fs.read` with that exact string.
4. `ERROR: tool fs.read failed: no such file: .output/shell.exec-…txt` — the relative path resolves against the
   project (`sidecar/tools/builtin/fs.js` `resolveInside`), while the park lives in the agent jail
   (`sidecar/output-artifacts.js` `paths()`).

Automated: `node test/project-parked-output.e2e.test.js`.

## Evidence

- `test/project-parked-output.e2e.test.js` on trunk 54899e5ff: `FAIL: fs.read of the exact pointer string succeeds:
  ERROR: tool fs.read failed: no such file: .output/shell.exec-b1b0a5b7-c575-4ce7-801b-d266a6d28c3b-0.txt`
  (4 problems, 7 ok).
- Harness gauntlet receipts: `qa/audits/harness-gauntlet-2026-10-08/` on `agent/harness-gauntlet-1008`
  (REPORT.md gap G1; `results/bigraw-starnet-r1.json`, `-r2.json`).
- Siblings carrying the same relative pointer: `sidecar/shellbg.js` (`outputPath`, shown by `shell.bg.status` /
  `shell.bg.read`), `sidecar/terminal-sessions.js` (shown by `terminal.read`), the worker spill in
  `sidecar/tools/builtin/orchestration.js` (parks via `ctx.parkOutput`). Related: `fs.search` on a single file
  threw ENOTDIR, though every clamp note says "search it".

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._
