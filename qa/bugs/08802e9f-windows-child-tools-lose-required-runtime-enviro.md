---
fingerprint: 08802e9f
slug: windows-child-tools-lose-required-runtime-enviro
title: Windows child tools lose required runtime environment and launch directory
surface: safecell
severity: P2
status: fixed
found: 2026-10-11
lane: agent/session-handoff-1011
fix: fc3c9132a
origin: audit
---

# Windows child tools lose required runtime environment and launch directory

## Symptom

Windows computer-use, language-server and MCP subprocesses could lose required non-secret OS environment values, and a relative CUA executable could be resolved after changing its working directory.

## Repro

Run test/cua-runtime-env.test.js against pre-recovery source. Launch the fixture executable by a relative path while the driver runs in the isolated temporary working directory; verify required Windows environment values and secret omission.

## Evidence

Before recovery the dedicated environment suite had 8 failures and 1 pass; after fc3c9132a it passes 9 tests including a real executable child. Related suites pass: peerowner 33, cua-computer 12, child-env 80, mcp.stdio 39 and lsp-edit-feedback 38 assertions. The latter uses a real stdio language-server child. Logs remain local under .handoff/audit-env-before.log and .handoff/audit-env-after.log. No physical CUA-driver hardware acceptance claim.

## Verdict

Source repair and real executable/LSP child checks pass. Combined full gates remain required before trunk integration; native CUA device acceptance remains unverified.
