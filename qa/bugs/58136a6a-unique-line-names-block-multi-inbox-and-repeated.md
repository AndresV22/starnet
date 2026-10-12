---
fingerprint: 58136a6a
slug: unique-line-names-block-multi-inbox-and-repeated
title: Unique line names block multi-inbox and repeated template builds
surface: autonomy
severity: P2
status: fixed
found: 2026-10-12
lane: agent/session-handoff-1011
fix: 07b522235232032e2b85a4cf201937fc85ebf1f0
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

Canonical naming now reserves one name per derived line and deterministic unique names for repeated templates without renaming existing lines. Focused suites passed 5563 + 63 + 73 assertions. Seeded model-to-tool-to-browser verification passed 11 checks on exact served source f51eedfc391f5ec4f87d986adae79cdc984c3e97872c72901719552c596958e3: two_doors published one line with two intakes and ready true, repeated software published a unique BUILD & TEST 2 label and truthfully reported two missing crew, and both single Undos restored exact floors. Private receipts: conveyor-agentops-codex-1011/.dogfood/builder-naming-live-receipt.json. Full combined gates remain pending.
