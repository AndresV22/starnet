---
fingerprint: 1df2d6f8
slug: peer-owner-matches-unrelated-loopback-sockets
title: Local peer ownership can match an unrelated loopback socket
surface: safecell
severity: P1
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: f7553cd3e19a00873cf702913da85358e2181303
origin: audit
---

# Local peer ownership can match an unrelated loopback socket

## Symptom

The same-user page-token boundary could authorize a connection using ownership of a different local socket with the same port. Linux ignored exact addresses and connection state; Darwin accepted lsof owner rows without matching socket endpoints; Windows matched only the server port. Separately, its positive PID cache could assign an old owner verdict to a recycled PID within 15 seconds, despite a different exact socket.

## Repro

1. Run test/peerowner.test.js against the pre-repair peerowner source.
2. Inject two Linux proc rows sharing ports: the station owner on 127.0.0.1 and another uid on 127.0.0.2. Ask about the second socket.
3. Also inject Darwin owner rows for the same client port connected to a different server, and a Windows netstat row with a different server address.
4. The old implementation incorrectly accepts the unrelated ownership evidence.
5. For PID reuse, first prove PID 4242 belongs to the owner; hold the injected clock inside the former cache window, move PID 4242 to another exact client socket, and make the filtered tasklist result empty. The old cache incorrectly returns same-user without consulting tasklist. A subsequent failed lookup also inherits that stale verdict.

## Evidence

Production-factory injection reproduced the Linux cross-address false authorization. The first Linux regression stage failed 6 assertions; the following Darwin/Windows stage failed 5 assertions. After the fix, all 45 injected assertions pass. The complete test/peerowner.test.js then passed all 46 assertions on Windows, including the real child-process HTTP owner check. test/sidecar.security.test.js passed 35 assertions against an isolated real sidecar, including same-user token injection and token-gated API reads. sidecar/index.js:26756 now supplies the socket localAddress. sidecar/peerowner.js binds both endpoints and Linux ESTABLISHED state. The Linux and Darwin cases use realistic injected OS rows, not native cross-user attempts. WSL is not installed on the audit host; macOS is unavailable. Exact endpoint source repair: 9aee8e7fcd8a27f57ceb3900af8c8eace55d5f3c.

Independent review found the separate Windows positive-PID cache gap. The revised regression fails 4 assertions and passes 45 on the prior source, including incorrectly accepting the recycled PID and skipping a failed current lookup. Repair f7553cd3e19a00873cf702913da85358e2181303 removes the positive cache and obsolete composition clock. All 49 assertions pass after the repair, including the actual Windows owner child; all 35 real-sidecar page/API assertions pass again. PID reuse is injected, not an actual cross-user exploit.

Detailed source and scope evidence: qa/evidence/runtime-sweep-2026-10-11/coverage.json.

## Verdict

The source candidate preserves fail-closed ownership and requires exact connection evidence. Missing local address, absent or stale Linux row, unrelated lsof connection and wrong Windows server address refuse the token. Windows now performs a fresh tasklist ownership check for every exact connection; no timed PID verdict survives process reuse. The same-user Windows OS and sidecar page/API paths are verified. Linux/macOS native behavior, foreign-user end-to-end refusal and installed build acceptance remain separate verification gaps.
