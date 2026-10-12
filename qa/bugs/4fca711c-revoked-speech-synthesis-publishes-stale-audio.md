---
fingerprint: 4fca711c
slug: revoked-speech-synthesis-publishes-stale-audio
title: Revoked or replaced speech synthesis can publish stale audio
surface: voice
severity: P2
status: fixed
found: 2026-10-11
lane: agent/runtime-triage-1011
fix: 1d1a89980717271a2dbbc627088dca2f1c25c1ba
origin: audit
---

# Revoked or replaced speech synthesis can publish stale audio

## Symptom

A first speech chunk still synthesizing could complete after device forget or a newer reply, resurrecting revoked audio or replacing the newer reply. A later in-flight chunk could continue obsolete work after its owner disappeared.

## Repro

1. Run test/remote-voice-ownership.test.js with controlled synthesis promises.
2. Start speech A, then forget its device or admit speech B before A first chunk resolves.
3. Resolve or reject A after B completes, then query both reply IDs.
4. Repeat revocation/replacement while a later chunk is pending, and with an expired first chunk.
5. The old source publishes stale replies and starts further synthesis for abandoned work.

## Evidence

The full new regression replayed against a20ffa71f:sidecar/remote/voice.js fails 9 assertions and passes 19. On the fixed source it passes all 28. Ownership is now installed before the first await at sidecar/remote/voice.js:372, checked again after every synthesis await, and cleared by forget at line 422. The root integration lane additionally ran existing test/remote-voice.test.js on dc891445d with its installed codec dependency: 103 assertions passed. This was a deterministic module/codec check, not physical device playback. Evidence and lifecycle limits: qa/evidence/runtime-sweep-2026-10-11/coverage.json.

## Verdict

Late first or subsequent completion/rejection cannot publish over a newer owner, resurrect forgotten audio, or start another sentence for the abandoned reply. A provider request already in flight cannot be retroactively cancelled or unbilled by this module; the repair prevents later publication and additional synthesis calls. Paired physical-device playback, native audio and installer acceptance remain unverified.
