# Readiness investigation — 2026-10-11

This is a dated investigation, not a READY receipt. The canonical `qa:ready` snapshot in this directory targets trunk `a20ffa71f` and is RED. New source/record changes require new final-candidate gates.

## Layout receipt mismatch

The Guardian run ending 2026-10-12T02:27:07Z observed `pendingEdits:true` with the truthful unconfirmed routing note. The failing assertion in `test/station-layout.e2e.test.mjs` requires “running the floor as last sent” wording; it does not require a state named pending. `completeLayout` in `sidecar/tools/builtin/station.js` replaces the page's note if the held router hash differs from the page hash. The original failure did not capture both hashes or the publication timeline, so its cause is unresolved.

Coordination ran one isolated instrumented copy of that live fixture on application source equivalent to `a20ffa71f` (coordination commit `2e43c147d` adds documentation only). It used a local mock provider, disposable station and browser, with all normal assertions retained. Routing POSTs/responses, raw page acknowledgements and before/after `World.planStatus()` were recorded privately. All checks passed: the pending request retained the same published plan hash, `pendingEdits:true`, `confirmed:true`, and disclosed the missing drawn-floor agent. No product guard or assertion was weakened. This successful replay does not explain or erase the earlier failure. Retain captured timeline instrumentation if the final combined gate reproduces it.

## Deliverables visual baseline

A fresh `npm run golden` capture on review commit `57fc7f8c4` passed all 16 capture actions and flagged only `work-deliverables`, difference 1.51 against unchanged threshold 1.5. Independent review of the earlier Guardian image and coordination review of the fresh image found the intentional MY WORK introduction/toolbar change already present in October 5 source (`13cefae02`); the stored baseline predates it.

Only the `work-deliverables` 64x40 signature was refreshed from the reviewed image. All 15 other signatures, dimensions and threshold were preserved and programmatically compared. This verifies the shown empty-state layout, not a complete populated-workflow or accessibility audit. The original capture/manifest/report remain in the coordination worktree's private `.uigolden` directory.

## Detector findings and other gates

Three machine-local P1 detector findings remain distinct from tracked customer bugs. Exact-a20 journey runs at 01:00 and 02:00 both passed 139 assertions, including the relevant reload/toggle scenarios. Earlier J3 negative-card output is an exception sentinel after a CDP read failure, not a measured negative card count; the J2 check also substitutes a failure value if reading fails. Those facts support investigation, not a fabricated repair or permanent suppression. No detector evidence was deleted or dismissed by this review.

The beginner receipt and installed smoke previously inspected target older sources; installed smoke identifies 0.12.5. Fresh exact-candidate installed first use, upgrade/data continuity, lifecycle and required product acceptance remain owed. A customer-confirmed recovery is recorded separately and is not inferred from gate success.

## October 12 observation and artifact follow-up

The three retained machine P1s were read independently. `7f25ecb7` records a CDP evaluation timeout; `fd87bfd9` is its subsequent `-1` fallback, not a measured stuck-card count. `dd2fd9c0` conflates a failed evaluation with busy state, while its next parity observation shows no busy or RUNNING rows. Later a20 journey passes do not establish their original cause or a current-candidate repair. No finding was closed or suppressed.

The coordinator now records evaluation failure separately from measured state in the affected J2/J3 checks and retains the actual idle-wait result. Fourteen negative controls pass; the isolated seeded J2c/J3 replay passes 35/35 with idle observed. [Revision and method receipt](journey-observation-diagnostics.json). This focused replay does not replace full final-candidate journeys, Guardian or installed acceptance.

Read-only inspection of the exact signed public Windows 0.13.2 installer found three nonempty source-equivalent modules; see [artifact receipt](windows-0132-artifact.json). Customer installation identity, installed bytes/path, full stack and startup recovery remain unknown.

## October 12 native acceptance preflight

A bounded read-only inspection at source `baa58078b` found no candidate binary in the checked release/build locations. The present installed app and retained native receipts are historical; none attests this candidate. Full private receipt: `.handoff/release-preflight-baa58078b.json`, SHA-256 `cac07ee8284ace955f1a96e70bf1263fb7ca6351eafa1b8bba945936e8e9af6a`. No build, installation, native launch or workflow dispatch was performed.

Native storage uses Tauri app-data resolution (`src-tauri/src/main.rs`); environment overrides alone do not establish profile isolation. The packaged lifecycle driver’s `--app-data` redirects driver files, and cleanup can terminate other StarNet shell processes. Use disposable Windows CI/VM without unrelated StarNet processes. The shortest prepared route is a private `desktop-build.yml` (`publish-test=false`), exact source/artifact identity plus valid Authenticode, then `t0-clean-install-proof.yml` with the build run, installer SHA and verified baseline upgrade. The private T0 path requires signing even though an internal desktop build can emit unsigned artifacts.

Local disk headroom was about 0.87 GB and no usable VM was established. Apple native acceptance still needs the appropriate platform, and attended first-value/real-account/real-provider checks require their own evidence. This operational preflight is not a readiness pass or authorization to publish.
