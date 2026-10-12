# Credential recovery investigation — October 12, 2026

Customer report e7b2ffcd remains OPEN and customer recovery unverified. The sanitized E03 record describes Windows 10 / reported 0.13.2, locked Higgsfield credentials, temporary recovery after a historical folder rename, and loss again after quit/reopen. No real credential store, customer profile, account, installer or provider was accessed in this investigation. No native OS account was created or changed. Folder renaming is not a recommended recovery step.

Baseline: bbe1aa106 (coordinated source, fast-forwarded into this isolated lane; no trunk changes or rebase). Existing connector-vault START FRESH preservation and native key read-back fixes were retained, not reimplemented.

## Reproduced narrower defect and repair

After a successful boot, a temporary EACCES reading connectors/state.json during save causes the vault to lock itself with reason unreadable. The API correctly rejects the save, but its separately cached connectorStorageError/connectorStorageReason remain empty. GET /api/connectors therefore presents no storage lock and can still mark storage encrypted/available. The new real-sidecar test failed on unchanged source with actual reason null, expected unreadable. This is a reproduced runtime-status flaw, NOT a demonstrated cause of the original customer losing sign-in.

The patch synchronizes the existing public lock state after a failed credential save or removal only when connectorVault.locked is true. It keeps the vault's actual reason. A write-only ENOSPC refusal is not falsely labelled a locked store. No encryption format, key generation, credential migration, recovery deletion or runtime reconnect policy changes.

## Focused proof

- test/connector-recovery-reconnect.http.test.js: actual production sidecar processes with isolated temporary workspace/profile roots and synthetic keys. Eight boots exercise wrong-key refusal, explicit START FRESH, saving a new synthetic token, quit/restart, absent/restored key, ENOSPC write refusal, and EACCES during save/removal. Original primary and backup recovery copies remain byte-for-byte unchanged. Refused reads preserve active main/backup bytes; write failure preserves the prior token across restart. Public connector state does not contain synthetic token values.
- The reconnect fixture is a disabled loopback configuration: saved credential persistence is proven; it never claims a successful Higgsfield handshake, OAuth refresh, browser sign-in, or native keychain operation.
- test/helpers/connector-recovery-fault-host.cjs limits injected faults to exact connector state paths under the fixture-created starnet-credential-recovery-* temporary root. The control file is synthetic and no real profile is inspected.
- Existing connector-vault unit suite passed. The focused HTTP runner passed all three selected suites: connector-vault-invalid, connector-storage-start-fresh, connector-recovery-reconnect. Syntax checks passed. No broad gate was run.
- Raw before/after receipts remain private in .dogfood/credential-recovery-e7b2ffcd/{before,after,vault,focused-http}.log. The registered test is the reproducible receipt; no credentials or customer transcript are committed.

## Native seam and remaining acceptance

src-tauri/src/credentials.rs reads the connectors:encryption:v1 key and creates it only on NoEntry; creation requires successful storage and exact read-back. A malformed or unavailable existing value is not deliberately replaced. src-tauri/src/main.rs clears the inherited canonical key and forwards either the native key or a non-secret error to the sidecar. The Windows keyring backend is enabled. Source inspection does not prove the customer's credential backend persists between native launches.

The existing native acceptance harness is guarded for a disposable CI keychain and the ignored production-key test would access the real StarNet service entry. Neither was invoked. No isolated Windows standard-user acceptance account was established as available, and creating one was out of scope. Disk pressure also ruled out a new native build/installer campaign.

Required next evidence: exact customer artifact/version and program-file integrity; whether the same OS account and native key entry are used on both launches; non-secret native key availability/error and connectorStorage reason on each launch; whether sign-in was acknowledged saved versus connected; controlled read/write/quit timing. Never request or log the key or token. Use a disposable pre-existing Windows test account/profile and synthetic connector credentials for future native launch/relaunch acceptance. Preserve original sealed files and recovery copies; do not reset the customer store to manufacture success.

## Separate startup incident 85f602c4

The Windows 0.13.2 package-startup gap remains open. This host's read-only installation evidence was version 0.13.1 with nonempty shell.js (89,158 bytes); it is not the customer's installation. Exact public 0.13.2 package bytes were not downloaded or extracted because no trusted NSIS-capable extractor was found. Artifact preflight and host evidence remain under .dogfood/installation-integrity-85f602c4/. This credential patch does not resolve that acceptance gap.
