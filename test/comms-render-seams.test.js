/* node test/comms-render-seams.test.js — COMMS never shows machine syntax or harness chatter (rc walk 2026-10-14).

   A live walk on a real model (claude-haiku-4.5, Ask mode) found six seams in what COMMS draws. This file pins the ones
   that are not already pinned beside their engines (the marker grammar lives in fork.test.js, the marker-ended reply and
   the nudge wording in continuation-guard.test.js):
   A. THE BRIEF GATE'S PAUSE: a consequential call made before the Task Brief settles is HELD by the host and did not run.
      It drew a red "✗ team.dispatch failed" chip. The host stamps one shared summary (fork.js TaskIntent.GATE_HELD) and every
      surface draws that call as not-run: neutral chip, no red world pulse, no failed desk step. A station SETTING
      (station.control — group.add brought "MY READ" cards and the red chip) is setup like team.summon, never held.
   chat.js is browser-flow (DOM + streaming), not node-loadable, so — like comms-presence.test.js — its DOM-layer invariants
   are read from the source; the pure halves are executed. */
'use strict';
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const Fork = require('../frontend/app/fork.js');
const TaskIntent = Fork.TaskIntent;
const Policy = require('../sidecar/taskbrief-policy.js');
const { makeRegistry } = require('../sidecar/tools/registry.js');
const { makeStationControlTools } = require('../sidecar/tools/builtin/station-control.js');

/* ---------- A. the brief gate's pause is neutral, never a failure ---------- */
{
  const held = { isError: true, ok: false, summary: TaskIntent.GATE_HELD };
  A.ok(TaskIntent.isGateHeld(held), 'the host-stamped held result is recognised');
  A.ok(!TaskIntent.isGateHeld({ isError: true, summary: 'error' }), 'an ordinary failure is not a held call');
  A.ok(!TaskIntent.isGateHeld({ isError: false, summary: TaskIntent.GATE_HELD }), 'a success never reads as held');
  A.ok(/not run yet/.test(TaskIntent.GATE_HELD), 'the held summary says the call did not run: ' + TaskIntent.GATE_HELD);

  const idx = read('sidecar/index.js');
  const gate = /if \(!gate\.ok\) return \{[^\n]*\};/.exec(idx);
  A.ok(gate && /summary: TaskIntent\.GATE_HELD/.test(gate[0]), 'the host gate stamps the shared held summary (one source of truth)');
  A.ok(gate && /nothing ran/.test(gate[0]) && /do not mention the gate in your reply/.test(gate[0]), 'and tells the model nothing ran and not to narrate the gate');
  A.ok(gate && /isError: true/.test(gate[0]), 'the result stays an error for the model (the call really did not run)');

  const chat = read('frontend/app/chat.js');
  const rc = /function resolveChip\(ev, fallbackName\) \{[\s\S]*?\n  \}/.exec(chat);
  A.ok(rc && /TaskIntent\.isGateHeld\(ev\)/.test(rc[0]), 'resolveChip reads the held stamp');
  A.ok(rc && /classList\.add\(heldCall \? 'held' : ev\.isError \? 'err' : 'ok'\)/.test(rc[0]), 'a held call draws the neutral .held chip, never .err');
  A.ok(rc && /heldCall \? 'not run yet'/.test(rc[0]) && !/heldCall \? '✗'/.test(rc[0]), 'its stat reads "not run yet", never ✗ failed');
  A.ok(/U\.bus\.emit\('agent\.tool_result', \{[^\n]*held: !!\(typeof TaskIntent !== 'undefined' && TaskIntent\.isGateHeld && TaskIntent\.isGateHeld\(ev\)\)/.test(chat), 'the bus copy carries held for the world');
  A.ok(/if \(tgt && !p\.held\) PropSprites\.pulseProp/.test(read('frontend/app/world.js')), 'the world never pulses a prop red for a call that did not run');
  A.ok(/s\.ok = \(typeof TaskIntent !== 'undefined' && TaskIntent\.isGateHeld && TaskIntent\.isGateHeld\(p\)\) \? null/.test(read('frontend/app/deskscreen.js')), 'the desk screen records no outcome (not a failed step)');
  const css = read('frontend/css/comms.css');
  A.ok(/\.tool-chip\.held \.tc-glyph,\s*\n\.tool-chip\.held \.tc-stat\s*\{ color: var\(--ph-dim\); \}/.test(css), 'the held chip is plain dim phosphor (no red)');

  // a station setting is setup, not the deliverable: station.control passes an unsettled brief; station.power still waits
  const reg = makeRegistry();
  makeStationControlTools({ station: { request: async () => ({ ok: true }) }, route: async () => ({ status: 200, json: { ok: true } }), surface: 'interactive' }).register(reg);
  A.eq(Policy.canMutate({ status: 'ready' }, reg.get('station.control')).ok, true, 'station.control (group.add, rename…) is never held behind the Task Brief');
  A.eq(Policy.canMutate({ status: 'ready' }, reg.get('station.power')).ok, false, 'station.power (an escalation) still waits for brief_proceed');
}

A.report('comms-render-seams.test');
