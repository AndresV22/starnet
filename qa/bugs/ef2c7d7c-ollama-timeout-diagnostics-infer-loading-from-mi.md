---
fingerprint: ef2c7d7c
slug: ollama-timeout-diagnostics-infer-loading-from-mi
title: Ollama timeout diagnostics infer loading from missing status
surface: providers
severity: P2
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: e91f3231e
origin: audit
report: https://github.com/androoAGI/starnet/issues/99
affected: Source candidate 9f7ab4b4c; synthetic Windows loopback Ollama fixture
family: local-provider-diagnostic-truth
installer: unverified
recovery: unconfirmed
---

# Ollama timeout diagnostics infer loading from missing status

## Symptom

A native Ollama request that times out before response headers can report that the model was loading from disk solely because `/api/ps` did not list it. A listed model was also described as still reading the prompt. Neither inference stage follows from placement metadata. This audit finding was exposed while investigating #99; it does not establish the cause of that customer's stalled run.

## Repro

1. Run `node test/provider.ollama-native.test.js`. Its production adapter fixture never resolves `/api/chat`, rejects with the real connect-guard abort reason, and returns `{"models":[]}` from `/api/ps`.
2. The request times out after the shortened 30 ms connect window. Before the repair, the diagnostic asserted `so it was still loading the model from disk`, although this fixture has no model or loading operation.
3. Check a populated placement row separately: reported CPU/GPU/window facts remain useful, but do not prove prompt-reading progress.

## Evidence

- `sidecar/providers/ollama-native.js:249` is the shared `placementNote` diagnostic. The repair retains the observed missing-model status and explicitly qualifies loading as a possibility. For listed models it reports placement plus no response, not an inferred inference stage.
- The changed `test/provider.ollama-native.test.js` failed six assertions against the old source, then passed all 87 assertions after the repair. It exercises both the pure diagnostic and an actual production-adapter connect timeout, including unchanged timeout classification and phase.
- An isolated local HTTP probe used the production loop and native adapter, real local sockets, synthetic messages, no provider credentials, and no model process. The original receipt on 9f7ab4b4c recorded the false disk-loading claim. The repeat on e91f3231e asserts the corrected message: `was not listed as loaded when its status was checked. It may still be loading, but this status does not establish why no response arrived.`
- Repeat receipt: no headers, seven requests, terminal `error` / `timeout`, 3099 ms with connect=200 ms; headers then silence, two requests, terminal `error` / `provider_stalled`, 263 ms with idle=120 ms; explicit cancellation before headers, one request, terminal `cancelled`, 78 ms. Every outstanding request closed before fixture cleanup.
- Loop backoffs were injected as immediate while their requested durations were recorded; the adapter's initial 400/1200 ms backoffs remained real. The no-header schedule requested additional 4000/10000/30000/60000 ms loop waits. A 36.76-minute production projection is arithmetic, not a measured long run or proof of #99's cause.
- The small sanitized receipts were handed to the integration lane as `.investigation/issue99-connect-silence.json` and `.investigation/issue99-connect-silence.after.json` in the provider-triage-1011 worktree. The registered provider regression and the observations above are the durable evidence; local receipt paths are supplementary.
- Pending Claude commit 9aace0349 changes custom Ollama endpoint classification in the factory and its own test case, not this diagnostic. No overlapping placement repair was found. The lane merged ddd4cbcfa before editing; current stop and memory behavior was retained.

## Verdict

The source diagnostic now distinguishes observed placement from an unproven timeout cause, as required by `docs/STARNET_BEHAVIOR_CONTRACT.md` and the truthful-state law. Retry limits, cancellation, provider routing, loaded-placement data and persistence are unchanged. Full aggregate gates belong to the integration lane. No installed artifact, actual Ollama model or customer recovery was verified; issue #99 remains an open investigation.

## Regression

`test/provider.ollama-native.test.js`, already registered in `test/fast.list`, proves that an absent status row cannot assert disk loading and a loaded row cannot assert prompt reading. Its adapter fixture preserves phase `connect` and classification `timeout`. The real loopback replay confirms unchanged seven-connect/two-idle/one-cancel behavior with corrected terminal text.

## Sibling coverage

{
  "adapters": [{"target":"native Ollama diagnostic","state":"covered","test":"test/provider.ollama-native.test.js","scenario":"Missing model and populated CPU/GPU placement retain observed facts without asserting loading or prompt-reading progress","gate":"fast"}],
  "entrypoints": [{"target":"production adapter connect timeout","state":"covered","test":"test/provider.ollama-native.test.js","scenario":"No-header request with empty /api/ps reports uncertainty while keeping connect phase and timeout classification","gate":"fast"}],
  "displays": [{"target":"COMMS and installed desktop rendering","state":"blocked","reason":"The local replay verified emitted terminal text, not an installed UI. No actual installer or customer station was available."}],
  "lifecycle": [{"target":"retry and cancel","state":"blocked","reason":"The short unregistered loopback probe observed unchanged seven-connect/two-idle/one-cancel behavior; no new lifecycle gate was registered for this wording-only repair."}]
}
