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

/* ---------- B. *italic* renders as italics in COMMS and group replies (one renderer: Chat.renderProse) ---------- */
{
  const src = read('frontend/app/chat.js');
  const extract = name => { const m = new RegExp('(  function ' + name + '\\([\\s\\S]*?\\n  \\})').exec(src); A.ok(m, 'chat.js defines ' + name + '()'); return m[1]; };
  const esc = /const HTML_ESC = \{[^}]*\};/.exec(src);
  // eslint-disable-next-line no-new-func
  const reportInline = new Function(esc[0] + '\n' + extract('escapeHtml') + '\n' + extract('linkify') + '\n' + extract('hostOf') + '\n'
    + extract('linkHostNote') + '\n' + extract('reportInline') + '\nreturn reportInline;')();
  A.eq(reportInline('- Lean on *speed* first'), '- Lean on <span class="md-i">speed</span> first', 'a single-asterisk word is italic, not raw');
  A.eq(reportInline('what a developer actually *does* with it'), 'what a developer actually <span class="md-i">does</span> with it', 'the walk\'s "*does*" renders italic');
  A.eq(reportInline('*Run* it twice'), '<span class="md-i">Run</span> it twice', 'italic at the start of a line');
  A.eq(reportInline('a *two word* phrase'), 'a <span class="md-i">two word</span> phrase', 'an italic phrase');
  A.ok(reportInline('**bold** and *soft*').includes('<span class="md-b">bold</span> and <span class="md-i">soft</span>'), 'bold and italic side by side');
  A.eq(reportInline('2*3*4 = 24'), '2*3*4 = 24', 'arithmetic keeps its asterisks (no word may open an italic)');
  A.eq(reportInline('5 * 3 * 2'), '5 * 3 * 2', 'spaced asterisks are not italics');
  A.eq(reportInline('glob *.js and *.md'), 'glob *.js and *.md', 'a glob is not italic (its close is followed by a word or nothing closes it)');
  A.eq(reportInline('*<b>x</b>*'), '<span class="md-i">&lt;b&gt;x&lt;/b&gt;</span>', 'italic text stays HTML-escaped');
  A.ok(/\\\*\[\^\\s\*\]\[\^\*\\n\]\*\\\*/.test(/const MD_MARKERS = (\/.*\/m);/.exec(src)[1]), 'the fast path sees *italic* (a reply with only italics still takes the markdown pass)');
  A.ok(/\.cmsg \.body \.md-i \{ font-style: italic; \}/.test(read('frontend/css/comms.css')), 'the italic span slants');
  A.ok(/Chat\.renderProse\(body, content/.test(read('frontend/app/group-chat.js')), 'group replies render through the same Chat.renderProse');
}

/* ---------- C. the goal-arc Dialogue never takes over COMMS while a delivery lands; its edit key has one ✎ ---------- */
{
  const src = read('frontend/app/chat.js');
  const dl = /function deliveryLanding\(runId\) \{[\s\S]*?\n  \}/.exec(src);
  A.ok(dl, 'chat.js defines deliveryLanding()');
  // execute it against stub run records
  const RUN = new Map(), WORK = new Map();
  // eslint-disable-next-line no-new-func
  const deliveryLanding = new Function('runMeta', 'runWork', dl[0] + '\nreturn deliveryLanding;')(id => RUN.get(id) || null, WORK);
  RUN.set('chat', { isTask: false }); WORK.set('chat', { toolsOk: 0, delivered: 0 });
  RUN.set('file', { isTask: true }); WORK.set('file', { toolsOk: 2, delivered: 1 });
  RUN.set('crew', { isTask: true, delegated: true }); WORK.set('crew', { toolsOk: 1, delivered: 0 });
  A.eq(deliveryLanding('chat'), false, 'a reply with nothing new to look at is a free moment for the arc');
  A.eq(deliveryLanding('file'), true, 'a run that delivered a file is a delivery landing');
  A.eq(deliveryLanding('crew'), true, 'a run whose crew handed results back is a delivery landing');
  A.eq(deliveryLanding('handback'), true, 'a run this page did not start (a background worker\'s hand-back) is a delivery landing');
  const ac = /function arcCandidate\(runId\) \{[\s\S]*?\n  \}/.exec(src);
  A.ok(ac && /if \(deliveryLanding\(runId\)\) return null;\s*\n[\s\S]*return \{ kind: 'arc', dim: 'goals', why:/.test(ac[0]), 'the arc Dialogue stands down on a delivery landing');
  A.ok(ac && ac[0].indexOf('deliveryLanding') > ac[0].indexOf('if (arcSeen(runId)) return null;'), 'standing down never spends the run\'s arc token (it is offered again at the next run end)');
  A.ok(/if \(!ev\.isError && \/\^\(\?:team\[\._\]dispatch\|group\[\._\]handoff\)\$\/\.test\(nm\)\) \{ const rm = runMeta\(thisRunId\); if \(rm\) rm\.delegated = true; \}/.test(src), 'a run that handed work to crew is marked delegated');
  A.ok(/customLabel: 'edit the milestones'/.test(src) && !/customLabel: '✎/.test(src), 'the arc edit key carries no ✎ of its own (Dialogue draws one: it read "✎✎")');
  A.ok(/num\.textContent = '✎';/.test(read('frontend/app/dialogue.js')), 'Dialogue draws the ✎ for every custom key');
}

A.report('comms-render-seams.test');
