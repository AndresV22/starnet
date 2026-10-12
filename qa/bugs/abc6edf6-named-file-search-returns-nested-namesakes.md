---
fingerprint: abc6edf6
slug: named-file-search-returns-nested-namesakes
title: A named-file search also returns nested files with the same name
surface: safecell
severity: P2
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: 15c01f97bc930032f7a4e17c79d7481fa1be4ac8
origin: audit
---

# A named-file search also returns nested files with the same name

## Symptom

Searching one explicit file recursively searched its parent directory and admitted every descendant with that basename. An unrelated earlier file could also consume max_files and replace the requested file in the result.

## Repro

1. Create docs/guide.md containing SCOPE_MARK requested and docs/a-first/guide.md containing SCOPE_MARK unrelated.
2. Call fs.search with path docs/guide.md, query SCOPE_MARK, and content/files_only/count modes, then target files.
3. Repeat with max_files 1 and both actual ripgrep and the walker fallback.
4. Before the repair, nested namesakes leak into results or displace the exact target.

## Evidence

test/fs.search-gitignore.test.js failed 6 assertions before the fix and passed all 77 afterward, exercising actual ripgrep 15.1 and the production walker. A separate synthetic real-file production-tool probe returned both nested/result.txt and result.txt for explicit path result.txt before the repair. test/fs.jail.test.js passed 125 assertions and test/pathtrust.test.js passed 73. Source sidecar/tools/builtin/fs.js:994-1115 now keeps exact relative identity, passes an explicit file operand to ripgrep, and gives the walker only the already-authorized file. The historical parked-output repair 4a4dc6908 was already integrated in a20ffa71f; this closes a separate nested same-name edge rather than replacing that work.

## Verdict

The exact-file source repair is covered by real filesystem and ripgrep checks. Existing path trust, size, binary, regex and output-mode checks remain active. The extended test/project-parked-output.e2e.test.js also exercises the native tool through a real sidecar/provider run in a trusted project: unchanged historical fs.js fails 3 assertions and passes 12; repaired source passes all 15. Fixture commit 961f3ea2525b13040a46a4ece618ad6f27db2fc8. Installed customer workflow acceptance remains unverified.
