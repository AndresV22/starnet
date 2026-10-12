---
fingerprint: 1df2d6f8
slug: peer-owner-matches-unrelated-loopback-sockets
title: Local peer ownership can match an unrelated loopback socket
surface: safecell
severity: P1
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: 9aee8e7fcd8a27f57ceb3900af8c8eace55d5f3c
origin: audit
---

# Local peer ownership can match an unrelated loopback socket

## Symptom

The same-user page-token boundary could authorize a connection using ownership of a different local socket with the same port. Linux ignored exact addresses and connection state; Darwin accepted lsof owner rows without matching socket endpoints; Windows matched only the server port.

## Repro

1. Run test/peerowner.test.js against the pre-repair peerowner source.
2. Inject two Linux proc rows sharing ports: the station owner on 127.0.0.1 and another uid on 127.0.0.2. Ask about the second socket.
3. Also inject Darwin owner rows for the same client port connected to a different server, and a Windows netstat row with a different server address.
4. The old implementation incorrectly accepts the unrelated ownership evidence.

## Evidence

Production-factory injection reproduced the Linux cross-address false authorization. The first Linux regression stage failed 6 assertions; the following Darwin/Windows stage failed 5 assertions. After the fix, all 45 injected assertions pass. The complete test/peerowner.test.js then passed all 46 assertions on Windows, including the real child-process HTTP owner check. test/sidecar.security.test.js passed 35 assertions against an isolated real sidecar, including same-user token injection and token-gated API reads. sidecar/index.js:26756 now supplies the socket localAddress. sidecar/peerowner.js binds both endpoints and Linux ESTABLISHED state. The Linux and Darwin cases use realistic injected OS rows, not native cross-user attempts. WSL is not installed on the audit host; macOS is unavailable. Detailed source and scope evidence: qa/evidence/runtime-sweep-2026-10-11/coverage.json.

## Verdict

The source candidate preserves fail-closed ownership and requires exact connection evidence. Missing local address, absent or stale Linux row, unrelated lsof connection and wrong Windows server address refuse the token. The same-user Windows OS and sidecar page/API paths are verified. Linux/macOS native behavior, foreign-user end-to-end refusal and installed build acceptance remain separate verification gaps.
