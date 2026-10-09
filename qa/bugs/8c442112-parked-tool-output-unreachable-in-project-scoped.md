---
fingerprint: 8c442112
slug: parked-tool-output-unreachable-in-project-scoped
title: Parked tool output unreachable in project-scoped runs (relative .output pointer resolves against the project)
surface: sessions
severity: P1
status: fixed
found: 2026-10-09
lane: agent/park-path-fix
fix: 4a4dc6908
origin: audit
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

Fixed in 4a4dc6908 (+ 9e4d77dcf ratchet follow-up), merged FF to trunk 9e4d77dcf on 2026-10-09. In a project
session the model is now handed the absolute jail path (`visibleOutputPath` in `sidecar/output-artifacts.js`),
which path trust already serves for an agent's own workspace — no new authority. The same rule covers the
`shell.bg.*` and `terminal.read` spill notes; worker spills ride `ctx.parkOutput` and inherit it. `fs.search` on a
single file now searches that file (it threw ENOTDIR). Taint is unchanged: absolute `untrusted-*` parks still taint
(`test/taint-lineage.test.js`).

Proof: `test/project-parked-output.e2e.test.js` 11/11 (fs.read of the exact pointer, offset paging to the elided
middle, fs.search on the file); `npm run test:fast` 1101/1101; `npm run test:http` 196/196 (step 50
station-show.e2e failed once as a timing flake, then passed 2/2 on the branch and 2/2 on clean trunk). Live:
the gauntlet `starnet bigraw` ran 104 s / 160 s / 147 s (all pass, zero Get-ChildItem hunts, the model opened the
absolute parked path directly) vs 772 s / 720 s before. The remaining gap to Claude Code (31 s) is per-turn
`claude -p` latency, gauntlet gap G2 — not this bug.
