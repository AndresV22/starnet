---
fingerprint: d688ea20
slug: unavailable-spend-history-blocks-work-without-us
title: Unavailable spend history blocks work without usable recovery
surface: providers
severity: P1
status: open
found: 2026-10-11
lane: memory-proof-1011
fix:
origin: customer
report: support-2026-10-01-to-09-spend-history-seven-reports
affected: Seven independent reports; Windows x64 and Intel or Apple Silicon Mac; 0.12.5 through 0.13.1 where specified
family: spend-history-blocking
installer: unverified
recovery: persists
recoveryEvidence: One Apple Silicon customer updated to 0.13.1 on October 7 and repeated the same Run Now failure on October 9; other reports have individual outcomes below.
---

# Unavailable spend history blocks work without usable recovery

## Symptom

Interactive agents, specialists and scheduled work refuse to run because spend history is unavailable or unknown. Some scheduled failures show zero current spend or a budget-exhausted message, while customers cannot find a usable supported recovery action. Seven threads share this symptom, not a proven common cause.

## Repro

Customer-reported sequences, not locally reproduced:
1. On an affected installation, attempt the originally blocked entry point: interactive agent, specialist, Run Now or night shift.
2. Preserve the refusal, exact build/provider and relevant unsettled receipt state before changing anything.
3. Exercise the supported review/settlement path only with verified amounts, then retry and restart.
Do not reset ledgers, manufacture zero historical spend or weaken unknown-spend admission guards. A funded account or a working provider health probe does not prove historical spend is known.

## Evidence

Intake E04 groups seven independent threads; follow-up replies are not additional reports:

- SH01, October 6-9: Apple Silicon M4 Mac, initially 0.12.5/OpenRouter; scheduled work after downtime fails immediately. Updated to 0.13.1 October 7; Run Now still fails, reiterated October 9.
- SH02, October 9: 0.13.1 Windows x64; all agents fail despite a replacement OpenRouter key and a reported successful Doctor roundtrip. Restart does not help. Support suggested 0.13.2; no subsequent retest.
- SH03, October 9: 0.13.1 Windows x64 managed; funded balance reported, repeated history refusal. Recovery unconfirmed.
- SH04, October 7: specialist work blocked; customer describes an interrupted run without settlement, spendUnknown and billing lookup HTTP 401. Platform/build unspecified. This receipt is evidence for this report only.
- SH05, October 6: 0.13.1 Windows x64/Anthropic; previously working, then fails overnight. Restart, reinstall and an additional key reportedly did not help.
- SH06, October 2-3: 0.12.5 Intel Mac/DeepSeek direct, other providers also fail; restart during a hung run. Customer was already on the version support recommended. Recovery remains unconfirmed after subsequent source changes.
- SH07, October 1: history-unavailable refusal; build/platform unspecified. No verified recovery.

Dedup: 1746d326 is the opposite safety defect (unknown history granting headroom), not a customer recovery record. Related sources 0893f19cb, d5af7c27f, 353fd91fe, eed3c5c4a and f24467d49 cover different receipt, settlement and display paths. Do not infer a shared mechanism or delivered repair from ancestry. No exact symptom record found on a20ffa71f or cbbf376dad.

Investigation anchors: test/spend-authority.test.js and test/spend-authority.http.test.js. These identify the authority boundary, not proof that any affected customer recovered. Exact installer acceptance and per-report recovery remain outstanding.

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._

## Regression



## Sibling coverage
