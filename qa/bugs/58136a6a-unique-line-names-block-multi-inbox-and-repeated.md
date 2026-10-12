---
fingerprint: 58136a6a
slug: unique-line-names-block-multi-inbox-and-repeated
title: Unique line names block multi-inbox and repeated template builds
surface: autonomy
severity: P2
status: claimed
found: 2026-10-12
lane: agent/session-handoff-1011
fix:
origin: audit
---

# Unique line names block multi-inbox and repeated template builds

## Symptom

The built-in Two ways in line and a second software preset are refused as having no clear space, even when a suitable room is available.

## Repro

Run test/station-builder.test.js on combined source 718b13dc5. Plan the two_doors template on a fresh station, then plan the software preset beside an existing software layout. Both built-in configurations must remain buildable and keep distinct lines uniquely named.

## Evidence

The full remaining-fast diagnostic failed this suite with 2 failures and 5504 passing assertions: two_doors plans by id and software rooms beside a busy station. The saved log is .handoff/fast-diagnostic-all.log at canonical step936. The builder rejects candidate placements internally with the line could not be named: two_doors has one derived component containing two intakes, and software reuses an existing BUILD & TEST label. These naming refusals are masked by the placement search as no clear space. Source anchor: frontend/app/stationbuilder.js; regression anchor: test/station-builder.test.js.

## Verdict

Recovery owner is repairing canonical same-line labels and deterministic unique names for distinct new lines. Existing lines must never be renamed. Focused and seeded live acceptance remain required.
