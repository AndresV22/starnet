---
fingerprint: f702f2f6
slug: approved-skill-is-withheld-from-autonomous-worke
title: Approved skill is withheld from autonomous workers
surface: skills
severity: P1
status: open
found: 2026-10-11
lane: memory-proof-1011
fix:
origin: customer
report: support-2026-10-11-approved-skill-worker
affected: Reported 0.13.0 macOS; exact installer artifact unverified
family: skill-approval-worker
installer: unverified
recovery: persists
recoveryEvidence: October 11 report repeats the denial with a fresh autonomous worker after fully quitting and reopening the app.
---

# Approved skill is withheld from autonomous workers

## Symptom

A saved skill displays Active and approved. The watched lead can load its full body, but an autonomous worker requesting the same skill receives a guard denial requiring Commander approval in ABILITIES > SKILLS. Work stops before image generation; the customer reports zero image calls and no output.

## Repro

Customer-reported sequence, not locally reproduced:
1. Save and approve a skill, then confirm that a watched lead can read it.
2. Ask an autonomous worker to load the identical skill.
3. Fully quit and reopen the app and retry with a fresh worker; the customer reports the same denial.
Capture skill content digest, approval scope, worker identity and guard decision without bypassing the guard.

## Evidence

October 11 sanitized customer report, intake E02. The saved skill and queue were preserved. Restart plus a fresh worker did not restore access.

Dedup: c70f8965 concerns skill hydration changing stored content and approval digests. That is a possible neighboring mechanism, not a demonstrated cause here; no exact customer record was found on trunk a20ffa71f or candidate cbbf376dad.

Investigation anchors: test/skills.review-approval.test.js and sidecar/tools/builtin/skills.js. Existing coverage is not proof of this report's resolution. Compare lead and worker approval scope/content version before attributing the failure. No source fix, installer acceptance or customer recovery is claimed.

## Verdict

_Filled in when the bug leaves the backlog: what was true, and why it is closed._

## Regression



## Sibling coverage

## Shadowing proposal repair — 2026-10-14

Not reproduced as reported (0.13.0 had no skill sharing, so a worker with a different agent id could not read another agent's skill at all; the exact denial path for that build is unknown). On the candidate, real store, package mirror, guard, gate and skill tools show an approved, station-shared skill loads identically for the lead, a named crew worker and a team.spawn helper.

One candidate seam matched the symptom: a worker whose background review had drafted a same-name proposal asked for the approved station skill and was told it awaited the Commander's evaluation and approval in ABILITIES > SKILLS, across restarts, because the lookup prefers the asker's own record and a pending-only proposal counted as one. Source repair df73589b8: a proposal is not an active skill, so the shared skill answers; the proposal stays named as withheld; the asker's own active skill still wins; a lone proposal still says it awaits approval; two other owners stay ambiguous. Regression: test/skills.worker-shared-approval.test.js (failed 6 assertions before the fix).

No installer or customer recovery is claimed; the customer's exact worker id, skill owner and denial text are still needed. The report stays open.
