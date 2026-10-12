---
fingerprint: 0db3e69c
slug: gpu-loss-replaces-authored-props-with-legacy-art
title: GPU loss replaces authored props with legacy art and disables floor recovery
surface: world
severity: P1
status: open
found: 2026-10-12
lane: agent/qwen-render-loss-1012
fix:
origin: owner
report: Owner screenshots and chat report, 2026-10-12 00:00 EDT
affected: Windows installed 0.13.1; source reproduced at a20ffa71f
family: local-memory-graphics-recovery
installer: unverified
recovery: unconfirmed
---

# GPU loss replaces authored props with legacy art and disables floor recovery

## Symptom

After talking to a Qwen3 8B agent, the owner saw missing floor/wall surfaces, props switching to older artwork, LINK DOWN and a failed chat. Both supplied screenshots show the graphics failure on the Windows installed app.

## Repro

1. Start the isolated seeded app and wait for authored props to load.
2. Clear a prepared prop body canvas and dispatch its contextlost event. On the original renderer, PropRemaster.draw returns false indefinitely; PropSprites routes that result to the old procedural painter.
3. Separately inject InvalidStateError into a floor-probe read, then clear the station bake. The original watchdog permanently sets probeOff and never repairs the floor.
4. Run test/prop-recovery-live.e2e.test.mjs with STARNET_REPRO_BASELINE=a20ffa71f for the controlled old-renderer live reproduction; omit the variable to test the candidate. This uses loopback app/CDP fault injection, not real GPU exhaustion.

## Evidence

Owner screenshots dated 2026-10-12 00:00:26 and 00:00:55 EDT. Local runtime audit correlated Ollama allocation errors, Windows Resource-Exhaustion-Detector Event 2004 at 00:00:05, WebView GPU-process exit, and sidecar restart at 00:00:10. Internal session-recommendation work had loaded Llama 3.1 8B immediately before the Qwen request. This supports resource pressure as the incident trigger; the controlled regression isolates the subsequent rendering defect without reproducing a driver crash.

Old-renderer live proof: authored prop alpha 128578 before loss; immediately after loss and after waiting, draw=false and alpha=0. Final candidate bb380c047 live proof: alpha 75029 before/immediately after/after recovery; draw=true (the first loaded view in this run was a supply cart). Loss dispatch and immediate paint run in one synchronous browser evaluation, with lost=1 proving the retained CPU pixels rendered before asynchronous recovery. Afterwards lost=0 and recovering=0 prove reconstruction finished. Floor watchdog has a valid occupied-tile probe, probeOff=false and blank=false; zero uncaught exceptions. Logs are retained in the owning lane's .dogfood/render-baseline.log and .dogfood/graphics-gate-composition-final.log. The live test waits up to 15 seconds for actual recovered floor pixels; a fixed 1.5-second sleep was insufficient under concurrent software-rendering gate load.

Machine-checkable anchors: test/prop-remaster-recovery.test.js, test/projection-depth-rendering.test.js, test/prop-recovery-live.e2e.test.mjs. The source defect was the permanent `if(e.lost)return false` path and blanket `probeOff = true` exception handling.

## Verdict

Source repair verified by focused pixel tests and the live isolated app; all 209 HTTP gate steps also pass. Release integration remains blocked on refreshing the combined candidate's source audit and completing its gate. Previously loaded authored bodies have bounded CPU recovery pixels, retain geometry/picking, and rebuild derived caches through four concurrent jobs. Global floor recovery includes props; temporary probe errors recreate the readback surface. Explicit Ollama allocation failures are terminal instead of repeatedly retrying a resource failure. Classic review and saved custom-footprint compatibility remain intentional; this change removes permanent legacy substitution after graphics loss.

No installer was rebuilt or installed, and the owner has not retested the repaired binary. No claim of customer recovery or general prevention of GPU/OS memory exhaustion is made. Local model residency, internal recommendation model competition and memory-aware context sizing remain separate gaps.

## Regression

Before: all six original real-canvas lifecycle cases fail, and the live original renderer loses authored pixels permanently. After: thirteen real-canvas lifecycle cases and the real seeded-app check pass. They include pure status overlays/idle screen state and six service/content/machine composition-allocation cases. The additional six independently failed on 74c8e0ff2, then passed after bc5ed0c6e guarded CPU composition and retained-body fallback; these are supported alternate modes, not a proven cause of the default-art incident. Floor regressions cover transient readback failure, later loss, failed probe registration, blank rebuild, sparse healthy layouts, and permanent taint. Ollama regression covers HTTP, stream and compatible fallback memory errors reaching the actual agent loop after one POST without retry waits; hosted errors retain existing retry behavior.

Full-gate and source handoff details: qa/digests/2026-10-12-qwen-render-loss.md. The fast gate stops at the release-source audit because the three changed frontend modules differ from its saved source lock. The integration owner must refresh final-candidate evidence and rerun the complete gate; targeted green results do not override that requirement.


## Sibling coverage

{
  "adapters": [
    {"target":"native Ollama and its compatible fallback","state":"covered","test":"test/provider.ollama-native.test.js","scenario":"explicit allocation failures terminate HTTP and streaming execution without retries","gate":"fast"},
    {"target":"other model providers","state":"not-applicable","reason":"Canvas repair is provider-independent; hosted retry behavior is intentionally preserved and no hosted allocation policy is changed."}
  ],
  "entrypoints": [
    {"target":"individual prop context event and global cache loss","state":"covered","test":"test/prop-remaster-recovery.test.js","scenario":"individual and silent global loss preserve authored pixels and reconstruct entries","gate":"fast"},
    {"target":"live seeded station","state":"covered","test":"test/prop-recovery-live.e2e.test.mjs","scenario":"prepared prop loss and floor loss recover on the same page","gate":"fast"}
  ],
  "displays": [
    {"target":"authored props, picking and occupied floor","state":"covered","test":"test/prop-remaster-recovery.test.js","scenario":"same authored pixels and immutable geometry/picking through repair","gate":"fast"},
    {"target":"local memory error recovery action","state":"covered","test":"test/friendlyerror.test.js","scenario":"local memory failure explains cause and opens model picker rather than retry","gate":"fast"},
    {"target":"actual Windows WebView driver reset and Mac hardware","state":"blocked","reason":"Only controlled canvas-loss injection is exercised here; exact installed binaries and hardware reset acceptance remain with the release lane."}
  ],
  "lifecycle": [
    {"target":"repeated resets, failed decode and runtime replacement","state":"covered","test":"test/prop-remaster-recovery.test.js","scenario":"bounded queue/memory, later retry, stale replacement rejection and blank rebuild rejection","gate":"fast"},
    {"target":"floor probe recovery and sparse layouts","state":"covered","test":"test/projection-depth-rendering.test.js","scenario":"temporary readback errors remain recoverable and healthy sparse floors do not rebake repeatedly","gate":"fast"},
    {"target":"installed update/restart and owner recovery","state":"blocked","reason":"The installed 0.13.1 application is unchanged; this source repair requires a rebuilt binary and owner retest."}
  ]
}

