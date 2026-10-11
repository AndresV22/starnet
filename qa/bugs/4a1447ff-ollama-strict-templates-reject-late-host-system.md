---
fingerprint: 4a1447ff
slug: ollama-strict-templates-reject-late-host-system
title: Ollama strict templates reject late host system messages
surface: providers
severity: P1
status: fixed
found: 2026-10-11
lane: agent/provider-triage-1011
fix: d3e708cb0
origin: customer
report: https://github.com/androoAGI/starnet/issues/102
affected: StarNet 0.13.1 Windows; qwen38-27b:latest via Ollama in WSL2
family: local-provider-system-projection
installer: unverified
recovery: unconfirmed
---

# Ollama strict templates reject late host system messages

## Symptom

The customer reports an Ollama Qwen conversation failing with a Jinja template error that a system message must be at the beginning. A continuation after tool-shaped prose can trigger this even when the initial model call succeeds.

## Repro

1. Run `node test/ollama-system.e2e.test.js`. It launches the actual `dev/seed.js --keep` sidecar with an isolated profile/workspace and a local deterministic Ollama HTTP fixture; no provider account is required.
2. The model first emits a tool call as prose. The real host appends its `<tool_markup>` SYSTEM nudge, then requests another turn. The fixture enforces one leading SYSTEM slot on both native `/api/chat` and compatible `/v1/chat/completions`.
3. Before the fix, the request roles are `[system,user,assistant,system]` and the run ends `error`. After the fix, the host nudge shares the leading SYSTEM slot, the real `fs_read` executes, and a final answer reports `FILE_EVIDENCE_102`.

The bounded fixture returns HTTP 400 for the template refusal so it does not spend time retrying. The customer's HTTP 500 status is not claimed as a live upstream reproduction; the rejected message shape is the causal input under test.

## Evidence

- `sidecar/providers/openai-compatible.js:481` applies the Ollama profile's wire projection before sending and context sizing. The profile survives a native-route 404 fallback. Generic compatible providers keep their existing role policy.
- `sidecar/providers/ollama-native.js:53` projects only existing SYSTEM messages, preserving their original relative order and authority. It does not move user/tool bytes into SYSTEM, demote host instructions into USER, reorder non-system messages, or mutate durable history.
- Before fix, `test/provider.ollama-system.test.js` failed `one system message on native turn 0`, actual 4 versus expected 1.
- Before fix, seeded run `d72c70fb-0f54-4666-bb6a-64caa3363b2c` ended `error` with the strict-template rejection and roles `[system,user,assistant,system]`.
- After fix, `test/ollama-system.e2e.test.js` passed native run `db6a23d8-b5b9-4e4b-80d7-d421e2a354b4` and fallback run `449808cf-9380-4fcb-9758-38c3f1a2012a`: each made three model requests, executed real `fs_read`, emitted the final evidence token and cost telemetry, and correlated `/api/diagnostics` with its run ID. No process-level errors were observed; the test terminated its own seeded process tree.
- Focused sibling suites passed: `test/provider.ollama-native.test.js` (80), `test/provider.openai-compatible.test.js` (104), `test/text-toolcall-markup.test.js` (18), and `test/provider.registry.test.js` (148). Both new suites and production files passed syntax checks.
- Cross-branch reconciliation found no existing #102 fix. The related factory profile change in commit `9aace0349` opts custom Ollama endpoints into `nativeOllama`; this repair consumes that same profile flag and does not edit the factory or duplicate the delegation lane.

## Verdict

The source defect is fixed and verified through the real seeded host with a deterministic provider. Native Ollama and its persistent compatible fallback now send host SYSTEM instructions in the leading slot that strict templates require. No actual Qwen weights, WSL2 endpoint, installed artifact, or customer retest was exercised. Source verification does not establish installer or customer recovery. The integration lane owns the combined fast/http gates and eventual merge; this branch has not been published.

## Regression

`test/provider.ollama-system.test.js` fails before the fix with four SYSTEM messages and passes afterward for native, persistent compatible fallback, untouched generic adapter behavior, multipart SYSTEM content, tool pairing, authority boundaries, and transcript immutability. `test/ollama-system.e2e.test.js` fails before the fix when the real host appends its continuation nudge and passes afterward on both wire paths through final answer and diagnostics. Tests are registered in `test/fast.list` and `test/http.list` respectively.

## Sibling coverage

{
  "adapters": [
    {"target":"Ollama native and persistent compatible fallback","state":"covered","test":"test/provider.ollama-system.test.js","scenario":"Two requests per adapter preserve one leading SYSTEM slot, system order, tool pairing, multipart content and history immutability","gate":"fast"},
    {"target":"generic OpenAI-compatible provider","state":"covered","test":"test/provider.ollama-system.test.js","scenario":"A Qwen model name alone does not change the generic provider role contract","gate":"fast"},
    {"target":"custom endpoint classified as Ollama by concurrent factory change","state":"blocked","reason":"Factory profile detection in 9aace0349 belongs to the concurrent delegation lane. This repair uses its nativeOllama flag, but that unmerged combination has not been run here."},
    {"target":"actual Qwen in Ollama on WSL2","state":"blocked","reason":"The customer's model weights and endpoint are unavailable. The seeded source test uses a deterministic strict-template HTTP fixture."}
  ],
  "entrypoints": [
    {"target":"seeded sidecar internal task with host continuation","state":"covered","test":"test/ollama-system.e2e.test.js","scenario":"POST /api/run with prose-tool correction, real fs_read, final response and correlated diagnostics on both wire paths","gate":"http"},
    {"target":"compaction and steering SYSTEM messages","state":"covered","test":"test/provider.ollama-system.test.js","scenario":"Adapter projection includes representative summary, steering and continuation SYSTEM messages in original order","gate":"fast"},
    {"target":"scheduled and delegated runs","state":"blocked","reason":"These share the provider projection but their full orchestration paths were not exercised by this narrowly scoped reproduction."}
  ],
  "displays": [
    {"target":"actual installed Windows UI","state":"blocked","reason":"No exact installer was tested. The seeded API run proves provider and tool behavior, not the desktop presentation or reporter recovery."},
    {"target":"run diagnostics and usage events","state":"covered","test":"test/ollama-system.e2e.test.js","scenario":"A completed run emits cost telemetry and /api/diagnostics identifies the same run ID","gate":"http"}
  ],
  "lifecycle": [
    {"target":"native-to-compatible fallback retained across calls","state":"covered","test":"test/provider.ollama-system.test.js","scenario":"A native 404 disables subsequent native requests without losing SYSTEM projection on the second compatible call","gate":"fast"},
    {"target":"durable conversation history","state":"covered","test":"test/provider.ollama-system.test.js","scenario":"Projection is transient and leaves input message values and ordinary message object identity unchanged","gate":"fast"},
    {"target":"restart and resume from persisted session","state":"blocked","reason":"No persistence format changes; a restarted stored customer conversation was not available or exercised."}
  ]
}
