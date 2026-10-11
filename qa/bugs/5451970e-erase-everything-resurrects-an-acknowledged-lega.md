---
fingerprint: 5451970e
slug: erase-everything-resurrects-an-acknowledged-lega
title: Erase Everything resurrects an acknowledged legacy station on restart
surface: onboarding
severity: P1
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: 553cfa55d45afca1b588cb0b82219d6bb5673cab
origin: customer
report: https://github.com/androoAGI/starnet/issues/101
affected: Windows 11 x64, official StarNet v0.13.2; source f2e1e91bb also reproduced
family: erase-recovery-authority
installer: unverified
recovery: unconfirmed
---

# Erase Everything resurrects an acknowledged legacy station on restart

## Symptom

After ERASE EVERYTHING, the next Windows boot can replace the clean generation with an old station retained under the install-root legacy workspace. Credentials are erased while old agents and settings return. Native erase intentionally protects install assets, but automatic sidecar recovery previously ignored the clean generation's explicit erase marker.

## Repro

1. Create a valid legacy station under a synthetic LocalAppData/StarNet/workspaces root.
2. Create an empty active generation with the native-shaped .fresh-start.json marker: version 1, erased true, and the legacy root acknowledged.
3. Boot the production recovery path with one valid candidate.
4. Before the repair, the candidate is copied into the active root and its older marker overwrites the erase choice. The source and rollback remain, but the app resumes the unwanted old station.

## Evidence

Public issue #101 describes the official v0.13.2 Windows reproduction. The source mechanism is sidecar/workspace-recovery.js automatic selection of a single recoverable root without reading fresh-start authority; src-tauri/src/main.rs intentionally excludes install-root paths from native deletion.

The new test/workspace-recovery-fresh-start.test.js failed 29 assertions on the unchanged f2e1e91bb recovery implementation: old state returned and the active marker changed. The original synthetic-module receipt additionally observed applied true, markerErased false and empty acknowledgedRoots.

After the repair, the focused regression passes 59 assertions. Existing workspace-recovery (66), workspace-lineage (86), and desktop-fresh-start-contract (19) assertions pass. test/workspace-recovery-fresh-start.http.test.js passes 18 assertions against real production-mode sidecar processes, using only synthetic profile/workspace roots. It verifies two erased-generation boots, clean onboarding/save telemetry, the actual ERASE recovery reason, authenticated explicit restore, preserved source and rollback marker, and a later restored-station restart. No user station, native install assets, or credentials were erased.

## Verdict

The isolated source repair is verified by focused tests and genuine sidecar boot/restart behavior. Automatic recovery preserves an erased generation and excludes ordinary START FRESH acknowledged roots. Invalid or unreadable markers block automatic replacement. Explicit authenticated recovery remains available and keeps the prior generation in rollback. Native deletion policy is unchanged. Full combined gates are owned by the integration lane; installed Windows/macOS acceptance and customer recovery remain unverified.

## Regression

Before: a valid native erase marker was ignored and automatic recovery reactivated the rejected source. The regression failed 29 assertions on unchanged source.

After: erased:true prevents every automatic import; ordinary START FRESH suppresses exact acknowledged roots with Windows case-insensitive matching, not path prefixes; absent markers preserve ordinary recovery; malformed markers and read-denied markers fail automatic recovery closed. Candidate inspection and explicit operator restore remain available. Real production-mode boot, restart, authenticated restore and another restart prove the lifecycle without invoking native erase on a real station.

## Sibling coverage

{
  "adapters": [
    {"target":"sidecar automatic legacy recovery","state":"covered","test":"test/workspace-recovery-fresh-start.test.js","scenario":"erase marker, acknowledged-root matching, absent marker and malformed/unreadable marker authority","gate":"fast"},
    {"target":"native erase marker format","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"real production sidecar consumes native-shaped erased marker before constructing stores","gate":"http"},
    {"target":"installed native erase implementation","state":"blocked","reason":"Native deletion policy is unchanged; no installed app erase was invoked, and exact Windows/macOS installer acceptance remains required."}
  ],
  "entrypoints": [
    {"target":"automatic startup","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"old legacy station remains preserved but is not imported into erased generation","gate":"http"},
    {"target":"authenticated explicit recovery","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"POST /api/lineage/recover followed by real restart intentionally restores selected source","gate":"http"},
    {"target":"ordinary START FRESH","state":"covered","test":"test/workspace-recovery-fresh-start.test.js","scenario":"acknowledged roots excluded from auto recovery while unrelated source remains eligible","gate":"fast"}
  ],
  "displays": [
    {"target":"save and lineage telemetry","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"save remains null, onboardingAllowed true and skip reason names ERASE rather than scratch workspace","gate":"http"},
    {"target":"packaged Windows WebView2 and macOS WKWebView","state":"blocked","reason":"No rebuilt installer or native renderer interaction was performed; source HTTP evidence does not establish packaged UI recovery."}
  ],
  "lifecycle": [
    {"target":"repeated post-erase boot","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"fresh generation and marker survive real sidecar boot and restart","gate":"http"},
    {"target":"explicit restoration and rollback","state":"covered","test":"test/workspace-recovery-fresh-start.http.test.js","scenario":"source bytes and superseded erase marker retained; selected restored station survives another restart","gate":"http"},
    {"target":"marker corruption and denied reads","state":"covered","test":"test/workspace-recovery-fresh-start.test.js","scenario":"invalid JSON/version/root/erase flag and EACCES refuse automatic replacement","gate":"fast"}
  ]
}
