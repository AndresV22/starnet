---
fingerprint: 082ee8e5
slug: shell-approvals-and-history-hide-full-command-ar
title: Shell approvals and history hide full command arguments
surface: safecell
severity: P1
status: open
found: 2026-10-11
lane: memory-proof-1011
fix:
origin: customer
report: support-2026-10-08-to-09-shell-request-visibility
affected: Two independent reporters, three threads; reported 0.13.1 Windows with Ask enabled and Full Access disabled
family: shell-consent-history-visibility
installer: unverified
recovery: unconfirmed
---

# Shell approvals and history hide full command arguments

## Symptom

Customers cannot inspect the complete PowerShell or JSON command arguments before approving shell execution. Execution history also shows a shortened representation. They request expansion or copying of the full request so approval can be informed.

## Repro

Customer-reported sequence; exact affected installer not locally reproduced:
1. In Ask mode with Full Access disabled, request a harmless long shell command with distinguishable beginning, middle and ending text.
2. Before approving, inspect every available preview, expansion and copy action for the complete redacted command and explicit truncation markers.
3. If approved in a controlled fixture, inspect the resulting execution history and compare its visible/copyable representation with the request.
Test approval and historical visibility separately; do not disable consent or content-trust controls.

## Evidence

Intake E06 contains two independent reporters: October 8 detailed report and October 9 initial plus follow-up copies from one other reporter (deduplicated). The October 8 customer describes source-archive summary clipping, but the archive commit was not verified. October 9 evidence establishes the displayed representation, not whether complete arguments were stored. A separate outside-content shell refusal is not evidence of an approval bypass or the cause of truncation.

Dedup: 48c51661 covers omitted file-edit mutations, not this shell/history report. Related source 4c89890bc adds full redacted non-file request inspection/copy with bounded size, and 80e56c7cb exposes pending consent arguments. Presence in source does not establish installed delivery, historical completeness or customer recovery. No exact record found on a20ffa71f or cbbf376dad.

Investigation anchors: test/consent-full-request.test.js and test/consent-full-args.test.js. Historical bytes that were never retained cannot be reconstructed. No post-fix customer retest is available.

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._

## Regression



## Sibling coverage
